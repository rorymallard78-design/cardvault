'use strict';
// CardVault beta Grading Center: metadata in isolated localStorage; no changes to card IDs.
var CVG={
  key:'',items:[],currentId:null,selected:new Set(),filter:'active',dbLoaded:false
};
function cvgStart(){
  CVG.key=KEYS.inv.startsWith('cv_beta_')?'cv_beta_grading':'cv_grading';
  try{const v=JSON.parse(localStorage.getItem(CVG.key)||'[]');CVG.items=Array.isArray(v)?v:[];}catch(e){CVG.items=[];console.error('Could not load grading records',e);}
  const css=document.createElement('style');
  css.textContent='.cvg-stat{background:var(--bg2);border:1px solid var(--border2);padding:12px;border-radius:11px}.cvg-stat strong{font-family:"DM Mono",monospace;font-size:17px;color:var(--gold);display:block}.cvg-stat span{font-size:11px;color:var(--text2)}.cvg-row{display:flex;gap:10px;align-items:flex-start;padding:11px;border:1px solid var(--border2);border-radius:10px;margin:9px 0;background:var(--bg2)}.cvg-mini{font-size:11px;color:var(--text2);line-height:1.55}.cvg-tabs{display:flex;gap:7px;margin:10px 0}.cvg-tabs button{flex:1;min-width:0}.cvg-box{border:1px solid var(--border2);border-radius:10px;padding:11px;margin:10px 0;background:var(--bg3)}.cvg-label{font-size:12px;font-weight:600;color:var(--text2);margin:6px 0}.cvg-thumb{width:44px;height:59px;object-fit:contain;background:var(--bg4);border-radius:5px;flex-shrink:0}.cvg-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.cvg-status{display:inline-block;padding:3px 6px;background:var(--gold-dim);color:var(--gold);border-radius:5px;font-size:10px;text-transform:uppercase;font-weight:700}.cvg-error{color:var(--red);font-size:12px;margin:8px 0;min-height:12px}';
  document.head.appendChild(css);
  const page=document.createElement('div');page.className='page';page.id='page-grading';
  page.innerHTML='<div class="sec-header"><div><div class="sec-title">Grading</div><div class="sec-sub">Submissions and grading costs</div></div><button class="btn-sm gold" onclick="cvgNew()">+ New</button></div><div id="cvg-stat-grid" class="cvg-grid"></div><div class="cvg-tabs" id="cvg-tabs"></div><div id="cvg-list"></div>';
  document.querySelector('nav.nav').before(page);
  const tab=document.createElement('button');tab.className='nav-btn';tab.id='nav-grading';tab.setAttribute('onclick',"showPage('grading')");tab.innerHTML='<span class="nav-icon">🏅</span>Grading';
  document.querySelector('nav.nav').appendChild(tab);
  const modal=document.createElement('div');modal.className='overlay';modal.id='cvg-modal';modal.style.zIndex='420';
  modal.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-header"><div class="sheet-title" id="cvg-modal-title">Grading</div><button class="sheet-close" onclick="closeModal(\'cvg-modal\')">✕</button></div><div class="sheet-body" id="cvg-body"></div></div>';
  document.body.append(modal);
  const old=showPage;showPage=function(name){old(name);if(name==='grading')cvgRender();};
  const quick=se('page-dash').querySelector('.dash-grid');
  if(quick){const d=document.createElement('div');d.id='cvg-dash';quick.before(d);}
  cvgDash();
}
function cvgSave(){localStorage.setItem(CVG.key,JSON.stringify(CVG.items));}
function cvgEsc(s){return cvxEsc(s);}
function cvgDollars(v){return Math.round((Number(v)||0)*100)/100;}
function cvgCents(v){return Math.round(Number(v)*100);}
function cvgDate(d){const s=String(d||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const [y,m,day]=s.split('-');return m+'/'+day+'/'+y;}
function cvgDay(){const d=new Date();return[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function cvgCard(id){return inventory.find(c=>Number(c.id)===Number(id));}
function cvgSold(id){return soldHistory.find(c=>Number(c.cardId)===Number(id));}
function cvgLabel(card){return card?[card.player,card.year,card.set,card.variation,card.grade].filter(Boolean).join(' · ') :'Missing card';}
function cvgCompany(s){return ['PSA','BGS','SGC','CGC','Other'].includes(s)?s:'Other';}
function cvgBusy(id,except){
 return CVG.items.some(x=>x.id!==except&&!['returned','cancelled'].includes(x.status)&&x.cards.some(c=>Number(c.cardId)===Number(id)));
}
function cvgInput(id,label,kind='text',value='',other=''){
 return '<div class="form-group"><label class="form-label" for="'+id+'">'+label+'</label><input class="form-input" id="'+id+'" type="'+kind+'" '+other+' value="'+cvgEsc(String(value??''))+'"></div>';
}
function cvgStatusOptions(selected){
 return [['draft','Draft'],['shipped','Shipped to Grader'],['received','Received by Grader'],['grading','Grading'],['assembly','Assembly'],['qa','Quality Check'],['return-shipped','Return Shipping'],['returned','Returned'],['cancelled','Cancelled']].map(([value,label])=>'<option value="'+value+'" '+(selected===value?'selected':'')+'>'+label+'</option>').join('');
}
function cvgDash(){
 const active=CVG.items.filter(x=>!['returned','cancelled'].includes(x.status)).length;
 const el=se('cvg-dash');if(el)el.innerHTML='<button class="btn btn-secondary" style="margin:0 0 12px;text-align:left;border-color:var(--border2)" onclick="showPage(\'grading\')">🏅 Grading · '+active+' Active Submission'+(active===1?'':'s')+' ›</button>';
}
function cvgRender(){
 const active=CVG.items.filter(x=>!['returned','cancelled'].includes(x.status));
 const completed=CVG.items.filter(x=>['returned','cancelled'].includes(x.status));
 const exp=CVG.items.reduce((sum,x)=>sum+(x.expensesApplied||0),0);
 const graded=CVG.items.flatMap(x=>x.cards.filter(c=>c.resultApplied&&c.grade));
 const tens=graded.filter(c=>/^(10|10\.0)$/.test(String(c.grade))).length;
 const stats=[['Active',active.length],['Cards in Grading',active.reduce((n,x)=>n+x.cards.length,0)],['Recorded Costs',fmt(exp)],['Returned Grades',graded.length+(graded.length?' · '+Math.round(tens/graded.length*100)+'% 10s':'')]];
 se('cvg-stat-grid').innerHTML=stats.map(([label,val])=>'<div class="cvg-stat"><strong>'+val+'</strong><span>'+label+'</span></div>').join('');
 se('cvg-tabs').innerHTML='<button class="btn btn-secondary" style="'+(CVG.filter==='active'?'border-color:var(--gold);color:var(--gold)':'')+'" onclick="CVG.filter=\'active\';cvgRender()">Active ('+active.length+')</button><button class="btn btn-secondary" style="'+(CVG.filter==='history'?'border-color:var(--gold);color:var(--gold)':'')+'" onclick="CVG.filter=\'history\';cvgRender()">History ('+completed.length+')</button>';
 const data=(CVG.filter==='history'?completed:active).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
 se('cvg-list').innerHTML=data.map(x=>{
  const gradedCount=x.cards.filter(c=>c.resultApplied).length;
  return '<div class="cvg-row" role="button" tabindex="0" onclick="cvgView('+x.id+')" onkeydown="if(event.key===\'Enter\')cvgView('+x.id+')"><div style="font-size:26px">🏅</div><div style="flex:1;min-width:0"><div style="font-weight:700">'+cvgEsc(x.company)+' · '+x.cards.length+' card'+(x.cards.length===1?'':'s')+'</div><div class="cvg-mini">'+cvgEsc(x.order||'No order #')+' · '+cvgDate(x.date)+' · '+cvgEsc(x.service||'Standard')+'</div><div class="cvg-mini">Costs applied: '+fmt(x.expensesApplied||0)+' · '+gradedCount+'/'+x.cards.length+' grades recorded</div><span class="cvg-status">'+cvgEsc(x.status)+'</span></div><span>›</span></div>';
 }).join('')||'<div class="empty"><div class="empty-icon">🏅</div><div class="empty-title">No '+(CVG.filter==='history'?'Completed':'Active')+' Submissions</div><div class="empty-sub">Select existing cards and track your next submission.</div></div>';
 cvgDash();
}
function cvgNew(){
 CVG.selected=new Set();
 se('cvg-modal-title').textContent='New Grading Submission';
 se('cvg-body').innerHTML='<div class="cvg-mini" style="margin-bottom:12px">Choose existing cards. Record actual grading expenses after they are charged. Costs will be added to each card’s basis only once.</div>'+
 '<div class="cvg-grid">'+
 '<div class="form-group"><label class="form-label">Grading Company</label><select id="cvg-company" class="form-select"><option>PSA</option><option>BGS</option><option>SGC</option><option>CGC</option><option>Other</option></select></div>'+
 '<div class="form-group"><label class="form-label">Submission Date</label><input id="cvg-date" type="date" class="form-input" value="'+cvgDay()+'"></div>'+
 '</div>'+cvgInput('cvg-order','Order / Submission Number (optional)')+cvgInput('cvg-service','Service Level (optional)')+
 '<div class="form-group"><label class="form-label">Find Cards in Inventory</label><input id="cvg-search" class="form-input" placeholder="Search player, parallel, grade…" oninput="cvgCandidates()"></div>'+
 '<div class="cvg-mini" id="cvg-selected"></div><div id="cvg-candidates" style="max-height:300px;overflow-y:auto"></div>'+
 '<div id="cvg-error" class="cvg-error"></div><button class="btn btn-primary" onclick="cvgCreate()">Create Submission</button>';
 se('cvg-service').value='Regular';
 openModal('cvg-modal');cvgCandidates();
}
function cvgCandidates(){
 const q=(se('cvg-search')?.value||'').trim().toLowerCase();
 const shown=inventory.filter(c=>!cvgBusy(c.id)&&(!q||[c.player,c.year,c.set,c.variation,c.grade,c.certNumber].some(v=>String(v||'').toLowerCase().includes(q)))).slice(0,80);
 se('cvg-selected').textContent=CVG.selected.size+' selected · cards already in another active submission are excluded';
 se('cvg-candidates').innerHTML=shown.map(c=>'<label class="cvg-row" style="align-items:center"><input type="checkbox" style="accent-color:var(--gold);height:18px;width:18px" '+(CVG.selected.has(Number(c.id))?'checked':'')+' onchange="cvgSelect('+Number(c.id)+',this.checked)"><div style="flex:1"><b>'+cvgEsc(c.player)+'</b><div class="cvg-mini">'+cvgEsc([c.year,c.set,c.variation,c.grade,c.certNumber].filter(Boolean).join(' · '))+'</div></div></label>').join('')||'<div class="cvg-mini" style="padding:12px">No available inventory matches</div>';
}
function cvgSelect(id,checked){if(checked)CVG.selected.add(id);else CVG.selected.delete(id);cvgCandidates();}
function cvgError(s){const el=se('cvg-error');if(el)el.textContent=s;toast(s,'error');}
function cvgCreate(){
 const company=cvgCompany(se('cvg-company').value),order=se('cvg-order').value.trim(),service=se('cvg-service').value.trim();
 const date=se('cvg-date').value;
 if(!CVG.selected.size)return cvgError('Select one or more existing inventory cards.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return cvgError('Choose a valid submission date.');
 const cards=[...CVG.selected].map(cardId=>({cardId,initialGrade:cvgCard(cardId)?.grade||'',initialCondition:cvgCard(cardId)?.condition||'',rawValue:Number(cvgCard(cardId)?.value)>0?Number(cvgCard(cardId).value):null,grade:'',cert:'',resultApplied:false}));
 if(cards.some(c=>!cvgCard(c.cardId)||cvgBusy(c.cardId)))return cvgError('A selected card is missing or already in an active grading submission.');
 const rec={id:Date.now()*1000+Math.floor(Math.random()*900),company,order,service,date,status:'draft',statusUpdatedAt:new Date().toISOString(),cards,feeEach:0,outbound:0,returnShipping:0,insurance:0,upcharges:0,other:0,expensesApplied:0,allocations:{},notes:'',returnedDate:''};
 const old=CVG.items.slice();CVG.items.unshift(rec);
 try{cvgSave();closeModal('cvg-modal');showPage('grading');cvgView(rec.id);toast('Grading submission created','success');}
 catch(e){CVG.items=old;cvgError('Could not save submission: '+e.message);}
}

function cvgView(id){
 const x=CVG.items.find(v=>v.id===id);if(!x)return;CVG.currentId=id;
 se('cvg-modal-title').textContent=x.company+' Submission';
 const expense=(x.feeEach||0)*x.cards.length+(x.outbound||0)+(x.returnShipping||0)+(x.insurance||0)+(x.upcharges||0)+(x.other||0);
 const num=(name,label,value)=>cvgInput('cvg-'+name,label,'number',value,'min="0" step="0.01" inputmode="decimal"');
 se('cvg-body').innerHTML='<div class="cvg-mini">Created '+cvgDate(x.date)+' · '+x.cards.length+' cards</div>'+
 '<div class="cvg-grid">'+
 '<div class="form-group"><label class="form-label">Status</label><select class="form-select" id="cvg-status">'+cvgStatusOptions(x.status)+'</select></div>'+
 '<div class="form-group"><label class="form-label">Return Date</label><input class="form-input" id="cvg-return-date" type="date" value="'+cvgEsc(x.returnedDate||'')+'"></div></div>'+
 cvgInput('cvg-order-edit','Order Number','text',x.order)+cvgInput('cvg-service-edit','Service Level','text',x.service)+
 '<div class="cvg-box"><b>Actual Grading Expenses</b><div class="cvg-mini">These are added to card basis. Save changes to update cost allocations.</div><div class="cvg-grid">'+
 num('fee','Fee per Card',x.feeEach)+num('outbound','Outbound Shipping',x.outbound)+num('return','Return Shipping',x.returnShipping)+num('insurance','Insurance',x.insurance)+num('upcharges','Upcharges (Total)',x.upcharges)+num('other','Other Costs',x.other)+'</div>'+
 '<div class="cvg-mini">Current input total: '+fmt(expense)+' · Already applied: '+fmt(x.expensesApplied||0)+'</div></div>'+
 '<div class="cvg-box"><b>Cards & Grades</b><div class="cvg-mini">Enter grade and cert when returned; blank grade leaves the original card unchanged.</div>'+
 x.cards.map((r,i)=>{
  const c=cvgCard(r.cardId),sold=cvgSold(r.cardId);
  const label=cvgEsc(cvgLabel(c||sold||{player:'Missing card',year:'',set:''}));
  return '<div class="cvg-row"><div style="flex:1;min-width:0"><b>'+label+'</b><div class="cvg-mini">Original grade: '+cvgEsc(r.initialGrade||'Raw')+' · '+(c?'Inventory':sold?'Sold':'Not in inventory')+'</div>'+
  '<div class="cvg-grid" style="margin-top:8px">'+
  cvgInput('cvg-grade-'+i,'New Grade','text',r.grade||'')+
  cvgInput('cvg-cert-'+i,'Certification #','text',r.cert||'')+'</div>'+
  '<div class="cvg-mini">'+(r.resultApplied?'✓ Recorded':'Awaiting result')+'</div></div></div>';
 }).join('')+'</div>'+
 '<div class="form-group"><label class="form-label">Submission Notes</label><textarea id="cvg-notes" class="form-input" rows="3">'+cvgEsc(x.notes||'')+'</textarea></div>'+
 '<div class="cvg-error" id="cvg-error"></div><button class="btn btn-primary" id="cvg-save-btn" onclick="cvgUpdate()">Save Submission & Update Costs</button>'+
 '<div class="cvg-mini" style="margin:10px 0">Grades update inventory cards only. Sold cards retain their prior sale records. Costs on already-sold cards are not changed automatically.</div>';
 openModal('cvg-modal');
}
function cvgAllocate(total,cardIds){
 const cents=Math.round(total*100);let left=cents;
 return Object.fromEntries(cardIds.map((id,i)=>{
  const centsHere=i===cardIds.length-1?left:Math.floor(cents/cardIds.length);left-=centsHere;return [String(id),centsHere/100];
 }));
}
function cvgUpdate(){
 const x=CVG.items.find(v=>v.id===CVG.currentId);if(!x)return;
 const error=se('cvg-error'),btn=se('cvg-save-btn');
 error.textContent='';
 const get=name=>Number(se('cvg-'+name)?.value||0);
 const fee=get('fee'),outbound=get('outbound'),returnShipping=get('return'),insurance=get('insurance'),upcharges=get('upcharges'),other=get('other');
 if([fee,outbound,returnShipping,insurance,upcharges,other].some(n=>!Number.isFinite(n)||n<0||n>10000000)){error.textContent='Expenses must be valid nonnegative amounts.';return;}
 const status=se('cvg-status').value;
 const date=se('cvg-return-date').value;
 if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date)){error.textContent='Invalid return date';return;}
 if(status==='returned'&&x.cards.some((r,i)=>!se('cvg-grade-'+i).value.trim())){
  error.textContent='Enter all returned grades, or use Return Shipping until grades are known.';return;
 }
 const proposed=x.cards.map((r,i)=>({...r,grade:se('cvg-grade-'+i).value.trim(),cert:se('cvg-cert-'+i).value.trim()}));
 const total=Math.round((fee*x.cards.length+outbound+returnShipping+insurance+upcharges+other)*100)/100;
 const alloc=cvgAllocate(total,x.cards.map(c=>c.cardId));
 const changed=x.cards.some((r,i)=>r.resultApplied&&r.grade!==proposed[i].grade);
 if(changed){error.textContent='A previously posted grade cannot be replaced here. Edit that card in inventory or use a new review submission.';return;}
 // Never silently change the recorded economics of a sold card.
 if(x.cards.some(c=>!cvgCard(c.cardId)&&Math.abs((alloc[String(c.cardId)]||0)-(x.allocations?.[String(c.cardId)]||0))>0.001)){
  error.textContent='A card from this submission was sold. Cost edits would require correcting its sale record first.';return;
 }
 if(x.cards.some((c,i)=>proposed[i].grade&&!cvgCard(c.cardId)&&!c.resultApplied)){
  error.textContent='Cannot post a new grade for a card no longer in inventory.';return;
 }
 const beforeInventory=inventory.map(c=>({...c})),before=JSON.parse(JSON.stringify(x));
 const updates=proposed.map((c,i)=>{const orig=x.cards[i],card=cvgCard(c.cardId);return {c,orig,card};});
 btn.disabled=true;
 try{
  for(const {c,orig,card} of updates){
   if(!card)continue;
   const oldCharge=Number(x.allocations?.[String(c.cardId)]||0),newCharge=Number(alloc[String(c.cardId)]||0);
   const diff=Math.round((newCharge-oldCharge)*100)/100;
   card.cost=Math.round((Number(card.cost||0)+diff)*100)/100;
   card.gradingCosts=Math.round((Number(card.gradingCosts||0)+diff)*100)/100;
   if(c.grade&&!orig.resultApplied){
    card.grade=c.grade;card.condition='Graded';card.certNumber=c.cert||card.certNumber;
    card.gradingHistory=[...(card.gradingHistory||[]),{submissionId:x.id,company:x.company,grade:c.grade,cert:c.cert,recordedAt:new Date().toISOString()}];
   }
  }
  x.cards=proposed.map((c,i)=>({...c,resultApplied:x.cards[i].resultApplied||Boolean(c.grade)}));
  Object.assign(x,{status,returnedDate:date,order:se('cvg-order-edit').value.trim(),service:se('cvg-service-edit').value.trim(),feeEach:fee,outbound,returnShipping,insurance,upcharges,other,expensesApplied:total,allocations:alloc,notes:se('cvg-notes').value,statusUpdatedAt:new Date().toISOString()});
  save();cvgSave();
  closeModal('cvg-modal');renderDash();renderInventory();renderPlayers();cvgRender();
  toast('Submission saved · card costs updated','success');
 }catch(err){
  inventory=beforeInventory;Object.assign(x,before);
  try{save();cvgSave();}catch(e){console.error('Grading rollback failed',e);}
  error.textContent='Save failed: '+err.message;btn.disabled=false;
 }
}
function cvgExport(){return CVG.items.map(x=>({...x,cards:x.cards.map(c=>({...c}))}));}
function cvgValidateBackup(data){
 if(data.grading===undefined)return;
 if(!Array.isArray(data.grading))throw Error('Invalid grading backup');
 const ids=new Set();
 for(const x of data.grading){
  if(!x||!Number.isSafeInteger(Number(x.id))||ids.has(x.id)||!Array.isArray(x.cards)||!['PSA','BGS','SGC','CGC','Other'].includes(x.company)||!['draft','shipped','received','grading','assembly','qa','return-shipped','returned','cancelled'].includes(x.status))throw Error('Invalid grading submission');
  ids.add(x.id);
  if(x.cards.some(c=>!Number.isSafeInteger(Number(c.cardId))))throw Error('Invalid grading card');
 }
}
function cvgRestore(data){
 cvgValidateBackup(data);
 const old=CVG.items;
 CVG.items=(data.grading||[]).map(x=>({...x,cards:x.cards.map(c=>({...c}))}));
 try{cvgSave();}catch(e){CVG.items=old;throw e;}
}
if(!new URLSearchParams(location.search).has('gist'))cvgStart();
