'use strict';
// Hobby Pulse release calendar: no paid API and no cross-origin scraping.
// Publisher snapshots live in cv-releases.json; user additions remain on-device.
var PULSE={events:[],custom:[],watch:[],asOf:'',filter:'All',loading:false};
const PULSE_CUSTOM_KEY='cv_beta_pulse_custom_v1',PULSE_WATCH_KEY='cv_beta_pulse_watch_v1';
function pulseRead(key){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[]}catch(e){return []}}
function pulseEscape(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function pulseValidURL(u){return /^https?:\/\/[^ ]+$/i.test(u||'')}
function pulseDayNumber(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||'')))return null;const a=s.split('-').map(Number),t=Date.UTC(a[0],a[1]-1,a[2]);return new Date(t).toISOString().slice(0,10)===s?Math.floor(t/86400000):null}
function pulseLocalDay(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function pulseReadableDate(s){if(!s)return 'Date TBA';const n=pulseDayNumber(s);if(n===null)return 'Date TBA';return new Date(n*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}
function pulseEntries(){const map=new Map();for(const e of PULSE.events.concat(PULSE.custom)){if(e&&e.id&&e.title)map.set(String(e.id),e)}return [...map.values()]}
function pulseDateStatus(e,today){if(!e.date)return 'Date not announced';const diff=pulseDayNumber(e.date)-today;if(diff>0)return diff===1?'Tomorrow':diff+' days away';if(diff===0)return 'Today';return e.type==='Preorder'?'Preorder opened '+(-diff)+'d ago':'Dropped '+(-diff)+'d ago'}
function pulseSaveLocal(){
 localStorage.setItem(PULSE_CUSTOM_KEY,JSON.stringify(PULSE.custom));
 localStorage.setItem(PULSE_WATCH_KEY,JSON.stringify(PULSE.watch));
}
function pulseRender(){
 const root=document.getElementById('pulse-results');if(!root)return;
 const today=pulseDayNumber(pulseLocalDay()),term=(document.getElementById('pulse-search')?.value||'').toLowerCase().trim(),archive=document.getElementById('pulse-archive')?.checked;
 const items=pulseEntries().filter(e=>{
  const days=e.date?today-pulseDayNumber(e.date):null;
  return (archive||days===null||days<=14)&&(PULSE.filter==='All'||(PULSE.filter==='Watching'?PULSE.watch.includes(e.id):PULSE.filter===e.brand))&&
    (!term||[e.title,e.sport,e.brand,e.type,e.notes].join(' ').toLowerCase().includes(term));
 });
 items.sort((a,b)=>(a.date&&b.date?a.date.localeCompare(b.date):a.date?-1:b.date?1:a.title.localeCompare(b.title))||a.title.localeCompare(b.title));
 document.querySelectorAll('[data-pulse-filter]').forEach(b=>b.classList.toggle('active',b.dataset.pulseFilter===PULSE.filter));
 const summary=document.getElementById('pulse-summary');
 if(summary)summary.textContent=items.length+' visible events · '+PULSE.watch.length+' watched · source snapshot '+(PULSE.asOf||'not yet loaded');
 root.innerHTML=items.length?items.map(e=>{
  const days=e.date?today-pulseDayNumber(e.date):null,old=days!==null&&days>0,watch=PULSE.watch.includes(e.id);
  const href=pulseValidURL(e.url)?'<a class="pulse-source" href="'+pulseEscape(e.url)+'" target="_blank" rel="noopener noreferrer">Publisher / source ↗</a>':'';
  const custom=String(e.id).startsWith('personal-');
  return '<article class="pulse-event'+(old?' pulse-past':'')+'">'+
   '<div class="pulse-event-top"><span class="pulse-brand">'+pulseEscape(e.brand)+'</span><span class="pulse-type">'+pulseEscape(e.type||'Release')+'</span><button type="button" class="pulse-watch'+(watch?' active':'')+'" data-pulse-act="watch" data-pulse-id="'+pulseEscape(e.id)+'" aria-label="'+(watch?'Unwatch':'Watch')+' release">'+(watch?'★':'☆')+'</button></div>'+
   '<div class="pulse-name">'+pulseEscape(e.title)+'</div>'+
   '<div class="pulse-date">'+pulseEscape(pulseReadableDate(e.date))+(e.time?' · '+pulseEscape(e.time):'')+'</div>'+
   '<div class="pulse-meta">'+pulseEscape(e.sport||'Other')+' · '+pulseEscape(pulseDateStatus(e,today))+'</div>'+
   (e.notes?'<div class="pulse-note">'+pulseEscape(e.notes)+'</div>':'')+
   '<div class="pulse-event-footer">'+href+(custom?'<button type="button" class="btn-sm" data-pulse-act="edit" data-pulse-id="'+pulseEscape(e.id)+'">Edit</button><button type="button" class="btn-sm" data-pulse-act="delete" data-pulse-id="'+pulseEscape(e.id)+'">Remove</button>':'')+'</div>'+
   '</article>';
 }).join(''):'<div class="empty"><div class="empty-icon">📅</div><div class="empty-title">No releases match</div><div class="empty-sub">Try another filter, show older events, or add a release to track.</div></div>';
}
function pulseFilterSet(name){PULSE.filter=name;pulseRender()}
async function pulseRefresh(){
 if(PULSE.loading)return;PULSE.loading=true;
 const button=document.getElementById('pulse-refresh');if(button){button.disabled=true;button.textContent='Checking…'}
 try{
  const r=await fetch('cv-releases.json?fresh='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  const feed=await r.json();if(!Array.isArray(feed.events)||typeof feed.asOf!=='string')throw Error('Invalid release feed');
  PULSE.events=feed.events.filter(e=>e&&typeof e.id==='string'&&typeof e.title==='string'&&['Topps','Panini'].includes(e.brand)&&(!e.date||pulseDayNumber(e.date)!==null)&&pulseValidURL(e.url));
  PULSE.asOf=feed.asOf;
  pulseRender();
 }catch(e){pulseRender();if(typeof toast==='function')toast('Could not refresh the published schedule. Existing dates were kept.','error')}
 finally{PULSE.loading=false;if(button){button.disabled=false;button.textContent='↻ Refresh calendar'}}
}
function pulseToggle(id){
 PULSE.watch=PULSE.watch.includes(id)?PULSE.watch.filter(x=>x!==id):[...PULSE.watch,id];
 try{pulseSaveLocal();pulseRender()}catch(e){toast('Could not save watch preference','error')}
}
function pulseEditor(id){
 const e=PULSE.custom.find(x=>x.id===id)||{id:'',title:'',brand:'Topps',sport:'Baseball',type:'Scheduled drop',date:'',time:'',notes:'',url:''};
 for(const field of ['id','title','brand','sport','type','date','time','notes','url']){const input=document.getElementById('pulse-'+field);if(input)input.value=e[field]||''}
 openModal('pulse-editor');
}
function pulseCommit(){
 const field=k=>document.getElementById('pulse-'+k).value.trim();
 const title=field('title'),date=field('date'),url=field('url');
 if(!title){toast('Enter a product or box name','error');return}
 if(date&&pulseDayNumber(date)===null){toast('Enter a valid release date','error');return}
 if(url&&!pulseValidURL(url)){toast('Source link must start with https://','error');return}
 const id=field('id')||'personal-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
 const e={id,title,date,url,brand:field('brand'),sport:field('sport'),type:field('type'),time:field('time'),notes:field('notes')};
 const before=PULSE.custom.slice();
 PULSE.custom=PULSE.custom.filter(x=>x.id!==id).concat(e);
 try{pulseSaveLocal();closeModal('pulse-editor');pulseRender();toast('Release saved on this device','success')}
 catch(err){PULSE.custom=before;toast('Release could not be saved','error')}
}
function pulseRemove(id){
 if(!confirm('Remove this custom release?'))return;
 const before=PULSE.custom.slice();
 PULSE.custom=PULSE.custom.filter(x=>x.id!==id);
 try{pulseSaveLocal();pulseRender();toast('Custom release removed','success')}
 catch(e){PULSE.custom=before;toast('Could not remove release','error')}
}
function pulseInit(){
 const root=document.getElementById('pulse-root');if(!root)return;
 PULSE.custom=pulseRead(PULSE_CUSTOM_KEY).filter(x=>x&&String(x.id||'').startsWith('personal-'));
 PULSE.watch=pulseRead(PULSE_WATCH_KEY);
 const css=document.createElement('style');
 css.textContent='.pulse-links{display:flex;gap:8px;flex-wrap:wrap;margin:9px 0 13px}.pulse-links a{padding:9px 10px;font-size:11px;font-weight:700;border:1px solid var(--border2);border-radius:9px;color:var(--blue);text-decoration:none}.pulse-about{font-size:11px;line-height:1.5;color:var(--text2);margin:7px 0 14px}.pulse-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:13px}.pulse-tools button{flex:1;min-width:120px}.pulse-chips{display:flex;overflow-x:auto;gap:6px;margin:12px 0}.pulse-chip{border:1px solid var(--border2);background:var(--bg3);border-radius:20px;padding:8px 12px;color:var(--text2);font-size:12px;flex-shrink:0}.pulse-chip.active{color:var(--gold);border-color:var(--gold);background:var(--gold-dim)}.pulse-search{width:100%;box-sizing:border-box}.pulse-archive{display:flex;align-items:center;gap:8px;color:var(--text2);font-size:11px;margin:10px 0 14px}.pulse-event{border:1px solid var(--border2);background:var(--bg2);border-radius:12px;padding:13px;margin:9px 0}.pulse-past{opacity:.76}.pulse-event-top{display:flex;align-items:center;gap:7px}.pulse-brand{font-size:11px;color:var(--gold);font-weight:700}.pulse-type{font-size:10px;border:1px solid var(--border2);border-radius:10px;padding:3px 7px;color:var(--text2)}.pulse-watch{margin-left:auto;background:transparent;color:var(--text2);border:0;font-size:25px;cursor:pointer;padding:0 7px}.pulse-watch.active{color:var(--gold)}.pulse-name{font-size:14px;font-weight:700;line-height:1.4;margin:8px 0}.pulse-date{font-size:13px;font-weight:700;color:var(--gold)}.pulse-meta,.pulse-note{font-size:11px;color:var(--text2);margin-top:6px;line-height:1.45}.pulse-event-footer{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;align-items:center}.pulse-source{font-size:11px;color:var(--blue);margin-right:auto}.pulse-count{font-size:11px;color:var(--muted);margin-top:10px}';
 document.head.append(css);
 root.innerHTML='<p class="pulse-about">Track announced Topps and Panini box drops, presales, and coming-soon products. Dates stay visible for 14 days afterward. ★ saves items to your watchlist.</p>'+
 '<div class="pulse-links"><a href="https://www.topps.com/release-calendar" target="_blank" rel="noopener noreferrer">Topps official calendar ↗</a><a href="https://www.paniniamerica.net/coming-soon.html" target="_blank" rel="noopener noreferrer">Panini coming soon ↗</a></div>'+
 '<div class="pulse-tools"><button type="button" id="pulse-refresh" class="btn-sm gold">↻ Refresh calendar</button><button type="button" id="pulse-new" class="btn-sm">+ Track a release</button></div>'+
 '<div class="pulse-chips">'+['All','Topps','Panini','Watching'].map(x=>'<button class="pulse-chip" type="button" data-pulse-filter="'+x+'">'+x+'</button>').join('')+'</div>'+
 '<input class="form-input pulse-search" id="pulse-search" placeholder="Find a set, sport, or box…">'+
 '<label class="pulse-archive"><input type="checkbox" id="pulse-archive"> Show older releases too</label>'+
 '<div id="pulse-results"></div><p id="pulse-summary" class="pulse-count"></p>'+
 '<p class="pulse-about">Refresh checks CardVault’s published schedule, not a paid API or a live publisher feed. New dates require the published schedule to be updated. The linked publisher pages are the authority, and dates can change. Your personal additions and ★ selections stay on this device.</p>';
 root.querySelector('#pulse-refresh').addEventListener('click',pulseRefresh);
 root.querySelector('#pulse-new').addEventListener('click',()=>pulseEditor(''));
 root.querySelector('#pulse-search').addEventListener('input',pulseRender);
 root.querySelector('#pulse-archive').addEventListener('change',pulseRender);
 root.addEventListener('click',event=>{
  const btn=event.target.closest('button[data-pulse-filter],button[data-pulse-act]');if(!btn||!root.contains(btn))return;
  if(btn.dataset.pulseFilter){pulseFilterSet(btn.dataset.pulseFilter);return}
  if(btn.dataset.pulseAct==='watch')pulseToggle(btn.dataset.pulseId);
  else if(btn.dataset.pulseAct==='edit')pulseEditor(btn.dataset.pulseId);
  else if(btn.dataset.pulseAct==='delete')pulseRemove(btn.dataset.pulseId);
 });
 const modal=document.createElement('div');modal.id='pulse-editor';modal.className='overlay';modal.style.zIndex='470';
 modal.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-header"><div class="sheet-title">Track a Release</div><button class="sheet-close" type="button" id="pulse-close">✕</button></div><div class="sheet-body">'+
 '<input type="hidden" id="pulse-id"><div class="form-group"><label class="form-label">Product / Box Name *</label><input class="form-input" id="pulse-title" placeholder="e.g. 2027 Topps Chrome Baseball"></div>'+
 '<div class="form-row"><div class="form-group"><label class="form-label">Manufacturer</label><select class="form-select" id="pulse-brand"><option>Topps</option><option>Panini</option></select></div><div class="form-group"><label class="form-label">Sport</label><select class="form-select" id="pulse-sport"><option>Baseball</option><option>Basketball</option><option>Football</option><option>Hockey</option><option>Soccer</option><option>Other</option><option>Non-Sports</option></select></div></div>'+
 '<div class="form-group"><label class="form-label">Event Type</label><select class="form-select" id="pulse-type"><option>Scheduled drop</option><option>Preorder</option><option>Coming soon</option></select></div>'+
 '<div class="form-row"><div class="form-group"><label class="form-label">Date (leave empty for TBA)</label><input class="form-input" type="date" id="pulse-date"></div><div class="form-group"><label class="form-label">Time / Time Zone</label><input class="form-input" id="pulse-time" placeholder="12:00 PM ET"></div></div>'+
 '<div class="form-group"><label class="form-label">Official Link</label><input class="form-input" type="url" id="pulse-url" placeholder="https://..."></div>'+
 '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="pulse-notes" rows="3"></textarea></div>'+
 '<button class="btn btn-primary" id="pulse-save" type="button">Save Release</button></div></div>';
 document.body.append(modal);
 modal.querySelector('#pulse-close').addEventListener('click',()=>closeModal('pulse-editor'));
 modal.querySelector('#pulse-save').addEventListener('click',pulseCommit);
 pulseRender();
 pulseRefresh();
}
pulseInit();
