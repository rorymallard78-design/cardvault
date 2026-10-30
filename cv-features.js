'use strict';
// CardVault development extension - changes isolated from original code.
var CVX={multi:false,selected:new Set(),saleIds:new Set(),matchLog:[],shareScope:'all',sharePlayer:'',sharePrices:true};
function cvxEsc(v){return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

function cvxInit(){
  const css=document.createElement('style');
  css.textContent=`
.cvx-selected{border-color:var(--gold)!important;background:var(--gold-dim)!important}
.cvx-toolbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:10px 0}
.cvx-toolbar .btn-sm{padding:9px 10px}
.cvx-check{border:1px solid var(--gold);width:23px;height:23px;border-radius:6px;color:var(--gold);font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
.cvx-mini{font-size:11px;color:var(--text2);line-height:1.5}
.cvx-sale-row{display:flex;align-items:flex-start;gap:10px;padding:8px 4px;border-bottom:1px solid var(--border);cursor:pointer}
.cvx-sale-row input{width:19px;height:19px;accent-color:var(--gold);flex-shrink:0;margin-top:5px}
.cvx-pill{padding:7px 11px;border-radius:8px;border:1px solid var(--border2);background:var(--bg3);color:var(--text);cursor:pointer;font-family:inherit}
.cvx-pill.active{color:var(--gold);border-color:var(--gold)}
.cvx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.cvx-group{border:1px solid var(--border);border-radius:10px;margin-bottom:10px;background:var(--bg2);padding:12px}
.cvx-group summary{cursor:pointer;list-style:auto;font-weight:600}
`;
  document.head.appendChild(css);
  const invHead=se('page-inventory').querySelector('.sec-header');
  const selectBtn=document.createElement('button'); selectBtn.className='btn-sm'; selectBtn.id='cvx-select-btn'; selectBtn.textContent='☑ Select';selectBtn.onclick=cvxSetMulti;invHead.appendChild(selectBtn);
  const bar=document.createElement('div');bar.id='cvx-toolbar';bar.className='cvx-toolbar';bar.style.display='none';
  se('inv-list').before(bar);
  const soldHead=se('page-sold').querySelector('.sec-header');
  const addBtn=document.createElement('button');addBtn.className='btn-sm gold';addBtn.textContent='+ Record Sale';addBtn.onclick=()=>cvxOpenSale([]);soldHead.appendChild(addBtn);
  const dataBox=se('page-settings').querySelector('.setting-section:last-child .setting-box');
  if(dataBox){
    const div=document.createElement('div');
    div.style.marginTop='12px';
    div.innerHTML='<button class="btn btn-secondary" onclick="cvxExportBackup()">⬇ Export Complete Backup (Including Photos)</button><input id="cvx-restore-file" type="file" accept=".json,application/json" style="display:none" onchange="cvxImportBackup(event)"><button class="btn btn-secondary" onclick="se(\'cvx-restore-file\').click()">⬆ Restore from Backup</button><div class="cvx-mini">Keep the exported file somewhere safe, outside this browser. Restoring replaces your current collection.</div>';
    dataBox.insertBefore(div,dataBox.lastElementChild);
  }
  const modal=document.createElement('div');modal.className='overlay';modal.id='cvx-sale-modal';modal.style.zIndex='375';
  modal.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-header"><div class="sheet-title">Record Sale / Lot</div><button class="sheet-close" onclick="closeModal(\'cvx-sale-modal\')">✕</button></div><div class="sheet-body" id="cvx-sale-body"></div></div>';
  document.body.appendChild(modal);
  document.querySelectorAll('.card-item').forEach(()=>{});
}

function cvxSetMulti(){
  CVX.multi=!CVX.multi;
  if(!CVX.multi)CVX.selected.clear();
  se('cvx-select-btn').textContent=CVX.multi?'✕ Cancel':'☑ Select';
  renderInventory();
}

function cvxVisibleIds(){
  return [...se('inv-list').querySelectorAll('.card-item[onclick]')].map(row=>{
    const m=(row.getAttribute('onclick')||'').match(/(?:openCard|cvxToggle)\((\d+)\)/);return m?Number(m[1]):null;
  }).filter(x=>x!==null);
}

function cvxToggle(id){
  id=Number(id);
  if(CVX.selected.has(id))CVX.selected.delete(id);else CVX.selected.add(id);
  renderInventory();
}

function cvxSelectVisible(){
  const ids=cvxVisibleIds();
  const all=ids.length&&ids.every(id=>CVX.selected.has(id));
  ids.forEach(id=>all?CVX.selected.delete(id):CVX.selected.add(id));
  renderInventory();
}

function cvxRenderSelection(){
  const bar=se('cvx-toolbar');if(!bar)return;
  bar.style.display=CVX.multi?'flex':'none';
  if(!CVX.multi)return;
  const list=se('inv-list');
  [...list.querySelectorAll('.card-item')].forEach(row=>{
    const m=(row.getAttribute('onclick')||'').match(/openCard\((\d+)\)/);
    if(!m)return;
    const id=Number(m[1]);
    row.setAttribute('onclick','cvxToggle('+id+')');
    row.classList.toggle('cvx-selected',CVX.selected.has(id));
    const marker=document.createElement('span');
    marker.className='cvx-check';marker.textContent=CVX.selected.has(id)?'✓':'';
    row.prepend(marker);
  });
  const n=CVX.selected.size;
  bar.innerHTML='<span style="font-size:12px;color:var(--gold);font-weight:600">'+n+' selected</span>'+
    '<button class="btn-sm" onclick="cvxSelectVisible()">Select / Unselect Shown</button>'+
    '<button class="btn-sm gold" '+(n?'':'disabled')+' onclick="cvxOpenSale([...CVX.selected])">💵 Sell Selected</button>'+
    '<button class="btn-sm" '+(n?'':'disabled')+' onclick="cvxShowShare(\'selected\')">🔗 Share Selected</button>';
}

function cvxUnrealized(){
  return inventory.filter(c=>Number(c.value)>0&&!c.needsPricing).reduce((sum,c)=>sum+Number(c.value||0)-Number(c.cost||0),0);
}

function cvxFixDash(){
  const pl=cvxUnrealized(),node=se('d-pl');
  if(node){node.textContent=fmtPL(pl);node.style.color=pl>=0?'var(--green)':'var(--red)';}
}

function cvxFixHeader(){
  const pl=cvxUnrealized(),el=se('hs-pl');
  if(el){el.textContent=(pl>=0?'+':'-')+fmtShort(Math.abs(pl));el.className='hstat-val '+(pl>=0?'green':'red');}
}

function cvxOpenSale(ids){
  CVX.saleIds=new Set(ids.filter(id=>inventory.some(c=>c.id===Number(id))).map(Number));
  CVX.matchLog=[];
  openModal('cvx-sale-modal');
  se('cvx-sale-body').innerHTML=`
<div class="form-group"><label class="form-label">Find Cards</label><input id="cvx-sale-search" class="form-input" placeholder="Search player, set, year, card number" oninput="cvxRenderSaleCandidates()"></div>
<div class="cvx-mini" id="cvx-sale-count" style="margin-bottom:7px"></div><div id="cvx-sale-list" style="max-height:190px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:4px"></div>
<div style="margin:12px 0 10px;border-top:1px solid var(--border);padding-top:10px"><label class="form-label">Photo-match cards (optional)</label>
<input id="cvx-match-files" class="form-input" type="file" accept="image/*" multiple onchange="cvxMatchPhotos(event)">
<div class="cvx-mini">Upload one card per photo; AI will suggest inventory matches for your review. Nothing is sold automatically.</div>
<div id="cvx-match-status" class="cvx-mini" style="margin-top:5px"></div></div>
<div class="cvx-grid">
<div class="form-group"><label class="form-label">Gross Sale Price ($)</label><input id="cvx-gross" class="form-input" type="number" min="0" step=".01" inputmode="decimal" oninput="cvxSalePreview()"></div>
<div class="form-group"><label class="form-label">Platform Fees ($)</label><input id="cvx-fees" class="form-input" type="number" min="0" step=".01" inputmode="decimal" value="0" oninput="cvxSalePreview()"></div>
<div class="form-group"><label class="form-label">Shipping Paid ($)</label><input id="cvx-shipping" class="form-input" type="number" min="0" step=".01" inputmode="decimal" value="0" oninput="cvxSalePreview()"></div>
<div class="form-group"><label class="form-label">Other Costs ($)</label><input id="cvx-other" class="form-input" type="number" min="0" step=".01" inputmode="decimal" value="0" oninput="cvxSalePreview()"></div>
<div class="form-group"><label class="form-label">Sale Date</label><input id="cvx-sale-date" class="form-input" type="date"></div>
<div class="form-group"><label class="form-label">Platform</label><select class="form-select" id="cvx-platform"><option>Card Show</option><option>Private</option><option>eBay</option><option>Whatnot</option><option>Fanatics Collect</option><option>Facebook Marketplace</option><option>Other</option></select></div>
</div>
<div class="form-group"><label class="form-label">Sale Notes</label><textarea id="cvx-sale-notes" class="form-textarea" placeholder="Buyer, lot details, etc."></textarea></div>
<div id="cvx-sale-preview" class="setting-box" style="font-size:13px"></div>
<div id="cvx-sale-error" role="alert" style="display:none;color:var(--red);background:var(--red-dim);border:1px solid var(--red);padding:12px;border-radius:8px;margin-bottom:10px;font-size:13px"></div>
<button id="cvx-save-sale-btn" type="button" class="btn btn-primary" onclick="cvxCommitSale()">✅ Confirm & Record Sale</button>`;
  se('cvx-sale-date').value=cvxLocalISODate();
  cvxRenderSaleCandidates();
}

function cvxRenderSaleCandidates(){
  const q=(se('cvx-sale-search')?.value||'').trim().toLowerCase();
  const matches=inventory.filter(c=>!q||[c.player,c.year,c.set,c.variation,c.cardNum,c.grade].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,80);
  se('cvx-sale-count').textContent=CVX.saleIds.size+' card(s) selected · '+matches.length+' matches shown';
  se('cvx-sale-list').innerHTML=matches.map(c=>
    '<label class="cvx-sale-row"><input type="checkbox" '+(CVX.saleIds.has(c.id)?'checked':'')+' onchange="cvxToggleSale('+Number(c.id)+',this.checked)">'+
    '<span style="flex:1"><b>'+cvxEsc(c.player)+'</b><div class="cvx-mini">'+cvxEsc([c.year,c.set,c.variation,c.grade||c.condition,c.cardNum].filter(Boolean).join(' · '))+'</div></span><span style="color:var(--gold);font-size:12px">'+fmt(c.cost)+'</span></label>'
  ).join('')||'<div class="cvx-mini" style="padding:10px">No matching cards</div>';
  cvxSalePreview();
}

function cvxToggleSale(id,checked){
  if(checked)CVX.saleIds.add(Number(id));else CVX.saleIds.delete(Number(id));
  cvxRenderSaleCandidates();
}

function cvxSaleNumbers(){
  const num=id=>Number(se(id)?.value||0);
  const gross=num('cvx-gross'),fees=num('cvx-fees'),shipping=num('cvx-shipping'),other=num('cvx-other');
  const selected=inventory.filter(c=>CVX.saleIds.has(c.id));
  const cost=selected.reduce((sum,c)=>sum+Number(c.cost||0),0);
  return {gross,fees,shipping,other,cost,selected,net:gross-fees-shipping-other,profit:gross-fees-shipping-other-cost};
}

function cvxSalePreview(){
  const el=se('cvx-sale-preview');if(!el)return;
  const p=cvxSaleNumbers();
  const n=p.selected.length;
  el.innerHTML='<b>'+n+' selected card'+(n===1?'':'s')+'</b><div class="cvx-mini">Total basis: '+fmt(p.cost)+' · Fees & expenses: '+fmt(p.fees+p.shipping+p.other)+'</div>'+
    '<div style="margin-top:5px">Net proceeds: <b>'+fmtPL(p.net)+'</b> · Net P&L: <b style="color:'+(p.profit>=0?'var(--green)':'var(--red)')+'">'+fmtPL(p.profit)+'</b></div>'+
    '<div class="cvx-mini" style="margin-top:5px">Lot proceeds allocated to cards by purchase-cost share (equal shares when all costs are $0).</div>';
}

function cvxAllocateCents(total,weights){
  const cents=Math.round(total*100);
  const result=[],weightSum=weights.reduce((a,b)=>a+b,0);
  let remaining=cents;
  for(let i=0;i<weights.length;i++){
    const n=i===weights.length-1?remaining:Math.round(cents*(weightSum?weights[i]/weightSum:1/weights.length));
    result.push(n/100);remaining-=n;
  }
  return result;
}

function cvxLocalISODate(){
  const d=new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function cvxSaleError(message){
  const error=se('cvx-sale-error');
  if(error){error.style.display='block';error.textContent=message;error.scrollIntoView({block:'nearest',behavior:'smooth'});}
  toast(message,'error');
}
function cvxCommitSale(){
  const button=se('cvx-save-sale-btn');
  const message=se('cvx-sale-error');
  if(message){message.style.display='none';message.textContent='';}
  try {
    const p=cvxSaleNumbers(),date=se('cvx-sale-date')?.value||'',platform=se('cvx-platform')?.value||'Other';
    if(!p.selected.length) return cvxSaleError('Select at least one inventory card before recording the sale.');
    if(!Number.isFinite(p.gross)||p.gross<=0) return cvxSaleError('Enter a sale price greater than $0.');
    if(![p.fees,p.shipping,p.other].every(x=>Number.isFinite(x)&&x>=0)) return cvxSaleError('Fees, shipping and other expenses must be zero or greater.');
    if(p.net<0) return cvxSaleError('Expenses exceed the sale price. Please check the amounts.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return cvxSaleError('Choose a valid sale date.');
    // The visible 'Confirm & Record Sale' button is the confirmation. Android in-app browsers can silently cancel native confirm() dialogs.
    // Do not use confirm() here: a cancelled native dialog makes this button appear broken.
    if(button){button.disabled=true;button.textContent='Saving sale…';}
    const weights=p.selected.map(c=>Math.max(0,Number(c.cost)||0));
    const txn='lot-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
    const gross=cvxAllocateCents(p.gross,weights),fees=cvxAllocateCents(p.fees,weights),shipping=cvxAllocateCents(p.shipping,weights),other=cvxAllocateCents(p.other,weights);
    const notes=se('cvx-sale-notes')?.value?.trim()||'';
    const records=p.selected.map((c,i)=>({
      id:Date.now()+i,cardId:c.id,transactionId:txn,transactionSize:p.selected.length,
      player:c.player,sport:c.sport,year:c.year,team:c.team,set:c.set,variation:c.variation,
      cardNum:c.cardNum,printRun:c.printRun,grade:c.grade,condition:c.condition,cost:Number(c.cost)||0,
      salePrice:gross[i],fees:fees[i],shipping:shipping[i],otherExpenses:other[i],
      netProceeds:Math.round((gross[i]-fees[i]-shipping[i]-other[i])*100)/100,
      pl:Math.round((gross[i]-fees[i]-shipping[i]-other[i]-(Number(c.cost)||0))*100)/100,
      platform,dateSold:date,notes,photoRef:c.id
    }));
    const oldInv=inventory,oldSold=soldHistory;
    try {
      soldHistory=[...records,...soldHistory];
      inventory=inventory.filter(c=>!CVX.saleIds.has(c.id));
      save();
    }catch(err){
      inventory=oldInv;soldHistory=oldSold;
      return cvxSaleError('Could not save the sale: '+err.message);
    }
    CVX.saleIds.clear();CVX.selected.clear();CVX.multi=false;
    const selectBtn=se('cvx-select-btn');if(selectBtn)selectBtn.textContent='☑ Select';
    closeModal('cvx-sale-modal');
    if(se('modal-detail')?.classList.contains('open'))closeModal('modal-detail');
    renderDash();renderInventory();renderPlayers();renderSold();showPage('sold');
    toast('✅ Recorded '+p.selected.length+' sold card(s) — '+fmtPL(p.profit)+' net P&L','success');
  }catch(err){
    console.error('CardVault Record Sale:',err);
    cvxSaleError('Unable to record sale: '+(err?.message||String(err)));
  }finally{
    if(button&&button.isConnected){button.disabled=false;button.textContent='✅ Confirm & Record Sale';}
  }
}

async function cvxMatchPhotos(event){
  const files=[...(event.target.files||[])];event.target.value='';
  if(!files.length)return;
  if(!getKey('ai')){toast('Add your Anthropic key in Settings to photo-match','error');return;}
  if(files.length>12){toast('Select up to 12 photos per batch','error');return;}
  if(!confirm('Analyze '+files.length+' photo(s) using Claude? API charges may apply.'))return;
  const status=se('cvx-match-status');
  let matched=0;
  for(let i=0;i<files.length;i++){
    status.textContent='Matching photo '+(i+1)+' of '+files.length+'…';
    try{
      const raw=await readFileAsDataURL(files[i]);
      const photo=await compressImage(raw,800,0.7);
      const p=await scanCardPhoto(photo);
      const terms=[p.player,p.year,p.set,p.cardNum].filter(Boolean);
      const candidates=inventory.filter(c=>{
        const normalized=t=>String(t||'').toLowerCase().replace(/[^a-z0-9]/g,'');
        const player=normalized(p.player),name=normalized(c.player);
        if(!player||!(name.includes(player)||player.includes(name)))return false;
        return (!p.year||normalized(p.year)===normalized(c.year)) && (!p.cardNum||normalized(p.cardNum)===normalized(c.cardNum));
      });
      if(candidates.length===1){CVX.saleIds.add(candidates[0].id);matched++;}
      CVX.matchLog.push({label:terms.join(' · '),candidates});
    }catch(e){CVX.matchLog.push({label:files[i].name+' — '+e.message,candidates:[]});}
  }
  status.innerHTML='Suggested '+matched+' unique matches; please review checked cards before recording.<div style="margin-top:5px">'+
    CVX.matchLog.map(m=>'<div>'+cvxEsc(m.label)+' → '+(m.candidates.length===1?'1 suggested match':m.candidates.length+' candidates (review manually)')+'</div>').join('')+'</div>';
  cvxRenderSaleCandidates();
}


function cvxShowShare(scope,player=''){
 CVX.shareScope=scope;CVX.sharePlayer=player;
 if(scope==='selected'&&!CVX.selected.size){toast('Select cards to share','error');return;}
 openShareModal();
 cvxRenderShareMenu();
}
function cvxRenderShareMenu(){
 const players=[...new Set(inventory.map(c=>c.player))].sort();
 const sel=(v,label)=>'<option value="'+cvxEsc(v)+'"'+(CVX.sharePlayer===v?' selected':'')+'>'+cvxEsc(label)+'</option>';
 se('share-body').innerHTML='<div class="form-group"><label class="form-label">Which cards to share?</label><select id="cvx-share-scope" class="form-select" onchange="CVX.shareScope=this.value;cvxRenderShareMenu()">'+
 ['all','selected','player'].map(k=>'<option value="'+k+'"'+(CVX.shareScope===k?' selected':'')+'>'+({all:'Entire Inventory',selected:'Selected Cards ('+CVX.selected.size+')',player:'Player Folder'}[k])+'</option>').join('')+'</select></div>'+
 (CVX.shareScope==='player'?'<div class="form-group"><label class="form-label">Player</label><select id="cvx-share-player" class="form-select" onchange="CVX.sharePlayer=this.value">'+sel('','Choose a player')+players.map(p=>sel(p,p)).join('')+'</select></div>':'')+
 '<label style="display:flex;gap:9px;align-items:center;margin:10px 0 16px;font-size:13px"><input type="checkbox" id="cvx-share-prices" '+(CVX.sharePrices?'checked':'')+' onchange="CVX.sharePrices=this.checked" style="accent-color:var(--gold)"> Show individual card values</label>'+
 '<div class="cvx-mini" style="margin-bottom:10px">Total collection value and purchase costs are never shared. Shared links are snapshots and do not update automatically.</div>'+
 '<button class="btn btn-secondary" onclick="cvxPreviewShare()">👁 Preview Shared View</button>'+
 '<button class="btn btn-primary" onclick="cvxGenerateShare()">🔗 Generate Share Link</button>';
}
function cvxShareCards(){
 if(CVX.shareScope==='selected')return inventory.filter(c=>CVX.selected.has(c.id));
 if(CVX.shareScope==='player')return inventory.filter(c=>c.player===CVX.sharePlayer);
 return inventory.slice();
}
function cvxShareSnapshot(cards,includePrices){
 return cards.map(c=>{
  const copy={id:c.id,player:c.player,sport:c.sport,year:c.year,team:c.team,set:c.set,cardNum:c.cardNum,variation:c.variation,printRun:c.printRun,condition:c.condition,grade:c.grade,certNumber:c.certNumber};
  if(includePrices) copy.value=c.value;
  if(c.photo)copy.photo=c.photo;
  return copy;
 });
}
function cvxPreviewShare(){
 const cards=cvxShareCards();
 if(!cards.length){toast('Choose cards to preview first','error');return;}
 const snapshot=cvxShareSnapshot(cards,CVX.sharePrices);
 closeModal('modal-share');
 _renderSharedCards(snapshot);
 const view=se('shared-view');
 let banner=se('cvx-preview-controls');
 if(!banner){
  banner=document.createElement('div');banner.id='cvx-preview-controls';
  banner.style.cssText='padding:10px 16px;background:var(--gold-dim);border-bottom:1px solid var(--gold);';
  banner.innerHTML='<div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:8px">PREVIEW ONLY — No link created or data uploaded</div><button class="btn-sm gold" onclick="cvxEndPreview()">← Back to CardVault</button>';
  view.prepend(banner);
 }
 banner.style.display='block';
}
function cvxEndPreview(){
 closeSharedModal();
 const banner=se('cvx-preview-controls');if(banner)banner.style.display='none';
 se('shared-view').style.display='none';se('main-app').style.display='';
 openShareModal();
}

async function cvxGenerateShare(){
 const cards=cvxShareCards(),token=getKey('gist');
 if(!cards.length){toast('No cards in this selection','error');return;}
 if(!token){toast('Add your GitHub Gist token in Settings first','error');return;}
 const prices=CVX.sharePrices;
 se('share-body').innerHTML='<div class="market-empty">Preparing '+cards.length+' cards and photos…</div>';
 try{
  const snapshot=await Promise.all(cvxShareSnapshot(cards,prices).map(async card=>{
   if(card.photo)card.photo=await _compressForShare(card.photo,40*1024);
   return card;
  }));
  const r=await fetch('https://api.github.com/gists',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/vnd.github+json','Authorization':'Bearer '+token},body:JSON.stringify({description:'CardVault shared collection',public:false,files:{'collection.json':{content:JSON.stringify(snapshot)}}})});
  if(!r.ok)throw new Error('GitHub '+r.status+' '+(await r.text()).slice(0,150));
  const g=await r.json(),url=location.origin+location.pathname+'?gist='+encodeURIComponent(g.id);
  se('share-body').innerHTML='<div style="font-size:13px;color:var(--green);margin-bottom:10px">✅ Ready: '+snapshot.length+' cards</div><textarea id="cvx-share-link" class="form-input" rows="3" readonly></textarea><button class="btn btn-primary" onclick="copyText(se(\'cvx-share-link\').value).then(()=>toast(\'Link copied\',\'success\'))">Copy Link</button><button class="btn btn-secondary" onclick="cvxRenderShareMenu()">New Share</button>';
  se('cvx-share-link').value=url;
 }catch(e){se('share-body').textContent='Share failed: '+e.message;}
}
function cvxRenderSold(){
 const groups=new Map();
 soldHistory.forEach((s,i)=>{const k=s.transactionId||'legacy-'+i;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(s);});
 const count=soldHistory.length;
 const sum=(field)=>soldHistory.reduce((a,s)=>a+(Number(s[field])||0),0);
 se('s-count').textContent=count;se('s-rev').textContent=fmt(sum('salePrice'));
 const profit=sum('pl'),pl=se('s-pl');pl.textContent=fmtPL(profit);pl.style.color=profit>=0?'var(--green)':'var(--red)';
 se('sold-list').innerHTML=[...groups.values()].map(items=>{
  const total=k=>items.reduce((a,s)=>a+(Number(s[k])||0),0);
  const s=items[0],date=cvxEsc(s.dateSold||''),name=items.length===1?cvxEsc(s.player):items.length+'-Card Lot';
  const rows=items.map(c=>'<div class="detail-row"><div style="flex:1"><b>'+cvxEsc(c.player)+'</b><div class="cvx-mini">'+cvxEsc([c.year,c.set,c.variation,c.grade].filter(Boolean).join(' · '))+'</div></div><div style="text-align:right"><div>'+fmt(c.salePrice)+'</div><div style="color:'+(Number(c.pl)>=0?'var(--green)':'var(--red)')+'">'+fmtPL(c.pl)+'</div></div></div>').join('');
  return '<details class="cvx-group"><summary><div style="display:inline-flex;justify-content:space-between;width:calc(100% - 20px);gap:8px"><span>'+name+'<div class="cvx-mini">'+cvxEsc(s.platform||'')+' · '+date+'</div></span><span style="text-align:right">'+fmt(total('salePrice'))+'<div style="font-size:12px;color:'+(total('pl')>=0?'var(--green)':'var(--red)')+'">'+fmtPL(total('pl'))+'</div></span></div></summary><div style="padding-top:10px" class="cvx-mini">Gross '+fmt(total('salePrice'))+' · Fees '+fmt(total('fees'))+' · Shipping '+fmt(total('shipping'))+' · Other '+fmt(total('otherExpenses'))+' · Basis '+fmt(total('cost'))+'</div>'+rows+'</details>';
 }).join('')||'<div class="empty"><div class="empty-title">No Sales Yet</div></div>';
}
async function cvxExportBackup(){
 try{
  const photos=await dbGetAllPhotos();
  const data={format:'CardVaultFullBackup',version:1,exportedAt:new Date().toISOString(),inventory:inventory.map(c=>({...c})),soldHistory:soldHistory.map(c=>({...c})),photos};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='cardvault-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Backup export created','success');
 }catch(e){toast('Backup export failed: '+e.message,'error');}
}
async function cvxImportBackup(e){
 const f=e.target.files?.[0];e.target.value='';if(!f)return;
 try{
  const data=JSON.parse(await f.text());
  if(data.format!=='CardVaultFullBackup'||!Array.isArray(data.inventory)||!Array.isArray(data.soldHistory)||!data.photos||typeof data.photos!=='object')throw new Error('Not a valid CardVault backup');
  if(!confirm('Replace your current collection and sold history with this backup? This cannot be undone.'))return;
  const db=await openPhotoDB();const previousPhotos=await dbGetAllPhotos();
  const tx=db.transaction('photos','readwrite'),store=tx.objectStore('photos');store.clear();
  Object.entries(data.photos).forEach(([id,photo])=>{if(photo)store.put({id:Number(id)||id,data:photo});});
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  const oldInv=inventory,oldSold=soldHistory; inventory=data.inventory;soldHistory=data.soldHistory;
  try{save();}catch(err){
   inventory=oldInv;soldHistory=oldSold;
   const rollback=db.transaction('photos','readwrite'),obj=rollback.objectStore('photos');obj.clear();Object.entries(previousPhotos).forEach(([id,photo])=>obj.put({id:Number(id)||id,data:photo}));
   throw err;
  }
  location.reload();
 }catch(err){toast('Restore failed: '+err.message,'error');}
}
function cvxClearAllData(){
 if(!confirm('Delete ALL inventory and sold history?'))return;
 if(!confirm('This removes local photos and backups too. Continue?'))return;
 const dbPromise=openPhotoDB();
 try{
  inventory=[];soldHistory=[];
  localStorage.setItem(KEYS.inv,'[]');localStorage.setItem(KEYS.sold,'[]');
  localStorage.removeItem(KEYS.backup);localStorage.removeItem(KEYS.backupSold);
  localStorage.removeItem('cv_photos');
  dbPromise.then(db=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').clear();tx.oncomplete=()=>toast('All data deleted','success');}).catch(err=>toast('Photo cleanup failed: '+err.message,'error'));
  CVX.selected.clear();renderDash();renderInventory();renderSold();renderPlayers();updateHeader();showPage('dash');
 }catch(err){toast('Delete failed: '+err.message,'error');}
}
function cvxHideUnpriced(){
 document.querySelectorAll('.card-item[onclick^="openCard("]').forEach(row=>{
 const m=(row.getAttribute('onclick')||'').match(/openCard\((\d+)\)/);const c=m&&inventory.find(c=>c.id===Number(m[1]));
 if(c&&(c.needsPricing||!(Number(c.value)>0))){
  row.querySelectorAll('.price-pl').forEach(el=>{el.textContent='Not priced';el.className='price-pl';});
 }
 });
}
function cvxWrapApp(){
 const originalInventory=renderInventory,originalDash=renderDash,originalHeader=updateHeader,originalSold=renderSold,originalShare=openShareModal;
 renderInventory=function(){originalInventory();cvxHideUnpriced();cvxRenderSelection();};
 renderDash=function(){originalDash();cvxFixDash();cvxHideUnpriced();};
 updateHeader=function(){originalHeader();cvxFixHeader();};
 renderSold=function(){cvxRenderSold();};
 openShareModal=function(){originalShare();cvxRenderShareMenu();};
 clearAllData=function(){cvxClearAllData();};
 const origPlayer=openPlayerFolder;
 openPlayerFolder=function(name){origPlayer(name);const b=document.createElement('button');b.className='btn-sm gold';b.textContent='🔗 Share Player';b.style.marginBottom='12px';b.onclick=()=>cvxShowShare('player',name);se('player-detail-content').prepend(b);};
 const origInsight=renderInsights;
 renderInsights=function(){origInsight(); const ids=['i-gainers','i-losers'];ids.forEach(id=>{const el=se(id);if(!el)return;[...el.querySelectorAll('.card-item')].forEach(row=>{const m=(row.getAttribute('onclick')||'').match(/openCard\((\d+)\)/),c=m&&inventory.find(v=>v.id===Number(m[1]));if(c&&(c.needsPricing||!(Number(c.value)>0)))row.remove();});});};
}
cvxWrapApp();
cvxInit();
renderDash();renderSold();
