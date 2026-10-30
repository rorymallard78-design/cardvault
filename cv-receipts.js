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
