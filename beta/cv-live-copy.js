'use strict';
// Copy the existing live CardVault collection into beta without touching live data.
// Beta must remain isolated until the owner verifies the copied records.
const CV_LIVE_KEYS={inventory:'cv_inventory',sold:'cv_sold',backup:'cv_backup',backupSold:'cv_backup_sold'};
const CV_LIVE_DB='cv_photos_db';
let CVLiveCopy={busy:false,preview:null};
function cvLiveParse(key){
 const raw=localStorage.getItem(key);
 if(raw===null)return {present:false,items:[]};
 let value;
 try{value=JSON.parse(raw)}catch(e){throw Error('Live data "'+key+'" could not be read as JSON. Nothing was changed.');}
 if(!Array.isArray(value))throw Error('Live data "'+key+'" is not a card list.');
 return {present:true,items:value};
}
function cvLiveSafeItems(items,label){
 const ids=new Set();
 for(const item of items){
  if(!item||typeof item.player!=='string'||!item.player.trim())throw Error(label+' contains a record without a player.');
  const id=Number(item.id);
  if(!Number.isSafeInteger(id)||id<=0)throw Error(label+' contains an invalid record ID.');
  if(ids.has(id))throw Error(label+' contains duplicate record IDs. Resolve before copying.');
  ids.add(id);
 }
}
function cvLiveInspect(){
 const inv=cvLiveParse(CV_LIVE_KEYS.inventory),sold=cvLiveParse(CV_LIVE_KEYS.sold);
 if(!inv.present&&!sold.present)throw Error('No live CardVault records found in this browser. Open beta on the SAME phone and browser where you use the live app.');
 cvLiveSafeItems(inv.items,'Live inventory');cvLiveSafeItems(sold.items,'Live sales');
 const backupInv=cvLiveParse(CV_LIVE_KEYS.backup),backupSold=cvLiveParse(CV_LIVE_KEYS.backupSold);
 const invIDs=new Set(inv.items.map(x=>String(x.id))),soldIDs=new Set(sold.items.map(x=>String(x.cardId)));
 const missing=backupInv.items.filter(x=>x?.id!==undefined&&!invIDs.has(String(x.id))&&!soldIDs.has(String(x.id))).length;
 return {inventory:inv.items,sold:sold.items,backupCardsNotInRecords:missing,backupSales:backupSold.items.length};
}
function cvLiveShow(){
 const box=document.getElementById('cv-live-copy-status');if(!box)return;
 try{
  const data=cvLiveInspect();CVLiveCopy.preview=data;
  box.innerHTML='<p><b>Live app:</b> '+data.inventory.length+' inventory cards · '+data.sold.length+' sales.</p>'+
   '<p><b>Current beta:</b> '+inventory.length+' inventory cards · '+soldHistory.length+' sales.</p>'+
   (data.backupCardsNotInRecords?'<p style="color:var(--gold)">'+data.backupCardsNotInRecords+' card(s) appear only in an older live backup. They will NOT be imported automatically—they may have been sold or removed.</p>':'')+
   '<p style="font-size:12px;color:var(--text2);line-height:1.5">This copies your current live inventory, sales and associated card photos into beta. It REPLACES beta inventory and sales; existing beta Chase Cards, receipts, grading and release watches are preserved. The original live app remains untouched. Copying again will replace any newer beta inventory/sales changes.</p>'+
   '<p style="font-size:12px;color:var(--gold)">Before copying, export a Complete Backup of beta if you need to keep its current inventory/sales.</p>'+
   '<label class="form-label" for="cv-live-copy-confirm">Type COPY LIVE to confirm:</label>'+
   '<input id="cv-live-copy-confirm" class="form-input" autocomplete="off" autocapitalize="characters" placeholder="COPY LIVE">'+
   '<button type="button" class="btn btn-primary" id="cv-live-copy-btn" onclick="cvLiveExecute()">Copy Live Collection into Beta</button>';
 }catch(error){CVLiveCopy.preview=null;box.textContent=error.message;}
}
function cvLiveGetPhotos(){
 return new Promise((resolve,reject)=>{
  let req;
  try{req=indexedDB.open(CV_LIVE_DB)}catch(error){reject(error);return;}
  req.onerror=()=>reject(req.error||Error('Unable to read live photos'));
  req.onblocked=()=>reject(Error('Live photo database is blocked. Close other CardVault tabs.'));
  req.onsuccess=()=>{
   const db=req.result;
   if(!db.objectStoreNames.contains('photos')){db.close();resolve([]);return;}
   const tx=db.transaction('photos','readonly');
   const request=tx.objectStore('photos').getAll();
   let rows=[];
   request.onsuccess=()=>{rows=request.result||[]};
   tx.oncomplete=()=>{db.close();resolve(rows)};
   tx.onerror=()=>{db.close();reject(tx.error||Error('Live photos could not be read'))};
   tx.onabort=()=>{db.close();reject(tx.error||Error('Live photo read interrupted'))};
  };
 });
}
function cvLivePhotoID(raw){
 // The existing CardVault card detail view assumes numeric card IDs.
 const n=Number(raw);
 return Number.isSafeInteger(n)&&n>0?n:null;
}
function cvLiveBuildPhotos(rows,inv,sold){
 const photos=new Map();
 for(const row of rows){
  if(!row)continue;
  const id=cvLivePhotoID(row.id);
  if(id!==null&&typeof row.data==='string'&&row.data.startsWith('data:image/'))photos.set(id,row.data);
 }
 for(const item of inv){
  const id=cvLivePhotoID(item.id);
  if(id!==null&&typeof item.photo==='string'&&item.photo.startsWith('data:image/'))photos.set(id,item.photo);
 }
 for(const item of sold){
  const id=cvLivePhotoID(item.cardId);
  if(id!==null&&typeof item.photo==='string'&&item.photo.startsWith('data:image/'))photos.set(id,item.photo);
 }
 return photos;
}
function cvLiveCleanCard(c){
 const out={...c};
 delete out.photo;
 const cost=Number(out.cost);
 if(!out.basisStatus)out.basisStatus=Number.isFinite(cost)&&cost>0?'known':'unknown';
 if(out.needsPricing===undefined)out.needsPricing=!(Number(out.value)>0);
 return out;
}
function cvLiveCleanSale(c){
 const out={...c};
 if(out.cardId!=null)out.photoRef=out.cardId;
 if(typeof out.photo==='string'&&out.photo.startsWith('data:image/'))delete out.photo;
 return out;
}
function cvLivePutPhotos(photos){
 return openPhotoDB().then(db=>new Promise((resolve,reject)=>{
  const tx=db.transaction('photos','readwrite'),store=tx.objectStore('photos');
  // Remove stale beta inventory photos, or a numeric ID reused by live could
  // accidentally display the photo of an unrelated beta test card.
  // Keep chase images and all other nonnumeric photo keys.
  const keys=store.getAllKeys();
  keys.onsuccess=()=>{
   for(const key of keys.result||[]){
    if(typeof key==='number'||(typeof key==='string'&&/^\d+$/.test(key)))store.delete(key);
   }
   for(const [id,data] of photos)store.put({id,data});
  };
  keys.onerror=()=>{try{tx.abort()}catch(e){}};

  tx.oncomplete=resolve;
  tx.onerror=()=>reject(tx.error||Error('Card photo transfer failed'));
  tx.onabort=()=>reject(tx.error||Error('Card photo transfer aborted'));
 }));
}
async function cvLiveExecute(){
 if(CVLiveCopy.busy)return;
 const typed=document.getElementById('cv-live-copy-confirm')?.value.trim().toUpperCase();
 if(typed!=='COPY LIVE'){toast('Type COPY LIVE to confirm','error');return;}
 const status=document.getElementById('cv-live-copy-status');
 const btn=document.getElementById('cv-live-copy-btn');CVLiveCopy.busy=true;if(btn)btn.disabled=true;
 let journal=false;
 const priorInventory=inventory,priorSales=soldHistory;
 try{
  const source=cvLiveInspect(); // Re-read live records immediately before copying.
  if(!source.inventory.length&&!source.sold.length)throw Error('Live app is empty. There is nothing to copy.');
  const [rows]=await Promise.all([cvLiveGetPhotos()]);
  const photos=cvLiveBuildPhotos(rows,source.inventory,source.sold);
  const nextInventory=source.inventory.map(cvLiveCleanCard);
  const nextSales=source.sold.map(cvLiveCleanSale);
  const invJSON=JSON.stringify(nextInventory),soldJSON=JSON.stringify(nextSales);
  // Capture a durable rollback checkpoint (local records + both photo databases).
  await cvRecoveryBegin();journal=true;
  await cvLivePutPhotos(photos);
  localStorage.setItem(KEYS.sold,soldJSON);
  localStorage.setItem(KEYS.inv,invJSON);
  localStorage.setItem(KEYS.backup,soldJSON==='[]'&&invJSON==='[]'?'[]':invJSON);
  localStorage.setItem(KEYS.backupSold,soldJSON);
  // Confirm counts/readback before marking the transaction committed.
  if(JSON.parse(localStorage.getItem(KEYS.inv)||'null')?.length!==nextInventory.length||
     JSON.parse(localStorage.getItem(KEYS.sold)||'null')?.length!==nextSales.length){
     throw Error('The copied records could not be verified');
  }
  await cvRecoveryCommit();journal=false;
  inventory=nextInventory;soldHistory=nextSales;
  try{localStorage.setItem('cv_beta_last_live_copy',new Date().toISOString())}catch(e){console.warn('Copy completed without timestamp',e)}
  try{renderDash();renderInventory();renderSold();renderPlayers();updateHeader();}
  catch(e){console.error('Copy saved; display refresh needs reload',e)}
  if(status)status.innerHTML='<p style="color:var(--green)">Copy complete: '+inventory.length+' cards · '+soldHistory.length+' sales · '+photos.size+' available photos copied. Original live records are unchanged.</p><p>Check Inventory, Sold History and Financial Insights. Do not record new sales in both apps; they do not sync automatically.</p>';
  toast('Copied '+inventory.length+' cards and '+soldHistory.length+' sales into beta','success');
 }catch(error){
  console.error('Live-to-beta copy failed',error);
  let recovered=!journal;
  if(journal)try{recovered=await cvRecoveryRollback()}catch(rollbackError){console.error('Durable rollback remains pending',rollbackError);}
  inventory=priorInventory;soldHistory=priorSales;
  if(status)status.textContent=recovered?'Copy failed and beta data was restored: '+error.message:'Copy failed and recovery is pending. Close other CardVault tabs and reopen beta. DO NOT clear browser data. '+error.message;
  toast('Live copy failed; check recovery message','error');
 }finally{CVLiveCopy.busy=false;if(btn&&btn.isConnected)btn.disabled=false;}
}
function cvLiveInit(){
 const settings=document.getElementById('page-settings');
 if(!settings)return;
 const section=document.createElement('div');
 section.className='setting-section';section.id='cv-live-copy-section';
 section.innerHTML='<div class="setting-section-title">Transfer Your Live Collection</div>'+
 '<div class="setting-box"><div class="setting-desc">Use this once to bring your existing live CardVault cards, sales and photos into beta for the release test. Live CardVault stays unchanged.</div>'+
 '<button type="button" class="btn btn-secondary" onclick="cvLiveShow()">Review Live Collection Copy</button>'+
 '<div id="cv-live-copy-status" style="font-size:13px;line-height:1.55;margin-top:10px"></div></div>';
 const first=settings.querySelector('.setting-section');
 if(first)settings.insertBefore(section,first);else settings.append(section);
}
cvLiveInit();
