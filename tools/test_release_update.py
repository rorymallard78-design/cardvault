import unittest
from datetime import date
from update_releases import parse_topps, parse_panini, merge

class CalendarTests(unittest.TestCase):
    def test_topps_preorders_and_dates(self):
        html = '''<a href="/pre">Pre-order Monday, Nov 2 at 5:00 PM UTC 2026 Topps Chrome Update Series Baseball</a>
        <a href="/x">Wednesday, Nov 4 at 5:00 PM UTC 2026 Topps Cosmic Chrome Baseball</a>
        <a href="/y">Friday, Nov 13 2026 Topps Midnight Football</a>'''
        a = parse_topps(html, date(2026, 10, 30))
        self.assertEqual(len(a), 3)
        self.assertEqual(next(x for x in a if 'Update' in x['title'])['type'], 'Preorder')
        self.assertEqual(next(x for x in a if 'Cosmic' in x['title'])['date'], '2026-11-04')

    def test_panini_undated(self):
        html = '<h3>2026 Panini Prizm WNBA Trading Card Box (Hobby)</h3><p>2026 Panini Crown Royale NWSL Trading Card Box (Hobby)</p>'
        a = parse_panini(html)
        self.assertEqual(len(a), 2)
        self.assertTrue(all(not x['date'] for x in a))

    def test_preserve_watch_id(self):
        old = {'events':[dict(id='old-watch',brand='Topps',title='2026 Topps Cosmic Chrome® Baseball',type='Scheduled drop',date='2026-11-04')]}
        fresh = [dict(id='new',brand='Topps',title='2026 Topps Cosmic Chrome Baseball',type='Scheduled drop',date='2026-11-05')]
        found = merge(old, {'Topps':fresh},date(2026,10,30))
        self.assertEqual(found[0]['id'],'old-watch')

    def test_preserve_recent_and_other_publisher(self):
        old={'events':[dict(id='yesterday',brand='Topps',title='Old Baseball',type='Scheduled drop',date='2026-10-29'),
                       dict(id='panini',brand='Panini',title='Panini Box',type='Coming soon',date='')]}
        self.assertEqual(len(merge(old,{'Topps':[]},date(2026,10,30))),2)

    def test_bad_pages_rejected(self):
        with self.assertRaises(ValueError): parse_topps('<html>blocked</html>',date(2026,10,30))
        with self.assertRaises(ValueError): parse_panini('<html>blocked</html>')

if __name__ == '__main__':
    unittest.main()
