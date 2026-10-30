'use strict';
var CVE={ids:[],mode:''};
function cveMembers(id){const s=soldHistory.find(x=>Number(x.id)===Number(id));return !s?[]:s.transactionId?soldHistory.filter(x=>x.transactionId===s.transactionId):[s];}
function cveMoney(id,label,value){return '<div class="form-group"><label class="form-label">'+label+'</label><input class="form-input" type="number" step=".01" min="0" id="'+id+'" value="'+String(value??0)+'"></div>';}
function cveOpen(title,html){se('cve-title').textContent=title;se('cve-body').innerHTML=html;openModal('cve-modal');}
function cveTransaction(id){
 const items=cveMembers(id);if(!items.length)return;CVE.ids=items.map(x=>x.id);CVE.mode=items.length===1?'single':'lot';
 const sum=k=>Math.round(items.reduce((a,s)=>a+Number(s[k]||0),0)*100)/100;
 const s=items[0];
 let html='<div class="cvx-mini">Original sale identifiers, linked receipts, and grading records remain unchanged. Corrections are logged.</div><div class="cvx-grid">'+
 cveMoney('cve-gross','Gross sale',sum('salePrice'))+cveMoney('cve-fees','Fees',sum('fees'))+cveMoney('cve-ship','Shipping',sum('shipping'))+cveMoney('cve-other','Other expenses',sum('otherExpenses'))+'</div>'+
 '<div class="form-group"><label class="form-label">Sale date</label><input class="form-input" type="date" id="cve-date" value="'+cvxEsc(s.dateSold||'')+'"></div>'+
 '<div class="form-group"><label class="form-label">Platform</label><input class="form-input" id="cve-platform" value="'+cvxEsc(s.platform||'')+'"></div>'+
 '<div class="form-group"><label class="form-label">Correction reason (optional)</label><textarea class="form-textarea" id="cve-note"></textarea></div>'+
 '<div id="cve-error" style="color:var(--red);font-size:12px"></div><button class="btn btn-primary" onclick="cveSaveSale()">Save Transaction</button>';
 if(items.length>1)html+='<div class="cvx-mini" style="margin:12px 0">Totals are allocated proportionally to existing amounts. Edit an individual card below to override its share.</div>'+
 items.map(x=>'<div class="detail-row"><span>'+cvxEsc(x.player)+'</span><button class="btn-sm" onclick="cveIndividual('+Number(x.id)+')">Edit Card</button></div>').join('');
 if(items.length===1)html+='<button class="btn btn-secondary" onclick="cveIndividual('+Number(s.id)+')">Edit Individual Card Cost</button>';
 cveOpen('Edit '+(items.length===1?'Sale':items.length+'-Card Sale'),html);
}
function cveIndividual(id){
 const s=soldHistory.find(x=>Number(x.id)===Number(id));if(!s)return;
 CVE.ids=[s.id];CVE.mode='individual';
 cveOpen('Edit Sold Card — '+s.player,'<div class="cvx-grid">'+cveMoney('cve-gross','Sale allocation',s.salePrice)+cveMoney('cve-fees','Fees',s.fees||0)+cveMoney('cve-ship','Shipping',s.shipping||0)+cveMoney('cve-other','Other',s.otherExpenses||0)+cveMoney('cve-cost','Card cost',s.cost||0)+'</div>'+
 '<div class="form-group"><label class="form-label">Cost status</label><select class="form-select" id="cve-status">'+[['known','Known'],['free','Free'],['estimated','Estimated'],['unknown','Unknown']].map(([v,t])=>'<option value="'+v+'" '+((s.basisStatus||((Number(s.cost)||0)>0?'known':'unknown'))===v?'selected':'')+'>'+t+'</option>').join('')+'</select></div>'+
 '<div class="form-group"><label class="form-label">Sale date</label><input class="form-input" type="date" id="cve-date" value="'+cvxEsc(s.dateSold||'')+'"></div>'+
 '<div class="form-group"><label class="form-label">Platform</label><input class="form-input" id="cve-platform" value="'+cvxEsc(s.platform||'')+'"></div>'+
 '<div class="form-group"><label class="form-label">Correction reason</label><textarea class="form-textarea" id="cve-note"></textarea></div>'+
 '<div id="cve-error" style="color:var(--red);font-size:12px"></div><button class="btn btn-primary" onclick="cveSaveSale()">Save Card Corrections</button>');
}
function cveSaveSale(){
 const items=CVE.ids.map(id=>soldHistory.find(x=>Number(x.id)===Number(id))),error=se('cve-error');
 if(items.some(x=>!x)){error.textContent='Reopen the transaction.';return;}
 const keys=['gross','fees','ship','other'],raw=keys.map(k=>se('cve-'+k).value.trim());
 if(raw.some(v=>!v||!Number.isFinite(Number(v))||Number(v)<0)){error.textContent='Enter valid amounts.';return;}
 const [gross,fees,ship,other]=raw.map(v=>Math.round(Number(v)*100)/100);
 if(raw.some((v,i)=>Math.abs(Number(v)*100-Math.round(Number(v)*100))>0.00001)){error.textContent='Enter amounts in dollars and cents.';return;}
 if(gross<=0||fees+ship+other>gross+.001){error.textContent='Sale must cover expenses.';return;}
 const date=se('cve-date').value,platform=se('cve-platform').value.trim();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!platform){error.textContent='Enter a date and platform.';return;}
 let cost=0,status='';
 if(CVE.mode==='individual'){
  cost=Number(se('cve-cost').value);status=se('cve-status').value;
  if(!Number.isFinite(cost)||cost<0||Math.abs(cost*100-Math.round(cost*100))>0.00001||(status==='free'&&cost!==Number(items[0].gradingCosts||0))||(status==='known'&&cost<=0)||cost+0.001<Number(items[0].gradingCosts||0)){error.textContent='Check cost, grading expenses and cost status.';return;}
 }
 const prior=items.map(x=>JSON.parse(JSON.stringify(x)));
 const allocate=(total,field)=>{if(CVE.mode!=='lot')return [total];const old=Math.round(items.reduce((a,x)=>a+Number(x[field]||0),0)*100)/100;if(total===old)return items.map(x=>Number(x[field]||0));return cvxAllocateCents(total,items.map(x=>Number(x[field])||0));};
 const amounts={salePrice:allocate(gross,'salePrice'),fees:allocate(fees,'fees'),shipping:allocate(ship,'shipping'),otherExpenses:allocate(other,'otherExpenses')};
 try{
  items.forEach((s,i)=>{
   const before=prior[i];
   for(const k of Object.keys(amounts))s[k]=amounts[k][i];
   s.dateSold=date;s.platform=platform;
   if(CVE.mode==='individual'){s.cost=Math.round(cost*100)/100;s.basisStatus=status;}
   s.netProceeds=Math.round((s.salePrice-s.fees-s.shipping-s.otherExpenses)*100)/100;
   s.pl=Math.round((s.netProceeds-Number(s.cost||0))*100)/100;
   s.saleCorrections=[...(s.saleCorrections||[]),{at:new Date().toISOString(),reason:se('cve-note').value.trim(),before:{
    gross:before.salePrice,fees:before.fees||0,shipping:before.shipping||0,other:before.otherExpenses||0,cost:before.cost,date:before.dateSold,platform:before.platform},
    after:{gross:s.salePrice,fees:s.fees,shipping:s.shipping,other:s.otherExpenses,cost:s.cost,date:s.dateSold,platform:s.platform}}];
  });
  save();closeModal('cve-modal');renderSold();renderDash();if(typeof cviRender==='function')cviRender();toast('Corrections saved','success');
 }catch(e){items.forEach((s,i)=>{Object.keys(s).forEach(k=>delete s[k]);Object.assign(s,prior[i]);});error.textContent='Save failed: '+e.message;}
}
function cveBulk(){
 const cards=[...CVX.selected].map(id=>inventory.find(c=>Number(c.id)===Number(id))).filter(Boolean);
 if(!cards.length)return;CVE.ids=cards.map(c=>c.id);
 cveOpen('Bulk Edit · '+cards.length+' Cards','<div class="cvx-mini">Update individual costs and market values for these selected inventory cards.</div>'+
 cards.map((c,i)=>'<div style="padding:10px 0;border-bottom:1px solid var(--border)"><b>'+cvxEsc(c.player)+'</b><div class="cvx-grid">'+cveMoney('cve-ic-'+i,'Purchase cost',c.cost||0)+
 '<div class="form-group"><label class="form-label">Estimated value</label><input class="form-input" id="cve-iv-'+i+'" type="number" step=".01" min="0" placeholder="Needs pricing" value="'+(Number(c.value)>0?Number(c.value):'')+'"></div></div></div>').join('')+
 '<div id="cve-error" style="color:var(--red);font-size:12px"></div><button class="btn btn-primary" onclick="cveSaveBulk()">Save Inventory Edits</button>');
}
function cveSaveBulk(){
 const cards=CVE.ids.map(id=>inventory.find(c=>Number(c.id)===Number(id))),error=se('cve-error');
 const input=cards.map((c,i)=>({c,cost:se('cve-ic-'+i).value,value:se('cve-iv-'+i).value}));
 if(input.some(x=>!x.c||x.cost===''||!Number.isFinite(Number(x.cost))||Number(x.cost)<0||Math.abs(Number(x.cost)*100-Math.round(Number(x.cost)*100))>0.00001||Number(x.cost)<Number(x.c.gradingCosts||0)||
 (x.value!==''&&(!Number.isFinite(Number(x.value))||Number(x.value)<0)))){error.textContent='Review all amounts; cost cannot be below grading expenses.';return;}
 const old=cards.map(c=>JSON.parse(JSON.stringify(c)));
 try{
  input.forEach((x,i)=>{const cost=Math.round(Number(x.cost)*100)/100,value=x.value===''?0:Math.round(Number(x.value)*100)/100;
   if(Number(x.c.cost)===cost&&Number(x.c.value||0)===value&&x.c.needsPricing===(value===0))return;
   x.c.editHistory=[...(x.c.editHistory||[]),{at:new Date().toISOString(),oldCost:x.c.cost,oldValue:x.c.value,newCost:cost,newValue:value}];
   x.c.cost=cost;x.c.value=value;x.c.needsPricing=value===0;
  });save();closeModal('cve-modal');CVX.selected.clear();renderInventory();renderDash();renderPlayers();updateHeader();toast('Bulk edits saved','success');
 }catch(e){cards.forEach((c,i)=>{Object.keys(c).forEach(k=>delete c[k]);Object.assign(c,old[i]);});error.textContent=e.message;}
}
function cveInit(){
 const modal=document.createElement('div');modal.id='cve-modal';modal.className='overlay';modal.style.zIndex='490';
 modal.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-header"><div class="sheet-title" id="cve-title">Edit</div><button class="sheet-close" onclick="closeModal(\'cve-modal\')">✕</button></div><div class="sheet-body" id="cve-body"></div></div>';
 document.body.append(modal);
 const oldSold=renderSold;
 renderSold=function(){oldSold();
  const groups=new Map();soldHistory.forEach((s,i)=>{const k=s.transactionId||'legacy-'+i;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(s);});
  [...se('sold-list').querySelectorAll('.cvx-group')].forEach((el,i)=>{
   const group=[...groups.values()][i];if(!group)return;
   const b=document.createElement('button');b.className='btn-sm gold';b.textContent='✎ Edit Transaction';b.style.marginTop='10px';b.onclick=()=>cveTransaction(group[0].id);el.append(b);
  });
 };
 const oldSelection=cvxRenderSelection;
 cvxRenderSelection=function(){oldSelection();if(!CVX.multi)return;
  const bar=se('cvx-toolbar');if(!bar)return;
  const b=document.createElement('button');b.className='btn-sm gold';b.textContent='✎ Bulk Edit';b.disabled=CVX.selected.size===0;b.onclick=cveBulk;bar.append(b);
 };
 renderSold();
}
if(!new URLSearchParams(location.search).has('gist'))cveInit();
