'use strict';
// Durable beta-only restore journal. An interrupted restore is rolled back before the app loads.
const CV_RECOVERY_DB='cv_beta_restore_journal_db';
const CV_CARD_DB='cv_beta_photos_db';
const CV_RECEIPT_DB='cv_beta_receipt_photos_db';
const CV_RECOVERY_KEYS=[
 'cv_beta_inventory','cv_beta_sold','cv_beta_backup','cv_beta_backup_sold',
 'cv_beta_receipts','cv_beta_grading','cv_beta_photos'
];
function cvRecoveryOpen(dbName,storeName,primary=false){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(dbName,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(storeName))req.result.createObjectStore(storeName,primary?{keyPath:'id'}:{keyPath:'id'});};
  req.onerror=()=>reject(req.error||Error('Unable to open '+dbName));
  req.onblocked=()=>reject(Error('Database blocked: close other CardVault tabs and reopen'));
  req.onsuccess=()=>resolve(req.result);
 });
}
function cvRecoveryReadAll(db,storeName){
 return new Promise((resolve,reject)=>{
  let rows=[];
  const tx=db.transaction(storeName,'readonly');
  const req=tx.objectStore(storeName).getAll();
  req.onsuccess=()=>{rows=req.result||[];};
  tx.oncomplete=()=>resolve(rows);
  tx.onerror=()=>reject(tx.error||Error('Photo read failed'));
  tx.onabort=()=>reject(tx.error||Error('Photo read cancelled'));
 });
}
function cvRecoveryReadJournal(db){
 return new Promise((resolve,reject)=>{
  const req=db.transaction('journal','readonly').objectStore('journal').get('pending');
  req.onsuccess=()=>resolve(req.result||null);
  req.onerror=()=>reject(req.error||Error('Recovery checkpoint read failed'));
 });
}
function cvRecoveryWriteJournal(db,entry){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('journal','readwrite');
  tx.objectStore('journal').put(entry);
  tx.oncomplete=resolve;
  tx.onerror=()=>reject(tx.error||Error('Could not save recovery checkpoint'));
  tx.onabort=()=>reject(tx.error||Error('Recovery checkpoint transaction aborted'));
 });
}
function cvRecoveryDeleteJournal(db){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('journal','readwrite');
  tx.objectStore('journal').delete('pending');
  tx.oncomplete=resolve;
  tx.onerror=()=>reject(tx.error||Error('Could not finalize checkpoint'));
  tx.onabort=()=>reject(tx.error||Error('Checkpoint finalization aborted'));
 });
}
function cvRecoveryReplacePhotos(db,records){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('photos','readwrite'),store=tx.objectStore('photos');
  store.clear();
  for(const record of records)store.put(record);
  tx.oncomplete=resolve;
  tx.onerror=()=>reject(tx.error||Error('Could not restore photo store'));
  tx.onabort=()=>reject(tx.error||Error('Photo restore aborted'));
 });
}
function cvRecoverySnapshotLocal(){
 return Object.fromEntries(CV_RECOVERY_KEYS.map(key=>[key,localStorage.getItem(key)]));
}
function cvRecoveryRestoreLocal(values){
 // Rollback is retryable if a browser storage write fails.
 for(const key of CV_RECOVERY_KEYS){
  const value=Object.prototype.hasOwnProperty.call(values,key)?values[key]:null;
  if(value===null)localStorage.removeItem(key);
  else localStorage.setItem(key,value);
 }
}
async function cvRecoveryOpenAll(){
 const [journal,cards,receipts]=await Promise.all([
  cvRecoveryOpen(CV_RECOVERY_DB,'journal',true),
  cvRecoveryOpen(CV_CARD_DB,'photos'),
  cvRecoveryOpen(CV_RECEIPT_DB,'photos')
 ]);
 return {journal,cards,receipts};
}
async function cvRecoveryBegin(){
 const db=await cvRecoveryOpenAll();
 try{
  if(await cvRecoveryReadJournal(db.journal))throw Error('An interrupted restore needs recovery before another restore can start.');
  const [cards,receipts]=await Promise.all([cvRecoveryReadAll(db.cards,'photos'),cvRecoveryReadAll(db.receipts,'photos')]);
  const entry={id:'pending',version:1,createdAt:new Date().toISOString(),local:cvRecoverySnapshotLocal(),cards,receipts};
  // Do not touch current data until this IndexedDB transaction has completed successfully.
  await cvRecoveryWriteJournal(db.journal,entry);
 }finally{Object.values(db).forEach(x=>x.close());}
}
async function cvRecoveryCommit(){
 const db=await cvRecoveryOpen(CV_RECOVERY_DB,'journal',true);
 try{await cvRecoveryDeleteJournal(db);}
 finally{db.close();}
}
async function cvRecoveryRollback(){
 const db=await cvRecoveryOpenAll();
 try{
  const entry=await cvRecoveryReadJournal(db.journal);
  if(!entry)return false;
  if(entry.version!==1||!entry.local||!Array.isArray(entry.cards)||!Array.isArray(entry.receipts))throw Error('Recovery checkpoint is invalid; do not modify beta data.');
  await cvRecoveryReplacePhotos(db.cards,entry.cards);
  await cvRecoveryReplacePhotos(db.receipts,entry.receipts);
  cvRecoveryRestoreLocal(entry.local);
  // Only after everything has been restored can the journal be cleared.
  await cvRecoveryDeleteJournal(db.journal);
  return true;
 }finally{Object.values(db).forEach(x=>x.close());}
}
async function cvRecoveryStartup(){
 return cvRecoveryRollback();
}
