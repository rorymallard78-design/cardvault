#!/usr/bin/env python3
"""Refresh CardVault's public release snapshot without a paid API.

Publisher failures preserve last-known dates. Dates remain informational and
are never guaranteed preorder or release commitments.
"""
import json
import re
import sys
import unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

TOPPS = 'https://www.topps.com/release-calendar'
PANINI = 'https://www.paniniamerica.net/coming-soon.html'
DEST = Path(__file__).resolve().parents[1] / 'beta' / 'cv-releases.json'
MONTHS = {m: i for i, m in enumerate(('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'), 1)}
DATE_LINE = re.compile(r'\b(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,\s*'
                       r'(?P<month>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+'
                       r'(?P<day>\d{1,2})(?:\s+at\s+(?P<time>\d{1,2}:\d{2}\s*[AP]M\s*UTC))?\s+'
                       r'(?P<title>.+)', re.I)


def fetch_html(url):
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; CardVaultReleaseCalendar/1.0; once daily)', 'Accept': 'text/html'})
    with urlopen(req, timeout=30) as response:
        body = response.read(4_000_001)
    if len(body) > 4_000_000:
        raise ValueError('publisher page exceeds size limit')
    return body.decode('utf-8', errors='replace')


def clean(value):
    return re.sub(r'\s+', ' ', str(value).replace('\u200b', ' ')).strip()


def key(title):
    title = unicodedata.normalize('NFKD', title.lower().replace('–', '-').replace('—', '-'))
    title = re.sub(r'\b(topps|panini)\b', '', title)
    return re.sub(r'[^a-z0-9]+', '', title)


def sport(title):
    s = title.lower()
    for needle, value in [('disney', 'Non-Sports'), ('star wars', 'Non-Sports'),
                          ('wwe', 'Wrestling'), ('ufc', 'MMA'), ('tennis', 'Tennis'),
                          ('formula 1', 'Racing'), ('racing', 'Racing'), ('nascar', 'Racing'),
                          ('fifa', 'Soccer'), ('uefa', 'Soccer'), ('bundesliga', 'Soccer'),
                          ('soccer', 'Soccer'), ('nwsl', 'Soccer'), ('football', 'Football'),
                          ('baseball', 'Baseball'), ('basketball', 'Basketball'),
                          ('wnba', 'Basketball'), ('hockey', 'Hockey'), ('nhl', 'Hockey'),
                          ('golf', 'Golf')]:
        if needle in s:
            return value
    return 'Other'


def slug(text):
    s = re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', text.lower())).strip('-')
    return s[:105]


def infer_year(month, day, today):
    candidate = date(today.year, month, day)
    if candidate < today - timedelta(days=45):
        return today.year + 1
    return today.year


def parse_topps(html, today):
    soup = BeautifulSoup(html, 'html.parser')
    results = {}
    for a in soup.find_all('a'):
        txt = clean(a.get_text(' ', strip=True))
        match = DATE_LINE.search(txt)
        if not match:
            continue
        month = MONTHS[match['month'][:3].title()]
        day = int(match['day'])
        year = infer_year(month, day, today)
        try:
            event_date = date(year, month, day).isoformat()
        except ValueError:
            continue
        title = clean(match['title'])
        title = re.sub(r'\s*(?:Notify me|Shop now)\s*$', '', title, flags=re.I)
        if len(title) < 8 or len(title) > 165:
            continue
        kind = 'Preorder' if re.search(r'pre[\s-]?order', txt, re.I) else 'Scheduled drop'
        event = dict(id='topps-'+slug(title)+'-'+('pre' if kind == 'Preorder' else 'drop'),
                     brand='Topps', title=title, sport=sport(title), date=event_date,
                     time=clean(match['time'] or ''), type=kind, url=TOPPS)
        results[(key(title), kind)] = event
    if len(results) < 3:
        raise ValueError('Too few Topps dates parsed; preserving previous snapshot')
    return list(results.values())


def parse_panini(html):
    soup = BeautifulSoup(html, 'html.parser')
    results = {}
    for line in soup.get_text('\n', strip=True).split('\n'):
        line = clean(line)
        if (len(line) < 25 or len(line) > 175 or 'Panini' not in line or
            not any(term in line.lower() for term in ('trading card box', 'box set', 'sparkle pack'))):
            continue
        if not re.search(r'(?:^|\s)(?:20\d\d(?:-\d\d)?\s+)?Panini\s', line, re.I):
            continue
        event = dict(id='panini-'+slug(line), brand='Panini', title=line, sport=sport(line),
                     date='', time='', type='Coming soon', url=PANINI)
        results[key(line)] = event
    if len(results) < 2:
        raise ValueError('Too few Panini products parsed; preserving previous snapshot')
    return list(results.values())


def merge(original, updates, today):
    existing = original.get('events', [])
    old_index = {(e.get('brand'), key(e.get('title', '')), e.get('type')): e for e in existing}
    combined = {}
    for item in existing:
        if item.get('brand') not in updates or (item.get('date') and
            today - timedelta(days=14) <= date.fromisoformat(item['date']) < today):
            combined[item['id']] = item
    for brand, events in updates.items():
        for event in events:
            old = old_index.get((brand, key(event['title']), event['type']))
            if old:
                event['id'] = old['id']
            combined[event['id']] = event
    return sorted(combined.values(), key=lambda e: (e.get('date') or '9999', e['brand'], e['title']))


def main():
    today = datetime.now(timezone.utc).date()
    current = json.loads(DEST.read_text(encoding='utf-8'))
    sources = current.get('sources', {})
    updates = {}
    for brand, address, parser in [('Topps', TOPPS, lambda body: parse_topps(body, today)),
                                   ('Panini', PANINI, parse_panini)]:
        try:
            items = parser(fetch_html(address))
            updates[brand] = items
            sources[brand] = {'lastVerified': today.isoformat(), 'url': address}
            print(f'{brand}: verified {len(items)} entries')
        except Exception as exc:
            print(f'{brand}: {exc} (kept last successful entries)', file=sys.stderr)
    if not updates:
        raise SystemExit('Both publishers failed; schedule unchanged')
    current['events'] = merge(current, updates, today)
    current['asOf'] = today.isoformat()
    current['sources'] = sources
    current['sourceNote'] = ('Publisher page summaries refreshed without a paid API. '
                             'Unconfirmed Panini products have no release date; confirm before buying.')
    DEST.write_text(json.dumps(current, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {len(current["events"])} events to {DEST}')


if __name__ == '__main__':
    main()
