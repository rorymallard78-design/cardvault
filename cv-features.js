'use strict';
// CardVault development extension - changes isolated from original code.
var CVX={multi:false,selected:new Set(),saleIds:new Set(),matchLog:[],shareScope:'all',sharePlayer:''};
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
<button class="btn btn-primary" onclick="cvxCommitSale()">✅ Confirm & Record Sale</button>`;
  se('cvx-sale-date').value=new Date().toLocaleDateString('en-CA');
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

function cvxCommitSale(){
  const p=cvxSaleNumbers(), date=se('cvx-sale-date').value,platform=se('cvx-platform').value;
  if(!p.selected.length){toast('Select one or more cards','error');return;}
  if(!Number.isFinite(p.gross)||p.gross<=0){toast('Enter a positive gross sale price','error');return;}
  if(![p.fees,p.shipping,p.other].every(x=>Number.isFinite(x)&&x>=0)){toast('Fees and expenses cannot be negative','error');return;}
  if(p.net<0){toast('Expenses exceed sale price. Check totals.','error');return;}
  if(!date){toast('Enter a sale date','error');return;}
  if(!confirm('Record sale of '+p.selected.length+' cards for '+fmt(p.gross)+' gross, '+fmt(p.net)+' net? Cards will move to Sold History.'))return;
  const weights=p.selected.map(c=>Math.max(0,Number(c.cost)||0)),txn='lot-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
  const gross=cvxAllocateCents(p.gross,weights),fees=cvxAllocateCents(p.fees,weights),shipping=cvxAllocateCents(p.shipping,weights),other=cvxAllocateCents(p.other,weights);
  const notes=se('cvx-sale-notes').value.trim();
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
  try{
    soldHistory=[...records,...soldHistory];
    inventory=inventory.filter(c=>!CVX.saleIds.has(c.id));
    save();
  }catch(e){inventory=oldInv;soldHistory=oldSold;toast('Sale not saved: '+e.message,'error');return;}
  CVX.saleIds.clear();CVX.selected.clear();CVX.multi=false;
  se('cvx-select-btn').textContent='☑ Select';
  closeModal('cvx-sale-modal');
  if(se('modal-detail').classList.contains('open'))closeModal('modal-detail');
  renderDash();renderInventory();renderPlayers();renderSold();showPage('sold');
  toast('✅ Sale recorded — '+p.selected.length+' cards','success');
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
