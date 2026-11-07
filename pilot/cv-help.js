// CardVault Help Center — self-contained, no external dependencies or network calls.
// Uses static content so it works on the web and within future native app wrappers.
(function () {
  'use strict';
  if (document.getElementById('cv-help-overlay')) return;
  const faq = [
    { id:'first',title:'Getting started',items:[
      ['Add your first card','Tap + and choose Take Photo, Upload Photo, or Manual Entry. Review every field before saving. AI identification requires an API key or an active beta invitation.'],
      ['Track what you paid','Record the actual purchase cost. Cards without known cost should be marked as unknown basis; a zero dollar figure is not automatically a free purchase.'],
      ['Update a market value','Open a card from Inventory to edit its estimated value. Values are your estimates and are not guaranteed sale prices.'],
      ['Record a sale','Open the card and choose Record Sale. Review sale price, cost basis, shipping, and any selling fees where available. Confirm that the sale appears in Sold Tracker.'],
      ['Install on your phone','Open CardVault in Chrome on Android or Safari on iPhone and use Add to Home Screen. Always open the same browser profile to access your locally saved collection.']
    ]},
    { id:'features',title:'What CardVault can do',items:[
      ['Dashboard and Inventory','See your collection, search by player or card, open photos, and review recorded cost versus estimated value.'],
      ['Sold Tracker and Insights','Track completed sales, compare results, and review trends in your recorded collection. Figures depend on the data you enter.'],
      ['Players and Chase Cards','Browse your collection by player and maintain a personal watchlist of cards you want to acquire.'],
      ['Grading Center','Track grading submissions and compare potential outcomes; grading recommendations are estimates, not guarantees.'],
      ['Hobby Pulse','See card-product release information and maintain a watchlist. Check official sources for release changes.'],
      ['Exports and backups','Export inventory and transactions as CSV, or export a complete backup including photos as JSON for future restoration.'],
      ['AI card identification','With an eligible AI connection, scan a card photo to prefill fields. Always verify year, set, parallel, numbering, and grade. Other AI services can incur separate charges.'],
      ['Share a collection','Create read-only collection links. Review selected cards and whether estimated values are included. Anyone possessing a share link may be able to view its contents.']
    ]},
    { id:'safety',title:'Keep your collection safe',items:[
      ['Where is my collection stored?','In this version, inventory and photos are stored locally in this browser on this device. There is no automatic cloud account backup or cross-device sync.'],
      ['What happens when I change phones?','On the old device: Settings → Data → Export Complete Backup (Including Photos). Save that JSON file somewhere secure. On the new device: Settings → Data → Restore from Backup, review the counts, and confirm. A restore replaces data already on that device.'],
      ['How often should I back up?','Export a full backup after major imports and significant sales activity, and before changing devices or clearing browser data. Keep at least one copy off the phone.'],
      ['Could I lose my records?','Yes. Clearing site data, removing a browser profile, phone loss, or storage failure can remove local records. The app cannot recover data without a separate backup.'],
      ['Should I include personal details?','Avoid entering addresses, account numbers, passwords, or other sensitive personal information in card notes. Don’t share full backup files publicly.'],
      ['What about my API key?','Legacy bring-your-own API keys are stored in this browser. Never share them. The invitation-based scanner is being moved to a backend so the owner’s secret key is not exposed to testers.']
    ]},
    { id:'plans',title:'Trial, AI scanning, and plans',items:[
      ['Does a beta invitation erase my cards after 50 scans?','No. The scan allowance only controls AI-assisted identification. Your local collection stays accessible, and manual entry continues to work.'],
      ['Can I keep using CardVault after beta?','The long-term plan is a free basic version plus an optional paid tier for AI and advanced features. Pricing and accounts are not active yet.'],
      ['Will my collection disappear if I do not subscribe?','The plan is to keep collections viewable and exportable, including after cancellation. We will not intentionally lock your previously entered data behind a payment.'],
      ['Is CardVault already on the App Store or Play Store?','No. The current release is a web app. App-store distribution is planned after beta and security testing.']
    ]}
  ];
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const overlay=document.createElement('div');
  overlay.id='cv-help-overlay';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-label','CardVault Help Center');
  overlay.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:9500;align-items:center;justify-content:center;padding:10px';
  overlay.innerHTML='<div style="width:min(650px,100%);max-height:92vh;display:flex;flex-direction:column;border-radius:15px;background:var(--bg2,#171723);border:1px solid var(--border2,#444);color:var(--text,#fff);font-family:inherit"><div style="display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid var(--border2,#444)"><div><strong style="font-size:19px">CardVault Help Center</strong><div style="color:var(--text2,#aaa);font-size:12px;margin-top:3px">Getting started · Features · FAQs · Backups</div></div><button type="button" id="cv-help-close" aria-label="Close help" style="background:transparent;color:inherit;border:1px solid var(--border2,#444);padding:8px 12px;border-radius:8px">✕</button></div><div id="cv-help-content" style="overflow-y:auto;padding:14px 16px 22px"><input type="search" id="cv-help-search" aria-label="Search help" placeholder="Search features or questions…" style="width:100%;padding:12px;border:1px solid var(--border2,#444);border-radius:9px;background:var(--bg3,#222);color:inherit;margin-bottom:14px"><div id="cv-help-sections"></div></div></div>';
  document.body.append(overlay);
  const sectionHost=overlay.querySelector('#cv-help-sections');
  const search=overlay.querySelector('#cv-help-search');
  function render() {
    const query=search.value.trim().toLowerCase();
    let total=0;
    sectionHost.innerHTML=faq.map(section=>{
      const items=section.items.filter(([q,a])=>!query || (q+' '+a+' '+section.title).toLowerCase().includes(query));
      total+=items.length;
      return items.length?'<section style="margin-bottom:20px"><h3 style="font-size:15px;color:var(--gold,#eab54b);margin:0 0 8px">'+esc(section.title)+'</h3>'+items.map(([q,a])=>'<details style="border:1px solid var(--border2,#444);border-radius:9px;margin:7px 0;padding:11px 12px"><summary style="cursor:pointer;font-weight:600;font-size:13px">'+esc(q)+'</summary><p style="font-size:13px;line-height:1.6;color:var(--text2,#ddd);margin:9px 0 0">'+esc(a)+'</p></details>').join('')+'</section>':'';
    }).join('') || '<p style="color:var(--text2,#aaa)">No help articles match that search.</p>';
  }
  search.addEventListener('input',render);
  function close() { overlay.style.display='none';document.body.style.overflow=''; }
  function open() { render();overlay.style.display='flex';document.body.style.overflow='hidden';search.focus(); }
  overlay.querySelector('#cv-help-close').addEventListener('click',close);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
  overlay.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  window.cvOpenHelp=open;
  const settings=document.getElementById('page-settings');
  if(settings){
    const panel=document.createElement('div');
    panel.className='setting-section';panel.id='cv-help-section';
    panel.innerHTML='<div class="setting-section-title">❓ Help &amp; Getting Started</div><div class="setting-box"><div class="setting-desc">New to CardVault? Learn its features, how to record sales, protect your collection, and use AI scans.</div><button type="button" class="btn btn-secondary" id="cv-help-settings-button" style="margin-top:10px">Open Help Center</button></div>';
    settings.insertBefore(panel,settings.firstChild);
    panel.querySelector('button').addEventListener('click',open);
    const docs=document.createElement('p');docs.style.cssText='font-size:13px;line-height:1.6;margin:12px 0 0';docs.innerHTML='<a href="start.html" target="_blank" rel="noopener noreferrer">Quick Setup Guide</a> · <a href="guide.html" target="_blank" rel="noopener noreferrer">Complete User Guide</a>';panel.append(docs);
  }
  const dash=document.getElementById('page-dash');
  if(dash){
    const button=document.createElement('button');
    button.textContent='❓ Help';button.type='button';button.className='btn-sm';button.style.margin='0 0 10px';
    button.addEventListener('click',open);
    const header=dash.querySelector('.sec-header');
    if(header)header.append(button);
  }
  // This module makes no changes to inventory, sales, photos, or localStorage.
  render();
})();
