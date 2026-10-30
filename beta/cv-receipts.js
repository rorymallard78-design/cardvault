"use strict";
var CVR={storeKey:"",dbName:"",db:null,items:[],filter:"pending",photos:[],kind:"buy",activeId:null,editId:null,buyRows:[],saleReceipt:null};
function cvrStart(){
  CVR.storeKey=KEYS.inv.startsWith("cv_beta_")?"cv_beta_receipts":"cv_receipts";
  CVR.dbName=KEYS.inv.startsWith("cv_beta_")?"cv_beta_receipt_photos_db":"cv_receipt_photos_db";
  try{const data=JSON.parse(localStorage.getItem(CVR.storeKey)||"[]");CVR.items=Array.isArray(data)?data:[];}catch(e){CVR.items=[];console.error(e);}
  const css=document.createElement("style");
  css.textContent=".cvr-item{background:var(--bg2);border:1px solid var(--border2);border-radius:12px;padding:12px;margin-bottom:10px;display:flex;gap:12px;align-items:center;cursor:pointer}.cvr-thumb{width:64px;height:64px;border-radius:9px;object-fit:cover;background:var(--bg3);flex-shrink:0}.cvr-mini{font-size:11px;color:var(--text2);line-height:1.6}.cvr-flex{display:flex;gap:8px}.cvr-flex>*{flex:1;min-width:0}.cvr-photos{display:flex;gap:8px;overflow-x:auto;padding:10px 0}.cvr-photos img{height:100px;width:100px;object-fit:cover;border-radius:8px}.cvr-section{padding:10px;border:1px solid var(--border2);border-radius:10px;margin-bottom:10px}.cvr-good{color:var(--green)}.cvr-warn{color:var(--gold)}";
  document.head.append(css);
  const p=document.createElement("div");p.className="page";p.id="page-receipts";
  p.innerHTML='<div class="sec-header"><div><div class="sec-title">Receipts</div><div class="sec-sub">Capture now, process later</div></div><button class="btn-sm gold" onclick="cvrCapture()">+ New</button></div><div id="cvr-summary"></div><div id="cvr-list"></div>';
  document.querySelector("nav.nav").before(p);
  const n=document.createElement("button");n.className="nav-btn";n.id="nav-receipts";n.setAttribute("onclick","showPage('receipts')");n.innerHTML='<span class="nav-icon">🧾</span>Receipts';document.querySelector("nav.nav").appendChild(n);
  const dash=document.createElement("div");dash.id="cvr-dash";document.querySelector("#page-dash .dash-grid").before(dash);
  const modal=document.createElement("div");modal.className="overlay";modal.id="modal-receipts";modal.style.zIndex="390";
  modal.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-header"><div class="sheet-title" id="cvr-modal-title">Receipt</div><button class="sheet-close" onclick="closeModal(\'modal-receipts\')">✕</button></div><div class="sheet-body" id="cvr-body"></div></div>';
  document.body.append(modal);
  const show=showPage;showPage=function(name){show(name);if(name==="receipts")cvrRender();if(name==="dash")cvrDash();};
  const oldSell=cvxOpenSale;
  cvxOpenSale=function(ids){CVR.saleReceipt=null;return oldSell(ids);};
  const saveSale=cvxCommitSale;
  cvxCommitSale=function(){
    const rid=CVR.saleReceipt,prior=new Set(soldHistory.map(s=>s.id));
    const ret=saveSale();
    const added=rid?soldHistory.filter(s=>!prior.has(s.id)):[];
    if(added.length){
      const rec=CVR.items.find(r=>r.id===rid);
      if(rec&&rec.status==="pending"){
        added.forEach(s=>s.receiptId=rid);
        rec.status="processed";rec.processedAt=new Date().toISOString();rec.cardIds=added.map(s=>s.cardId);rec.transactionId=added[0].transactionId;
        try{save();cvrSaveMeta();}catch(e){console.error(e);toast("Sale saved, receipt link needs review: "+e.message,"error");}
      }
      CVR.saleReceipt=null;cvrDash();
    }
    return ret;
  };
  cvrDash();
}

function cvrSaveMeta(){localStorage.setItem(CVR.storeKey,JSON.stringify(CVR.items));}

function cvrDB(){
  if(CVR.db)return Promise.resolve(CVR.db);
  return new Promise((yes,no)=>{
    const req=indexedDB.open(CVR.dbName,1);
    req.onupgradeneeded=()=>req.result.createObjectStore("photos",{keyPath:"id"});
    req.onsuccess=()=>{CVR.db=req.result;yes(CVR.db);};
    req.onerror=()=>no(req.error);
    req.onblocked=()=>no(new Error("Receipt photo database blocked"));
  });
}

async function cvrPhotos(id){
  const db=await cvrDB();
  return new Promise((yes,no)=>{
    const req=db.transaction("photos","readonly").objectStore("photos").get(id);
    req.onsuccess=()=>yes(req.result?.photos||[]);
    req.onerror=()=>no(req.error);
  });
}

async function cvrStorePhotos(id,photos){
  const db=await cvrDB();
  return new Promise((yes,no)=>{
    const tx=db.transaction("photos","readwrite");
    tx.objectStore("photos").put({id,photos});
    tx.oncomplete=yes;tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error);
  });
}

function cvrDash(){
  const el=se("cvr-dash");if(!el)return;
  const pending=CVR.items.filter(r=>r.status==="pending").length;
  el.innerHTML='<button class="btn btn-secondary" style="margin:5px 0 15px;color:var(--gold);border-color:var(--gold)" onclick="showPage(\'receipts\')">🧾 '+pending+' Unprocessed Receipts · View ›</button>';
}

function cvrDate(v){return new Date(v).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});}

function cvrRender(){
  const pend=CVR.items.filter(r=>r.status==="pending").length;
  se("cvr-summary").innerHTML='<div class="cvr-flex" style="margin-bottom:12px"><button class="btn btn-secondary" onclick="CVR.filter=\'pending\';cvrRender()">'+pend+' Pending</button><button class="btn btn-secondary" onclick="CVR.filter=\'processed\';cvrRender()">'+(CVR.items.length-pend)+' Processed</button></div>';
  const arr=CVR.items.filter(r=>r.status===CVR.filter).slice().sort((a,b)=>b.at.localeCompare(a.at));
  se("cvr-list").innerHTML=arr.map(r=>'<div class="cvr-item" onclick="cvrView('+r.id+')"><div class="cvr-thumb" id="cvr-thumb-'+r.id+'" style="display:grid;place-items:center;font-size:25px">'+({buy:"🛒",sell:"💵",trade:"🔄"}[r.kind])+'</div><div style="flex:1"><div style="font-weight:700">'+r.kind.toUpperCase()+' · '+fmt(r.amount)+'</div><div class="cvr-mini">'+cvrDate(r.at)+' · '+r.photoCount+' photos</div><div class="cvr-mini">'+cvxEsc(r.notes||"Tap to review")+'</div></div><span>›</span></div>').join("")||'<div class="empty"><div class="empty-title">No '+CVR.filter+' receipts</div><div class="empty-sub">Tap + New to capture a card-show deal.</div></div>';
  for(const r of arr){
    cvrPhotos(r.id).then(ps=>{const e=se("cvr-thumb-"+r.id);if(e&&ps[0]){const img=document.createElement("img");img.src=ps[0];img.className="cvr-thumb";e.replaceWith(img);}}).catch(console.warn);
  }
}

function cvrCapture(id=null){
 const rec=id?CVR.items.find(r=>r.id===id&&r.status==="pending"):null;
 CVR.editId=id;CVR.kind=rec?.kind||"buy";CVR.photos=[];
 se("cvr-modal-title").textContent=rec?"Edit Receipt":"Quick Receipt";
 se("cvr-body").innerHTML='<div class="cvr-flex"><button class="btn btn-secondary" onclick="cvrKind(\'buy\')">🛒 Buy</button><button class="btn btn-secondary" onclick="cvrKind(\'sell\')">💵 Sell</button><button class="btn btn-secondary" onclick="cvrKind(\'trade\')">🔄 Trade</button></div>'+
 '<div class="form-group"><label class="form-label" id="cvr-amount-label">Amount Paid</label><input id="cvr-amount" class="form-input" type="number" inputmode="decimal" min="0" step=".01" placeholder="Total $"></div>'+
 '<div class="form-group"><label class="form-label">Photograph the cards</label><div class="cvr-flex"><button class="btn btn-secondary" onclick="se(\'cvr-camera\').click()">📸 Camera</button><button class="btn btn-secondary" onclick="se(\'cvr-gallery\').click()">🖼 Gallery</button></div><input id="cvr-camera" type="file" accept="image/*" capture="environment" style="display:none" onchange="cvrAddPhotos(event)"><input id="cvr-gallery" type="file" accept="image/*" multiple style="display:none" onchange="cvrAddPhotos(event)"><div class="cvr-photos" id="cvr-preview"></div><div class="cvr-mini" id="cvr-count"></div></div>'+
 '<div class="form-group"><label class="form-label">Notes (optional)</label><textarea id="cvr-notes" class="form-input" rows="3" placeholder="Dealer, card details, cash, etc."></textarea></div><div id="cvr-error" style="color:var(--red);font-size:12px;margin:10px 0"></div><button id="cvr-save" class="btn btn-primary" onclick="cvrSave()">💾 Save Receipt</button><div class="cvr-mini" style="margin-top:12px">Inventory and profit stay unchanged until you process this receipt. Capture needs no AI key.</div>';
 se("cvr-amount").value=rec?.amount??"";
 se("cvr-notes").value=rec?.notes||"";
 cvrKind(CVR.kind);cvrPreview();openModal("modal-receipts");
 if(rec)cvrPhotos(id).then(p=>{if(CVR.editId===id){CVR.photos=p;cvrPreview();}}).catch(e=>cvrError(e.message));
}
function cvrKind(kind){
 CVR.kind=kind;const l=se("cvr-amount-label");
 if(l)l.textContent=kind==="buy"?"Total Paid ($)":kind==="sell"?"Total Received ($)":"Cash Difference ($) — use notes for direction";
}
function cvrError(msg){const el=se("cvr-error");if(el)el.textContent=msg;toast(msg,"error");}
async function cvrAddPhotos(ev){
 const input=ev.target,files=[...(input.files||[])];input.value="";
 if(files.length+CVR.photos.length>12){cvrError("Limit 12 photos per receipt");return;}
 for(const f of files){
  if(!f.type.startsWith("image/")){cvrError("Please choose photos");continue;}
  if(f.size>20*1024*1024){cvrError("Photo exceeds 20 MB");continue;}
  try{CVR.photos.push(await readFileAsDataURL(f));}catch(e){cvrError(e.message);}
 }
 cvrPreview();
}
function cvrPreview(){
 const e=se("cvr-preview");if(!e)return;
 e.innerHTML=CVR.photos.map((src,i)=>'<div style="position:relative;flex-shrink:0"><img src="'+src+'" alt="Receipt image"><button style="position:absolute;right:0;top:0;background:var(--bg);color:var(--red);border:1px solid var(--red);border-radius:6px" onclick="cvrRemovePhoto('+i+')">✕</button></div>').join("");
 se("cvr-count").textContent=CVR.photos.length+" photo(s) stored at original resolution";
}
function cvrRemovePhoto(i){CVR.photos.splice(i,1);cvrPreview();}
async function cvrSave(){
 const raw=se("cvr-amount").value.trim(),amount=Number(raw),notes=se("cvr-notes").value.trim();
 if(raw===""||!Number.isFinite(amount)||amount<0||amount>100000000){cvrError("Enter the transaction amount (0 allowed for a trade)");return;}
 const id=CVR.editId||Date.now()*1000+Math.floor(Math.random()*1000);
 const prev=CVR.items.find(r=>r.id===id);
 const record={...(prev||{}),id,kind:CVR.kind,amount:Math.round(amount*100)/100,notes,at:prev?.at||new Date().toISOString(),photoCount:CVR.photos.length,status:"pending"};
 const b=se("cvr-save");b.disabled=true;b.textContent="Saving photos…";
 try{
  await cvrStorePhotos(id,CVR.photos);
  const old=CVR.items.slice();
  CVR.items=prev?CVR.items.map(r=>r.id===id?record:r):[record,...CVR.items];
  try{cvrSaveMeta();}catch(e){CVR.items=old;throw e;}
  closeModal("modal-receipts");cvrDash();showPage("receipts");toast("Receipt saved","success");
 }catch(e){cvrError("Unable to save receipt: "+e.message);b.disabled=false;b.textContent="💾 Save Receipt";}
}
async function cvrView(id){
 const r=CVR.items.find(x=>x.id===id);if(!r)return;
 CVR.activeId=id;se("cvr-modal-title").textContent=r.kind.toUpperCase()+" Receipt";
 const pending=r.status==="pending";
 se("cvr-body").innerHTML='<div class="cvr-mini">'+cvrDate(r.at)+'</div><div style="font-size:28px;color:var(--gold);font-weight:700;margin:10px 0">'+fmt(r.amount)+'</div><div class="cvr-mini" style="white-space:pre-wrap">'+cvxEsc(r.notes||"No notes")+'</div><div class="cvr-photos" id="cvr-detail-photos"></div>'+
 (pending?'<div class="cvr-mini" style="margin:12px 0">Pending — no inventory or profit changes yet.</div>'+
 (r.kind==="buy"?'<button class="btn btn-primary" onclick="cvrBuy()">📥 Process Purchase</button>':r.kind==="sell"?'<button class="btn btn-primary" onclick="cvrSell()">💰 Match Cards & Record Sale</button>':'<div class="cvr-section cvr-mini">Trade documented. Trade accounting needs its own reconciliation workflow; leave pending for now.</div>')+
 '<button class="btn btn-secondary" onclick="cvrCapture(CVR.activeId)">Edit / Add Photos</button><button class="btn btn-secondary" onclick="cvrAskDelete()">Delete Pending Receipt</button>':'<div class="cvr-good">✓ Processed and linked to '+(r.cardIds?.length||0)+' cards</div>');
 openModal("modal-receipts");
 try{
  const p=await cvrPhotos(id),el=se("cvr-detail-photos");
  if(el)el.innerHTML=p.map((src,i)=>'<img src="'+src+'" style="height:145px;width:145px;object-fit:contain" alt="Receipt photo '+(i+1)+'" onclick="cvrZoom('+id+','+i+')">').join("");
 }catch(e){console.error(e);}
}
async function cvrZoom(id,i){
 const p=await cvrPhotos(id),e=se("cvr-detail-photos");
 if(e)e.innerHTML='<button class="btn btn-secondary" onclick="cvrView('+id+')">← All Photos</button><img alt="Full receipt" style="width:100%;height:auto;max-height:65vh;object-fit:contain" src="'+p[i]+'">';
}
function cvrAskDelete(){
 if(se("cvr-delete-panel"))return;
 se("cvr-body").insertAdjacentHTML("beforeend",'<div class="cvr-section" id="cvr-delete-panel"><div class="cvr-mini">Permanently delete this pending receipt and photos?</div><button class="btn btn-danger" onclick="cvrDelete()">Confirm Delete</button><button class="btn btn-secondary" onclick="se(\'cvr-delete-panel\').remove()">Cancel</button></div>');
}
async function cvrDelete(){
 const id=CVR.activeId,r=CVR.items.find(x=>x.id===id);
 if(!r||r.status!=="pending")return;
 try{
  const db=await cvrDB();
  await new Promise((ok,no)=>{const t=db.transaction("photos","readwrite");t.objectStore("photos").delete(id);t.oncomplete=ok;t.onerror=()=>no(t.error);});
  CVR.items=CVR.items.filter(x=>x.id!==id);cvrSaveMeta();
  closeModal("modal-receipts");cvrDash();cvrRender();toast("Receipt deleted","success");
 }catch(e){toast("Unable to delete: "+e.message,"error");}
}
function cvrSell(){
 const r=CVR.items.find(x=>x.id===CVR.activeId);if(!r||r.status!=="pending"||r.kind!=="sell")return;
 closeModal("modal-receipts");cvxOpenSale([]);CVR.saleReceipt=r.id;
 se("cvx-gross").value=r.amount||"";se("cvx-platform").value="Card Show";
 const saleDate=new Date(r.at);se("cvx-sale-date").value=[saleDate.getFullYear(),String(saleDate.getMonth()+1).padStart(2,"0"),String(saleDate.getDate()).padStart(2,"0")].join("-");
 se("cvx-sale-notes").value=r.notes;cvxSalePreview();
}

function cvrBuy(){
  const receipt=CVR.items.find(x=>x.id===CVR.activeId);
  if(!receipt||receipt.status!=="pending"||receipt.kind!=="buy")return;
  se("cvr-modal-title").textContent="Process Purchase";
  se("cvr-body").innerHTML='<div class="cvr-mini">Loading receipt photos…</div>';
  cvrPhotos(receipt.id).then(photos=>{
    if(CVR.activeId!==receipt.id)return;
    CVR.receiptPhotos=photos;
    const count=Math.max(1,Math.min(photos.length,12));
    CVR.buyRows=Array.from({length:count},(_,i)=>cvrBlankRow(i<photos.length?i:-1));
    cvrBuyForm();
    if(getKey("ai"))cvrAutoScan();
  }).catch(err=>{
    CVR.receiptPhotos=[];
    CVR.buyRows=[cvrBlankRow(-1)];
    cvrBuyForm();
    const box=se("cvr-buy-error");if(box)box.textContent="Receipt photos unavailable: "+err.message;
  });
}
function cvrBuyRead(){
  CVR.buyRows=CVR.buyRows.map((old,i)=>{
    const row={...old};
    for(const key of ["player","year","sport","team","set","cardNum","variation","printRun","condition","grade","certNumber","cost"]){
      const input=se("cvr-buy-"+i+"-"+key);
      if(input)row[key]=input.value;
    }
    return row;
  });
}
function cvrBuyAdd(){
  cvrBuyRead();
  CVR.buyRows.push(cvrBlankRow(-1));
  cvrBuyForm();
}
function cvrBuyRemove(i){
  cvrBuyRead();
  CVR.buyRows.splice(i,1);
  if(!CVR.buyRows.length)CVR.buyRows.push(cvrBlankRow(-1));
  cvrBuyForm();
}
function cvrBuyForm(){
  const receipt=CVR.items.find(x=>x.id===CVR.activeId);
  if(!receipt)return;
  se("cvr-modal-title").textContent="Process Purchase";
  const photos=CVR.receiptPhotos||[];
  const photoOptions=photos.map((_,i)=>'<option value="'+i+'">Receipt photo '+(i+1)+'</option>').join("");
  const field=(i,key,label,placeholder="")=>'<div class="form-group"><label class="form-label">'+label+'</label><input id="cvr-buy-'+i+'-'+key+'" class="form-input" value="'+cvxEsc(CVR.buyRows[i][key]||"")+'" placeholder="'+placeholder+'"></div>';
  const rows=CVR.buyRows.map((row,i)=>{
    const src=cvrRowPhoto(row);
    const sportOptions=["Other","Basketball","Baseball","Football","Hockey"].map(s=>'<option'+(s===(row.sport||"Other")?" selected":"")+'>'+s+'</option>').join("");
    const condOptions=["Raw","NM-MT","EX-MT","VG-EX","Graded"].map(s=>'<option'+(s===(row.condition||"Raw")?" selected":"")+'>'+s+'</option>').join("");
    return '<div class="cvr-section"><div class="cvr-flex" style="align-items:center;justify-content:space-between"><b>Card '+(i+1)+'</b><button class="btn-sm" onclick="cvrBuyRemove('+i+')">Remove</button></div>'+
    '<div style="display:flex;gap:10px;align-items:center;margin:9px 0"><img id="cvr-card-thumb-'+i+'" src="'+(src||"")+'" alt="Assigned card" style="width:78px;height:100px;object-fit:contain;border-radius:7px;background:var(--bg4);border:1px solid var(--border2)"><div style="flex:1;min-width:0">'+
    '<label class="form-label">Use receipt photo</label><select id="cvr-photo-source-'+i+'" class="form-select" onchange="cvrAssignReceiptPhoto('+i+',this.value)"><option value="-1">No receipt photo</option>'+photoOptions+'</select>'+
    '<div class="cvr-flex" style="margin-top:7px"><button class="btn-sm" onclick="se(\'cvr-photo-camera-'+i+'\').click()">📸 Camera</button><button class="btn-sm" onclick="se(\'cvr-photo-upload-'+i+'\').click()">🖼 Upload</button></div>'+
    '<input id="cvr-photo-camera-'+i+'" type="file" accept="image/*" capture="environment" style="display:none" onchange="cvrCardUpload('+i+',event)"><input id="cvr-photo-upload-'+i+'" type="file" accept="image/*" style="display:none" onchange="cvrCardUpload('+i+',event)">'+
    '<button id="cvr-scan-'+i+'" class="btn-sm" style="margin-top:8px" onclick="cvrScan('+i+')">✨ Scan Card</button></div></div>'+
    '<div id="cvr-scan-state-'+i+'" class="cvr-mini" style="margin:0 0 9px;color:var(--gold)">'+cvxEsc(row.scanStatus||"Review or scan this card")+'</div>'+
    field(i,"player","Player *","Player name")+
    '<div class="cvr-flex">'+field(i,"year","Year","2025")+'<div class="form-group"><label class="form-label">Sport</label><select class="form-select" id="cvr-buy-'+i+'-sport">'+sportOptions+'</select></div></div>'+
    field(i,"team","Team")+field(i,"set","Set / Brand","Topps Chrome")+
    '<div class="cvr-flex">'+field(i,"cardNum","Card #")+field(i,"variation","Parallel / Variation")+'</div>'+
    '<div class="cvr-flex">'+field(i,"printRun","Print Run")+field(i,"grade","Grade (if graded)")+'</div>'+
    '<div class="cvr-flex">'+field(i,"certNumber","Cert Number")+'<div class="form-group"><label class="form-label">Condition</label><select class="form-select" id="cvr-buy-'+i+'-condition">'+condOptions+'</select></div></div>'+
    '<div class="form-group"><label class="form-label">Allocated Cost ($) — optional</label><input class="form-input" type="number" min="0" step=".01" id="cvr-buy-'+i+'-cost" value="'+cvxEsc(row.cost??"")+'" placeholder="Split remaining amount evenly"></div></div>';
  }).join("");
  se("cvr-body").innerHTML='<div class="cvr-mini">Receipt '+fmt(receipt.amount)+' · '+cvrDate(receipt.at)+'</div>'+
    '<div class="cvr-mini" style="margin:10px 0">Assign a photo to each card, or take a new one. AI can prefill fields when configured; review parallels and grades before saving. Group photos may require separate close-ups.</div>'+
    rows+'<button class="btn btn-secondary" onclick="cvrBuyAdd()">+ Another Card</button>'+
    '<div class="cvr-mini" style="margin:9px 0">Unallocated purchase cost is divided evenly. All cards remain unpriced until you set a market value.</div>'+
    '<div id="cvr-buy-error" style="color:var(--red);font-size:12px;margin:10px 0"></div><button id="cvr-buy-save" class="btn btn-primary" onclick="cvrBuyPost()">✅ Add Cards to Inventory</button><button class="btn btn-secondary" onclick="cvrView(CVR.activeId)">← Back to Receipt</button>';
  CVR.buyRows.forEach((r,i)=>{const el=se("cvr-photo-source-"+i);if(el)el.value=String(r.sourceIndex??-1);});
}
function cvrCosts(total,inputs){
 let remain=Math.round(total*100),blanks=0;
 const values=inputs.map(v=>{
  if(v==null||v===""){blanks++;return null;}
  const n=Math.round(Number(v)*100);
  if(!Number.isFinite(n)||n<0)throw Error("Invalid cost allocation");
  remain-=n;return n;
 });
 if(remain<0)throw Error("Allocated costs exceed receipt total");
 if(!blanks&&remain!==0)throw Error("Costs must sum to "+fmt(total));
 const count=blanks;
 return values.map(n=>{
  if(n!==null)return n/100;
  const cents=Math.floor(remain/blanks);remain-=cents;blanks--;
  return cents/100;
 });
}
async function cvrBuyPost(){
  const receipt=CVR.items.find(x=>x.id===CVR.activeId);
  if(!receipt||receipt.status!=="pending"||receipt.kind!=="buy")return;
  cvrBuyRead();
  const error=se("cvr-buy-error"),rows=CVR.buyRows.map(r=>({...r,player:String(r.player||"").trim()}));
  if(rows.some(r=>!r.player)){error.textContent="Enter a player name for every card.";return;}
  let costs;
  try{costs=cvrCosts(receipt.amount,rows.map(r=>r.cost));}
  catch(err){error.textContent=err.message;return;}
  const oldInventory=inventory,oldReceipt={...receipt},btn=se("cvr-buy-save"),created=[];
  btn.disabled=true;btn.textContent="Saving card photos…";
  try{
    const cards=[];
    for(let i=0;i<rows.length;i++){
      const r=rows[i],id=newId(),photo=cvrRowPhoto(r);
      const savedPhoto=photo?await compressImage(photo,800,0.7):null;
      cards.push({
        id,player:r.player,sport:r.sport||"Other",year:r.year||"",team:r.team||"",set:r.set||"",cardNum:r.cardNum||"",
        variation:r.variation||"",printRun:r.printRun||"",condition:r.grade?"Graded":r.condition||"Raw",grade:r.grade||"",
        certNumber:r.certNumber||"",cost:costs[i],value:0,needsPricing:true,
        notes:"Card show receipt"+(receipt.notes?" · "+receipt.notes:""),photo:savedPhoto,
        dateAdded:new Date().toISOString(),purchaseDate:receipt.at,receiptId:receipt.id
      });
    }
    for(const c of cards){
      if(c.photo){await dbSetPhoto(c.id,c.photo);created.push(c.id);}
    }
    inventory=[...cards,...inventory];save();
    receipt.status="processed";receipt.cardIds=cards.map(c=>c.id);receipt.processedAt=new Date().toISOString();
    cvrSaveMeta();
    closeModal("modal-receipts");renderDash();renderInventory();renderPlayers();showPage("receipts");
    toast("✅ "+cards.length+" card(s) added with individual photos","success");
  }catch(err){
    inventory=oldInventory;Object.assign(receipt,oldReceipt);
    try{save();cvrSaveMeta();}catch(e){console.error("Purchase rollback failed",e);}
    for(const id of created){try{await dbDeletePhoto(id);}catch(e){console.warn("Photo cleanup failed",e);}}
    if(error){error.textContent="Purchase not completed: "+err.message;}
    if(btn&&btn.isConnected){btn.disabled=false;btn.textContent="✅ Add Cards to Inventory";}
  }
}
async function cvrExport(){
 const receiptPhotos={};
 for(const r of CVR.items)receiptPhotos[r.id]=await cvrPhotos(r.id);
 return {receipts:CVR.items.map(r=>({...r})),receiptPhotos};
}
function cvrCheckBackup(data){
 if(data.receipts===undefined&&data.receiptPhotos===undefined)return;
 if(!Array.isArray(data.receipts)||!data.receiptPhotos||typeof data.receiptPhotos!=="object")throw Error("Invalid receipt backup");
 for(const r of data.receipts){
  if(!r||!Number.isSafeInteger(Number(r.id))||!["buy","sell","trade"].includes(r.kind)||!["pending","processed"].includes(r.status))throw Error("Invalid receipt data");
  const ps=data.receiptPhotos[r.id]||[];
  if(!Array.isArray(ps)||ps.some(p=>typeof p!=="string"||!p.startsWith("data:image/")))throw Error("Invalid receipt images");
 }
}
async function cvrRestore(data){
 cvrCheckBackup(data);
 const receipts=(data.receipts||[]).map(r=>({...r})),photos=data.receiptPhotos||{};
 const db=await cvrDB(),old=await cvrExport();
 async function write(items,images){
  await new Promise((yes,no)=>{
   const tx=db.transaction("photos","readwrite"),store=tx.objectStore("photos");store.clear();
   for(const r of items)store.put({id:r.id,photos:images[r.id]||[]});
   tx.oncomplete=yes;tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error);
  });
 }
 try{
  await write(receipts,photos);CVR.items=receipts;cvrSaveMeta();
 }catch(e){
  try{await write(old.receipts,old.receiptPhotos);CVR.items=old.receipts;cvrSaveMeta();}catch(x){console.error("Receipt restore rollback failure",x);}
  throw e;
 }
}

if(!new URLSearchParams(location.search).has("gist"))cvrStart();

function cvrRowPhoto(row){
  if(row.photoData)return row.photoData;
  const index=Number(row.sourceIndex);
  return Number.isInteger(index)&&index>=0?(CVR.receiptPhotos||[])[index]||null:null;
}

function cvrAssignReceiptPhoto(i,v){
  cvrBuyRead();
  const row=CVR.buyRows[i];if(!row)return;
  const index=Number(v);
  row.sourceIndex=Number.isInteger(index)?index:-1;
  row.photoData=null;row.scanStatus="";
  cvrBuyForm();
  if(cvrRowPhoto(row)&&getKey("ai"))cvrScan(i);
}

async function cvrCardUpload(i,event){
  const file=event.target.files?.[0];event.target.value="";
  if(!file)return;
  if(!file.type.startsWith("image/")){toast("Choose a photo","error");return;}
  if(file.size>20*1024*1024){toast("Photo exceeds 20 MB","error");return;}
  cvrBuyRead();
  const row=CVR.buyRows[i];if(!row)return;
  try{
    row.photoData=await readFileAsDataURL(file);
    row.sourceIndex=-1;
    row.scanStatus="New card photo assigned";
    cvrBuyForm();
    if(getKey("ai"))cvrScan(i);
  }catch(err){toast("Could not load photo: "+err.message,"error");}
}

async function cvrAutoScan(){
  const entries=[...CVR.buyRows];
  for(let i=0;i<entries.length;i++){
    if(CVR.buyRows[i]===entries[i]&&cvrRowPhoto(entries[i]))await cvrScan(i);
  }
}

async function cvrScan(i){
  const row=CVR.buyRows[i],photo=row?cvrRowPhoto(row):null;
  if(!photo){toast("Choose a photo before scanning","error");return;}
  if(!getKey("ai")){
    cvrScanMessage(i,"AI scanning requires an Anthropic key in Settings. You can enter details manually.");
    return;
  }
  if(row.scanBusy)return;
  row.scanBusy=true;
  const btn=se("cvr-scan-"+i);if(btn)btn.disabled=true;
  cvrScanMessage(i,"Analyzing card photo…");
  try{
    const image=await compressImage(photo,800,0.7);
    const result=await scanCardPhoto(image);
    if(CVR.buyRows[i]!==row||cvrRowPhoto(row)!==photo)return;
    for(const key of ["player","year","team","set","cardNum","variation","printRun","grade","certNumber","sport","condition"]){
      const value=String(result[key]??"").trim();
      if(!value)continue;
      const el=se("cvr-buy-"+i+"-"+key);
      if(!el)continue;
      if(key==="sport"&&el.value==="Other"){
        const found=["Other","Basketball","Baseball","Football","Hockey"].find(v=>v.toLowerCase()===value.toLowerCase());
        if(found)el.value=found;
      }else if(key==="condition"&&(el.value==="Raw"||!el.value)){
        const found=["Raw","NM-MT","EX-MT","VG-EX","Graded"].find(v=>v.toLowerCase()===value.toLowerCase());
        if(found)el.value=found;
      }else if(!el.value){el.value=value;}
    }
    if(result.grade&&se("cvr-buy-"+i+"-condition").value==="Raw")se("cvr-buy-"+i+"-condition").value="Graded";
    cvrBuyRead();
    cvrScanMessage(i,result.player?"AI suggestions added — verify card details and parallel.":"Could not identify confidently — enter details manually.");
  }catch(err){
    cvrScanMessage(i,"AI scan failed: "+err.message+". Enter details manually or retry.");
  }finally{
    row.scanBusy=false;
    if(btn&&btn.isConnected)btn.disabled=false;
  }
}

function cvrScanMessage(i,message){
  const row=CVR.buyRows[i];if(row)row.scanStatus=message;
  const el=se("cvr-scan-state-"+i);if(el)el.textContent=message;
}

function cvrBlankRow(sourceIndex=-1){
  return {player:"",year:"",sport:"Other",team:"",set:"",cardNum:"",variation:"",printRun:"",condition:"Raw",grade:"",certNumber:"",cost:"",sourceIndex,photoData:null,scanStatus:""};
}
