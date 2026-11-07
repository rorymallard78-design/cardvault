'use strict';
(function(){
const root=document.getElementById('pulse-root');if(!root||typeof PULSE==='undefined')return;
const oldRender=pulseRender;
const iconChart='<svg viewBox="0 0 24 24"><path d="M3 20h18M5 16l5-5 4 3 5-8M15 6h4v4"/></svg>';
const iconCal='<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 18h3"/></svg>';
const tile=(url,name,sub,visual)=>'<a class="pulse-hub-tile" href="'+url+'" target="_blank" rel="noopener noreferrer"><div class="pulse-hub-visual '+(visual==='chart'?'pulse-hub-graphic':visual==='calendar'?'pulse-hub-calendar':'')+'">'+(visual==='chart'?'<span class="pulse-graphic-icon">'+iconChart+'</span>':visual==='calendar'?'<span class="pulse-graphic-icon">'+iconCal+'</span>':'<span class="pulse-graphic-icon" style="font-size:20px;font-weight:900;letter-spacing:-1px">'+visual+'</span>')+'</div><div class="pulse-hub-text"><b>'+name+' ↗</b><small>'+sub+'</small></div></a>';
root.innerHTML='<section class="pulse-panel"><h3 class="pulse-section-title">News &amp; Trends</h3><p class="pulse-section-sub">Hobby news, card releases and product updates.</p><div class="pulse-hub-grid">'+
tile('https://www.topps.com/blog','Topps News','Product news and previews','TOPPS')+
tile('https://blog.paniniamerica.net/','Panini News','Announcements and previews','PANINI')+
tile('https://www.sportscollectorsdaily.com/','Hobby Headlines','Industry news and trends','chart')+
'<button class="pulse-hub-tile" id="pulse-jump" type="button"><div class="pulse-hub-visual pulse-hub-calendar"><span class="pulse-graphic-icon">'+iconCal+'</span></div><div class="pulse-hub-text"><b>Release Calendar ↓</b><small>Box drops and presales</small></div></button></div><div class="pulse-small-links"><a target="_blank" rel="noopener noreferrer" href="https://www.cardboardconnection.com/">Product guides and checklists ↗</a></div></section>'+
'<section class="pulse-panel" id="pulse-calendar-section"><div class="pulse-cal-header"><div><h3 class="pulse-section-title">Release Calendar</h3><p class="pulse-section-sub">Upcoming Topps and Panini boxes and presales.</p></div><span class="pulse-snapshot" id="pulse-asof"></span></div>'+
'<div class="pulse-metrics"><div class="pulse-metric"><strong id="pulse-upcoming-count">–</strong><span>Upcoming</span></div><div class="pulse-metric"><strong id="pulse-watch-count">–</strong><span>Watching</span></div><div class="pulse-metric"><strong id="pulse-week-count">–</strong><span>Next 7 days</span></div></div>'+
'<div class="pulse-tools"><button type="button" id="pulse-refresh" class="btn-sm gold">↻ Refresh calendar</button><button type="button" id="pulse-new" class="btn-sm">+ Track a release</button></div>'+
'<div class="pulse-chips">'+['All','Topps','Panini','Watching'].map(v=>'<button class="pulse-chip" type="button" data-pulse-filter="'+v+'">'+v+'</button>').join('')+'</div>'+
'<div class="pulse-window-chips">'+['All dates','This week','Next 30 days'].map(v=>'<button class="pulse-window" type="button" data-pulse-window="'+v+'">'+v+'</button>').join('')+'</div>'+
'<input class="form-input pulse-search" id="pulse-search" placeholder="Search boxes, sets or sports…">'+
'<label class="pulse-archive"><input type="checkbox" id="pulse-archive"> Include older releases</label><div id="pulse-results" class="pulse-result-list"></div><p id="pulse-summary" class="pulse-summary-line"></p>'+
'<div class="pulse-small-links"><a target="_blank" rel="noopener noreferrer" href="https://www.topps.com/release-calendar">Topps calendar ↗</a><a target="_blank" rel="noopener noreferrer" href="https://www.paniniamerica.net/coming-soon.html">Panini coming soon ↗</a></div>'+
'<p class="pulse-footnote">Dates stay visible 14 days after release. Refresh reloads CardVault’s published snapshot, not a live feed. Always verify with the publisher.</p></section>';
PULSE.window='All dates';
pulseRender=function(){
const today=pulseDayNumber(pulseLocalDay()),all=pulseEntries(),term=(document.getElementById('pulse-search').value||'').toLowerCase(),archive=document.getElementById('pulse-archive').checked;
const up=all.filter(x=>x.date&&pulseDayNumber(x.date)>=today);
document.getElementById('pulse-upcoming-count').textContent=up.length;
document.getElementById('pulse-watch-count').textContent=all.filter(x=>PULSE.watch.includes(x.id)).length;
document.getElementById('pulse-week-count').textContent=up.filter(x=>pulseDayNumber(x.date)-today<=7).length;
document.getElementById('pulse-asof').textContent=PULSE.asOf?'Updated '+pulseReadableDate(PULSE.asOf):'Loading';
document.querySelectorAll('[data-pulse-filter]').forEach(b=>b.classList.toggle('active',b.dataset.pulseFilter===PULSE.filter));
document.querySelectorAll('[data-pulse-window]').forEach(b=>b.classList.toggle('active',b.dataset.pulseWindow===PULSE.window));
const items=all.filter(e=>{const n=e.date?pulseDayNumber(e.date):null,delta=n===null?null:n-today;return (archive||delta===null||delta>=-14)&&(PULSE.filter==='All'||(PULSE.filter==='Watching'?PULSE.watch.includes(e.id):PULSE.filter===e.brand))&&(PULSE.window==='All dates'||(delta!==null&&delta>=0&&delta<=(PULSE.window==='This week'?7:30)))&&(!term||[e.title,e.brand,e.sport,e.type,e.notes].join(' ').toLowerCase().includes(term))});
items.sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||a.title.localeCompare(b.title));
document.getElementById('pulse-summary').textContent=items.length+' visible releases · Source snapshot '+(PULSE.asOf||'loading');
document.getElementById('pulse-results').innerHTML=items.length?items.map(e=>{const n=e.date?pulseDayNumber(e.date):null,d=n===null?null:new Date(n*86400000),expanded=PULSE.expanded===e.id,watched=PULSE.watch.includes(e.id),custom=String(e.id).startsWith('personal-');return '<article class="pulse-event'+(n!==null&&n<today?' pulse-past':'')+'"><div class="pulse-event-layout"><div class="pulse-date-badge"><small>'+(d?d.toLocaleDateString('en-US',{month:'short',timeZone:'UTC'}).toUpperCase():'TBA')+'</small><strong>'+(d?String(d.getUTCDate()).padStart(2,'0'):'–')+'</strong></div><div class="pulse-event-main"><div class="pulse-event-top"><span class="pulse-brand">'+pulseEscape(e.brand)+'</span><span class="pulse-type">'+pulseEscape(e.type||'Release')+'</span></div><button class="pulse-expand" type="button" data-pulse-act="expand" data-pulse-id="'+pulseEscape(e.id)+'" aria-expanded="'+expanded+'"><span>'+pulseEscape(e.title)+'</span><span class="pulse-chevron">'+(expanded?'⌃':'⌄')+'</span></button><div class="pulse-meta">'+pulseEscape(e.sport||'Other')+' · '+pulseEscape(pulseDateStatus(e,today))+(e.time?' · '+pulseEscape(e.time):'')+'</div></div><button type="button" class="pulse-watch'+(watched?' active':'')+'" data-pulse-act="watch" data-pulse-id="'+pulseEscape(e.id)+'" aria-label="'+(watched?'Unwatch':'Watch')+'" aria-pressed="'+watched+'">'+(watched?'★':'☆')+'</button></div>'+(expanded?'<div class="pulse-expanded"><b>Release details</b><div>'+pulseEscape(e.brand)+' · '+pulseEscape(e.sport||'Other')+' · '+pulseEscape(e.type||'Release')+'</div><div>'+pulseEscape(pulseReadableDate(e.date))+(e.time?' at '+pulseEscape(e.time):'')+'</div>'+(e.notes?'<p>'+pulseEscape(e.notes)+'</p>':'')+'<p>Release dates may change. Check publisher before buying.</p></div>':'')+'<div class="pulse-event-footer">'+(pulseValidURL(e.url)?'<a class="pulse-source" href="'+pulseEscape(e.url)+'" target="_blank" rel="noopener noreferrer">Publisher / source ↗</a>':'')+(custom?'<button type="button" class="btn-sm" data-pulse-act="edit" data-pulse-id="'+pulseEscape(e.id)+'">Edit</button><button type="button" class="btn-sm" data-pulse-act="delete" data-pulse-id="'+pulseEscape(e.id)+'">Remove</button>':'')+'</div></article>'}).join(''):'<div class="empty"><div class="empty-icon">📅</div><div class="empty-title">No releases match</div><div class="empty-sub">Try other filters or add a release.</div></div>';
};
document.getElementById('pulse-refresh').addEventListener('click',pulseRefresh);
document.getElementById('pulse-new').addEventListener('click',()=>pulseEditor(''));
document.getElementById('pulse-search').addEventListener('input',pulseRender);
document.getElementById('pulse-archive').addEventListener('change',pulseRender);
document.getElementById('pulse-jump').addEventListener('click',()=>document.getElementById('pulse-calendar-section').scrollIntoView({behavior:'smooth'}));
root.addEventListener('click',event=>{const b=event.target.closest('button[data-pulse-window]');if(b){PULSE.window=b.dataset.pulseWindow;pulseRender()}});
pulseRender();
})();