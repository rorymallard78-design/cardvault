'use strict';
const CHASE_KEY='cv_beta_chase_v1';
let chaseItems=[];
const chasePhotoCache=new Map();let chasePhotoDraft=null,chasePhotoBusy=false;
function chasePhotoKey(id){return String(id||'').startsWith('chase-')?id:'chase-'+String(id||'')}
function chaseSafePhoto(url){return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(url||''))?url:''}
function chasePreview(url){
 const img=document.getElementById('chase-preview-img'),empty=document.getElementById('chase-preview-empty'),remove=document.getElementById('chase-photo-remove');
 if(!img||!empty||!remove)return;
 const photo=chaseSafePhoto(url);img.hidden=!photo;empty.hidden=!!photo;
 if(photo)img.src=photo;else img.removeAttribute('src');remove.disabled=!photo;
}
async function chaseLoadPhotos(){
 const ids=chaseItems.map(x=>x.id);
 for(const id of ids)try{
  const photo=chaseSafePhoto(await dbGetPhoto(chasePhotoKey(id)));if(photo)chasePhotoCache.set(id,photo);
 }catch(e){console.warn('Chase photo unavailable',id,e)}
 chaseDisplay();
}
async function chaseChoosePhoto(event){
 const file=event.target.files?.[0];event.target.value='';if(!file)return;
 if(!file.type.startsWith('image/')){toast('Select an image file','error');return}
 if(file.size>20*1024*1024){toast('Choose a photo smaller than 20 MB','error');return}
 chasePhotoBusy=true;const button=document.getElementById('chase-save');if(button)button.disabled=true;
 try{
  const raw=await readFileAsDataURL(file);
  const photo=chaseSafePhoto(await compressImage(raw,800,.7));
  if(!photo)throw Error('Could not process image; please use JPG, PNG, or WebP');
  chasePhotoDraft=photo;chasePreview(photo);
  toast('Photo ready — save Chase Card to keep it','success');
 }catch(e){toast(e.message||'Photo could not be added','error')}
 finally{chasePhotoBusy=false;if(button)button.disabled=false}
}
function chaseRemoveDraftPhoto(){chasePhotoDraft='REMOVE';chasePreview('')}

function chaseRead(){try{const a=JSON.parse(localStorage.getItem(CHASE_KEY)||'[]');return Array.isArray(a)?a:[]}catch(e){return []}}
function chaseSave(){localStorage.setItem(CHASE_KEY,JSON.stringify(chaseItems))}
function chaseEsc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function chaseMoney(s){s=String(s??'').trim();if(!s)return null;const n=Number(s.replace(/[$,]/g,''));if(!Number.isFinite(n)||n<0||n>100000000||Math.abs(n*100-Math.round(n*100))>.001)throw Error('Target price must be valid dollars and cents');return Math.round(n*100)/100}
function chaseDisplay(){
 const root=document.getElementById('chase-list');if(!root)return;
 const search=(document.getElementById('chase-search')?.value||'').toLowerCase(),category=document.getElementById('chase-filter')?.value||'All';
 const shown=chaseItems.filter(x=>(category==='All'||x.category===category)&&[x.name,x.details,x.notes].join(' ').toLowerCase().includes(search));
 const priority={High:0,Medium:1,Low:2};
 shown.sort((a,b)=>(priority[a.priority]??1)-(priority[b.priority]??1)||(b.updatedAt||'').localeCompare(a.updatedAt||''));
 document.getElementById('chase-count').textContent=chaseItems.length+' chase card'+(chaseItems.length===1?'':'s');
 root.innerHTML=shown.length?shown.map(x=>{const photo=chaseSafePhoto(chasePhotoCache.get(x.id));return '<div class="chase-card"><div class="chase-main"><div class="chase-photo">'+(photo?'<img src="'+chaseEsc(photo)+'" alt="Photo of '+chaseEsc(x.name)+'">':'<span>🃏</span>')+'</div><div class="chase-copy"><div class="chase-top"><b>'+chaseEsc(x.name)+'</b><span class="chase-priority">'+chaseEsc(x.priority)+'</span></div><div class="chase-meta">'+chaseEsc(x.category)+' · '+chaseEsc(x.details||'Details not specified')+'</div>'+(x.target!==null?'<div class="chase-target">Target: $'+Number(x.target).toFixed(2)+'</div>':'')+(x.notes?'<p class="chase-notes">'+chaseEsc(x.notes)+'</p>':'')+(x.url?'<a class="chase-link" target="_blank" rel="noopener noreferrer" href="'+chaseEsc(x.url)+'">Reference link ↗</a>':'')+'<div class="chase-actions"><button class="btn-sm" type="button" data-chase-action="edit" data-chase-id="'+chaseEsc(x.id)+'">Edit</button><button class="btn-sm" type="button" data-chase-action="remove" data-chase-id="'+chaseEsc(x.id)+'">Remove</button></div></div></div></div>'}).join(''):'<div class="empty"><div class="empty-icon">🎯</div><div class="empty-title">No Chase Cards</div><div class="empty-sub">Save cards you want to hunt, including non-sports.</div></div>';
}
async function chaseEdit(id){
 const x=chaseItems.find(v=>v.id===id)||{id:'',name:'',category:'',details:'',priority:'Medium',target:null,notes:'',url:''};
 document.getElementById('chase-id').value=x.id;
 for(const field of ['name','category','details','priority','notes','url'])document.getElementById('chase-'+field).value=x[field]||'';
 document.getElementById('chase-target').value=x.target??'';
 chasePhotoDraft=null;const input=document.getElementById('chase-photo-input');if(input)input.value='';
 chasePreview(chasePhotoCache.get(x.id)||'');openModal('chase-editor');
 if(x.id&&!chasePhotoCache.has(x.id))try{
  const photo=chaseSafePhoto(await dbGetPhoto(chasePhotoKey(x.id)));
  if(photo){chasePhotoCache.set(x.id,photo);if(document.getElementById('chase-id').value===x.id&&chasePhotoDraft===null)chasePreview(photo)}
 }catch(e){console.warn('Could not load chase photo',e)}
}
async function chaseCommit(){
 if(chasePhotoBusy)return;
 const button=document.getElementById('chase-save');if(button)button.disabled=true;
 try{
 const name=document.getElementById('chase-name').value.trim(),target=chaseMoney(document.getElementById('chase-target').value);
 const category=document.getElementById('chase-category').value;
 if(!category){toast('Select a sport or Non-Sports category','error');return;}
 if(!name){toast('Enter a card or character name','error');return}
 const url=document.getElementById('chase-url').value.trim();
 if(url&&!/^https?:\/\//i.test(url))throw Error('Reference link must start with https://');
 const id=document.getElementById('chase-id').value||'chase-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
 const old=chaseItems.find(x=>x.id===id);
 const item={id,name,category,details:document.getElementById('chase-details').value.trim(),priority:document.getElementById('chase-priority').value,target,notes:document.getElementById('chase-notes').value.trim(),url,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
 const previous=chaseItems,priorPhoto=chasePhotoCache.get(id)||null;let changedPhoto=false;
 try{
  if(chasePhotoDraft!==null){
   const key=chasePhotoKey(id);
   if(chasePhotoDraft==='REMOVE'){await dbDeletePhoto(key);chasePhotoCache.delete(id)}
   else{await dbSetPhoto(key,chasePhotoDraft);chasePhotoCache.set(id,chasePhotoDraft)}
   changedPhoto=true;
  }
  chaseItems=old?chaseItems.map(x=>x.id===id?item:x):[item,...chaseItems];
  chaseSave();
 }catch(e){
  chaseItems=previous;
  if(changedPhoto){
   try{if(priorPhoto)await dbSetPhoto(chasePhotoKey(id),priorPhoto);else await dbDeletePhoto(chasePhotoKey(id))}
   catch(restoreError){console.error('Chase photo rollback failed',restoreError)}
   if(priorPhoto)chasePhotoCache.set(id,priorPhoto);else chasePhotoCache.delete(id);
  }throw e;
 }
 chasePhotoDraft=null;closeModal('chase-editor');chaseDisplay();toast('Chase card saved','success');
 }catch(e){toast(e.message||'Could not save chase card','error')}
 finally{if(button)button.disabled=false}
}
async function chaseDelete(id){
 if(!confirm('Remove this card from the chase list?'))return;
 const prev=chaseItems;chaseItems=chaseItems.filter(x=>x.id!==id);
 try{chaseSave();chasePhotoCache.delete(id);chaseDisplay();toast('Removed from chase list','success');await dbDeletePhoto(chasePhotoKey(id))}catch(e){chaseItems=prev;chaseDisplay();toast('Could not remove card','error')}
}
function chaseExport(){
 const head=['Name','Category','Details','Priority','Target Price','Notes','Reference URL','Created At'];
 const quote=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,m=>"'"+m).replace(/"/g,'""')+'"';
 const csv=[head,...chaseItems.map(x=>[x.name,x.category,x.details,x.priority,x.target??'',x.notes,x.url,x.createdAt])].map(row=>row.map(quote).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='cardvault-chase-list.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function chaseInitialize(){
 chaseItems=chaseRead();
 const sheet=document.createElement('div');sheet.id='chase-editor';sheet.className='overlay';
 sheet.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-header"><div class="sheet-title">Chase Card</div><button class="sheet-close" onclick="closeModal(\'chase-editor\')">✕</button></div><div class="sheet-body"><input type="hidden" id="chase-id"><div class="form-group"><label class="form-label">Card / Player / Character *</label><input class="form-input" id="chase-name" placeholder="e.g., 1980 Bird / Magic RC"></div><div class="form-group"><label class="form-label">Category</label><select class="form-input" id="chase-category"><option value="">Select category...</option><option>Baseball</option><option>Basketball</option><option>Football</option><option>Hockey</option><option>Soccer</option><option>Other</option><option>Non-Sports</option><option value="Sports">Sports (older unsorted entry)</option></select></div><div class="form-group"><label class="form-label">Card Photo (optional)</label><div class="chase-photo-editor"><img id="chase-preview-img" alt="Card photo preview" hidden><div id="chase-preview-empty">🃏<div style="font-size:11px;margin-top:4px">No photo yet</div></div></div><input id="chase-photo-input" type="file" accept="image/*" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"><div class="chase-photo-actions"><button class="btn-sm gold" type="button" id="chase-photo-select">📷 Add / Replace Photo</button><button class="btn-sm" type="button" id="chase-photo-remove" disabled>Remove Photo</button></div><p class="chase-photo-hint">Photos stay on this device and are included in complete backups. No AI scan or API credits.</p></div><div class="form-group"><label class="form-label">Set / Year / Grade / Parallel</label><input class="form-input" id="chase-details" placeholder="Anything you know about the card"></div><div class="form-group"><label class="form-label">Priority</label><select class="form-input" id="chase-priority"><option>High</option><option selected>Medium</option><option>Low</option></select></div><div class="form-group"><label class="form-label">Target Buy Price ($, optional)</label><input class="form-input" type="number" step=".01" min="0" id="chase-target"></div><div class="form-group"><label class="form-label">Reference Link (optional)</label><input class="form-input" type="url" id="chase-url" placeholder="https://..."></div><div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" rows="3" id="chase-notes" placeholder="Why it interests you, max price, what to watch for..."></textarea></div><button class="btn btn-primary" type="button" id="chase-save">Save Chase Card</button></div></div>';
 document.body.append(sheet);
 const styles=document.createElement('style');
 styles.textContent='.chase-main{display:flex;gap:12px;align-items:flex-start}.chase-photo{flex:0 0 84px;width:84px;min-height:108px;border-radius:8px;overflow:hidden;background:var(--bg3);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:23px}.chase-photo img{display:block;width:84px;height:108px;object-fit:contain}.chase-copy{flex:1;min-width:0}.chase-top b{overflow-wrap:anywhere}.chase-photo-editor{height:165px;width:130px;display:flex;align-items:center;justify-content:center;background:var(--bg3);border-radius:9px;overflow:hidden;border:1px solid var(--border2);margin:8px 0}.chase-photo-editor img{width:100%;height:100%;object-fit:contain}.chase-photo-editor #chase-preview-empty{text-align:center;font-size:26px;color:var(--text2)}.chase-photo-editor [hidden]{display:none!important}.chase-photo-actions{display:flex;gap:8px;flex-wrap:wrap}.chase-photo-hint{font-size:11px;color:var(--text2);line-height:1.5;margin:7px 0 0}';
 document.head.append(styles);
 sheet.querySelector('#chase-photo-select').addEventListener('click',()=>document.getElementById('chase-photo-input').click());
 sheet.querySelector('#chase-photo-input').addEventListener('change',chaseChoosePhoto);
 sheet.querySelector('#chase-photo-remove').addEventListener('click',chaseRemoveDraftPhoto);
 sheet.querySelector('#chase-save').addEventListener('click',chaseCommit);
 const list=document.getElementById('chase-list');
 if(list)list.addEventListener('click',function(event){
  const button=event.target.closest('button[data-chase-action]');
  if(!button||!list.contains(button))return;
  event.preventDefault();
  if(button.dataset.chaseAction==='edit')chaseEdit(button.dataset.chaseId);
  if(button.dataset.chaseAction==='remove')chaseDelete(button.dataset.chaseId);
 });
 chaseDisplay();chaseLoadPhotos();
}
chaseInitialize();
