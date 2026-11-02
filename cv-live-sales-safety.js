'use strict';
// Production-only safety hotfix. This does not read or modify beta's storage.
const CVLIVE_SAFETY_DB='cv_live_sales_recovery_v1';
let cvLiveOriginalSnapshot=null,cvLiveCandidates=[];
function cvLiveStored(key){
 const text=localStorage.getItem(key);
 if(!text)return [];
 try{const a=JSON.parse(text);return Array.isArray(a)?a:[]}catch(e){return []}
}
function cvLiveSnapshotOnce(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(CVLIVE_SAFETY_DB,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('snapshot'))req.result.createObjectStore('snapshot',{keyPath:'id'});};
  req.onerror=()=>reject(req.error);
  req.onsuccess=()=>{
   const db=req.result;const tx=db.transaction('snapshot','readwrite');
   const store=tx.objectStore('snapshot');
   const get=store.get('before-hotfix');
   get.onsuccess=()=>{
    if(get.result){cvLiveOriginalSnapshot=get.result;return;}
    const record={id:'before-hotfix',createdAt:new Date().toISOString(),
      inventory:localStorage.getItem('cv_inventory'),
      sold:localStorage.getItem('cv_sold'),
      backup:localStorage.getItem('cv_backup'),
      backupSold:localStorage.getItem('cv_backup_sold')};
    store.put(record);cvLiveOriginalSnapshot=record;
   };
   tx.oncomplete=()=>{db.close();resolve(cvLiveOriginalSnapshot)};
   tx.onerror=()=>{db.close();reject(tx.error)};
  };
 });
}
async function cvLiveCompactSold(items){
 const result=[];
 for(const item of items){
  const s={...item};
  const photo=s.photo;
  if(typeof photo==='string'&&photo.startsWith('data:image/')){
   const ref=s.photoRef??s.cardId;
   if(ref!==null&&ref!==undefined&&ref!==''){
    await dbSetPhoto(ref,photo);
    s.photoRef=ref;delete s.photo;
   }
  }
  result.push(s);
 }
 return result;
}
window.confirmSale=async function(){
 const button=se('sale-confirm-btn');
 if(button?.disabled)return;
 let persisted=false;
 try{
  if(currentCardId==null){toast('Select a card before recording a sale','error');return}
  const card=inventory.find(c=>c.id===currentCardId);
  if(!card){toast('Card is not in inventory. Check Sold History first.','error');return}
  const value=String(se('sell-price')?.value??'').trim();
  const number=Number(value),cost=Number(card.cost||0);
  if(!value||!Number.isFinite(number)||number<=0||number>100000000||Math.abs(number*100-Math.round(number*100))>0.0001){
   toast('Enter a valid sale price in dollars and cents','error');return;
  }
  if(!Number.isFinite(cost)||cost<0){toast('Invalid card cost. Review before recording sale.','error');return}
  const date=se('sell-date')?.value||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('Select a valid sale date','error');return}
  if(button){button.disabled=true;button.textContent='Saving sale…'}
  if(typeof card.photo==='string'&&card.photo.startsWith('data:image/'))await dbSetPhoto(card.id,card.photo);
  const prevCompact=await cvLiveCompactSold(soldHistory);
  const price=Math.round(number*100)/100;
  const record={
   id:Math.max(Date.now(),soldHistory.reduce((n,c)=>Math.max(n,Number(c.id)||0),0)+1),
   cardId:card.id,player:card.player,sport:card.sport,year:card.year,
   team:card.team,set:card.set,cardNum:card.cardNum,variation:card.variation||'',
   printRun:card.printRun||'',condition:card.condition,grade:card.grade,
   certNumber:card.certNumber||'',cost,salePrice:price,
   pl:Math.round((price-cost)*100)/100,
   platform:se('sell-platform')?.value||'Other',dateSold:date,
   photoRef:card.id,basisStatus:card.basisStatus||undefined,gradingCosts:Number(card.gradingCosts||0)
  };
  const newSales=[record,...prevCompact];
  const newInventory=inventory.filter(c=>c.id!==card.id);
  const salesJSON=JSON.stringify(newSales);
  const invJSON=JSON.stringify(newInventory.map(c=>{const x={...c};delete x.photo;return x}));
  const priorSales=localStorage.getItem(KEYS.sold);
  let saleWritten=false;
  try{
   // This order is deliberate: never remove an inventory card if its sale fails to save.
   localStorage.setItem(KEYS.sold,salesJSON);saleWritten=true;
   localStorage.setItem(KEYS.inv,invJSON);
  }catch(writeError){
   if(saleWritten){
    try{if(priorSales===null)localStorage.removeItem(KEYS.sold);else localStorage.setItem(KEYS.sold,priorSales);}
    catch(rollbackError){
     console.error('Live CardVault sale rollback incomplete',rollbackError);
     toast('Storage error: check Sold History before retrying this card.','error');
     return;
    }
   }
   throw writeError;
  }
  persisted=true;
  soldHistory=newSales;inventory=newInventory;
  // Preserve the old cv_backup/cv_backup_sold keys for missing-card recovery.
  try{
   closeModal('modal-sell');closeModal('modal-detail');
   renderDash();renderInventory();renderSold();renderPlayers();updateHeader();showPage('sold');
   toast('Sale saved to Sold History','success');
  }catch(renderError){
   console.error('Sale saved but display failed',renderError);
   toast('Sale saved. Reopen Sold History to view it.','error');
  }
 }catch(error){
  console.error('Live CardVault sale failed',error);
  toast(persisted?'Sale saved; screen could not refresh':error?.name==='QuotaExceededError'?'Storage full. Sale was NOT recorded; card remains in inventory.':'Sale NOT recorded; inventory remains unchanged.','error');
 }finally{
  if(button&&button.isConnected){button.disabled=false;button.textContent='✅ Record Sale'}
 }
};
function cvLiveFindMissing(){
 const invIds=new Set(inventory.map(c=>String(c.id)));
 const soldIds=new Set(soldHistory.map(s=>String(s.cardId)));
 const soldEntryIds=new Set(soldHistory.map(s=>String(s.id)));
 const sources=[
  {tag:'Current backup',inv:cvLiveStored('cv_backup'),sales:cvLiveStored('cv_backup_sold')}
 ];
 if(cvLiveOriginalSnapshot){
  const parse=t=>{try{const x=JSON.parse(t||'[]');return Array.isArray(x)?x:[]}catch(e){return []}};
  sources.push({tag:'Initial safety snapshot',inv:parse(cvLiveOriginalSnapshot.backup),sales:parse(cvLiveOriginalSnapshot.backupSold)});
  sources.push({tag:'Initial inventory',inv:parse(cvLiveOriginalSnapshot.inventory),sales:parse(cvLiveOriginalSnapshot.sold)});
 }
 const seen=new Set(),out=[];
 for(const src of sources){
  for(const c of src.inv){
   if(c==null||c.id==null||typeof c.player!=='string')continue;
   const id=String(c.id);
   if(seen.has('inv:'+id)||invIds.has(id)||soldIds.has(id))continue;
   out.push({type:'inventory',source:src.tag,item:c});
   seen.add('inv:'+id);
  }
  for(const c of src.sales){
   if(c==null||c.id==null||typeof c.player!=='string')continue;
   const id=String(c.id);
   if(seen.has('sale:'+id)||soldEntryIds.has(id))continue;
   out.push({type:'sale',source:src.tag,item:c});
   seen.add('sale:'+id);
  }
 }
 return out;
}
window.cvLiveReviewRecovery=function(){
 cvLiveCandidates=cvLiveFindMissing();
 const root=se('cv-live-recovery-results');
 if(!root)return;
 if(!cvLiveCandidates.length){
  root.innerHTML='<p style="font-size:12px;color:var(--text2)">No unmatched records found in the available backups. Earlier sale prices that never saved cannot be recovered automatically.</p>';
  return;
 }
 root.innerHTML='<p style="font-size:12px;color:var(--gold);margin:10px 0">'+cvLiveCandidates.length+' possible missing record(s). Review carefully. Deleted cards may also appear here.</p>'+
 cvLiveCandidates.slice(0,100).map((r,i)=>{
  const c=r.item;
  return '<div style="border-bottom:1px solid var(--border);padding:10px 0;font-size:12px"><b>'+safe(c.player)+'</b> · '+safe(c.year||'')+' '+safe(c.set||'')+
  '<div style="color:var(--text2);margin:5px 0">'+(r.type==='sale'?'Saved sale from backup':'Card found only in backup')+' · '+safe(r.source)+' · '+fmt(r.type==='sale'?c.salePrice:c.cost)+'</div>'+
  '<button class="btn-sm gold" onclick="cvLiveRecoverRecord('+i+')">Restore '+(r.type==='sale'?'Sale':'Card')+'</button></div>';
 }).join('');
};
window.cvLiveRecoverRecord=async function(index){
 const candidate=cvLiveCandidates[index];
 if(!candidate)return;
 const item=candidate.item;
 const verb=candidate.type==='sale'?'Sold History':'Inventory';
 if(!confirm('Restore '+item.player+' into '+verb+'? Check carefully to avoid duplicate entries.'))return;
 try{
  if(candidate.type==='inventory'){
   if(inventory.some(c=>String(c.id)===String(item.id))||soldHistory.some(s=>String(s.cardId)===String(item.id))){
    toast('That card is already recorded','error');return;
   }
   const card={...item};
   if(card.photo&&card.photo.startsWith('data:image/'))await dbSetPhoto(card.id,card.photo);
   else card.photo=await dbGetPhoto(card.id);
   const next=[card,...inventory];
   localStorage.setItem(KEYS.inv,JSON.stringify(next.map(c=>{const x={...c};delete x.photo;return x})));
   inventory=next;
  }else{
   if(soldHistory.some(s=>String(s.id)===String(item.id))){toast('That sale is already recorded','error');return}
   const records=await cvLiveCompactSold([item,...soldHistory]);
   // Only restore a sales record here; do not silently remove an inventory card.
   // If the card is still in Inventory, tell the user to reconcile it manually.
   localStorage.setItem(KEYS.sold,JSON.stringify(records));
   soldHistory=records;
   if(inventory.some(c=>String(c.id)===String(item.cardId)))toast('Sale restored. Card also exists in Inventory; reconcile that duplicate.','error');
  }
  renderDash();renderInventory();renderSold();renderPlayers();updateHeader();
  cvLiveReviewRecovery();
  toast('Backup record restored. Check totals and card details.','success');
 }catch(error){console.error('CardVault recovery failed',error);toast('Restore failed; original records were not replaced.','error')}
};
window.cvLiveDownloadSnapshot=function(){
 try{
  const data={format:'CardVaultSaleSafetySnapshot',date:new Date().toISOString(),
   inventory:cvLiveStored(KEYS.inv),sold:cvLiveStored(KEYS.sold),
   backupInventory:cvLiveStored(KEYS.backup),backupSold:cvLiveStored(KEYS.backupSold),
   initialSafetySnapshot:cvLiveOriginalSnapshot};
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='cardvault-sales-recovery-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  toast('Recovery snapshot downloaded (card records only; no API keys)','success');
 }catch(error){console.error(error);toast('Download failed: '+error.message,'error')}
};
function cvLiveInitializeSafety(){
 const confirm=se('sell-price')?.closest('.sheet-body')?.querySelector('button[onclick="confirmSale()"]');
 if(confirm)confirm.id='sale-confirm-btn';
 const settings=se('page-settings');
 if(!settings)return;
 const section=document.createElement('div');
 section.className='setting-section';
 section.innerHTML='<div class="setting-section-title">🛟 Sales & Data Recovery</div>'+
 '<div class="setting-box"><div class="setting-desc">Before adding more sales, check for records that may have been left out after a previous storage error. Nothing is restored automatically.</div>'+
 '<button class="btn btn-secondary" onclick="cvLiveReviewRecovery()">Review Possible Missing Cards & Sales</button>'+
 '<button class="btn btn-secondary" onclick="cvLiveDownloadSnapshot()">Download Recovery Snapshot</button>'+
 '<div class="setting-desc" style="font-size:11px;margin:8px 0">Preserves existing backups. Recovery files contain card and sale details, but no stored API keys. Photo files remain on this device.</div>'+
 '<div id="cv-live-recovery-results"></div></div>';
 settings.append(section);
 cvLiveSnapshotOnce().catch(e=>console.warn('Could not retain initial safety snapshot',e));
}
cvLiveInitializeSafety();
