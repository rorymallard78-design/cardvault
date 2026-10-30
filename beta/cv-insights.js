'use strict';
// Insights data is computed read-only; a specific review action may update a sale cost/status.
var CVI={period:'all',player:'all',sport:'all',platform:'all',reviewId:null};
function cviCostStatus(o){
 const s=String(o.basisStatus||'').toLowerCase();
 if(['known','free','estimated','unknown'].includes(s))return s;
 const n=Number(o.cost);
 if(o.cost!==null&&o.cost!==undefined&&o.cost!==''&&Number.isFinite(n)&&n>0)return 'known';
 return 'unknown'; // A legacy zero cannot safely be assumed to mean free.
}
function cviNum(n){const x=Number(n);return Number.isFinite(x)?x:0;}
function cviRound(n){return Math.round((n+Number.EPSILON)*100)/100;}
function cviDay(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function cviStart(period,today){
 if(period==='all')return '';
 if(period==='ytd')return today.slice(0,4)+'-01-01';
 if(!['30','90'].includes(period))return '';
 const d=new Date(+today.slice(0,4),+today.slice(5,7)-1,+today.slice(8,10));
 d.setDate(d.getDate()-(Number(period)-1));
 return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function cviSale(s){
 const gross=cviNum(s.salePrice),fees=cviNum(s.fees),shipping=cviNum(s.shipping),other=cviNum(s.otherExpenses),cost=cviNum(s.cost);
 const net=cviRound(gross-fees-shipping-other),profit=cviRound(net-cost),status=cviCostStatus(s);
 const original=(s.pl!=null&&s.pl!==''&&Number.isFinite(Number(s.pl)))?Number(s.pl):null;
 return {raw:s,id:Number(s.id),date:String(s.dateSold||s.soldDate||'').slice(0,10),player:String(s.player||'Unknown'),
  sport:String(s.sport||'Other'),platform:String(s.platform||'Unspecified'),gross,net,cost,profit,status,
  discrepancy:original!==null&&Math.abs(original-profit)>0.02};
}
function cviData(){
 const today=cviDay(),start=cviStart(CVI.period,today);
 const sales=soldHistory.map(cviSale).filter(s=>
  (!start||(s.date&&s.date>=start&&s.date<=today))&&
  (CVI.player==='all'||s.player===CVI.player)&&
  (CVI.sport==='all'||s.sport===CVI.sport)&&
  (CVI.platform==='all'||s.platform===CVI.platform));
 const verified=sales.filter(s=>['known','free'].includes(s.status));
 const estimated=sales.filter(s=>s.status==='estimated');
 const uncertain=sales.filter(s=>s.status==='unknown');
 const investment=verified.filter(s=>s.cost>0);
 const inventorySet=CVI.platform==='all'?inventory.filter(c=>(CVI.player==='all'||c.player===CVI.player)&&(CVI.sport==='all'||c.sport===CVI.sport)):[];
 const priced=inventorySet.filter(c=>!c.needsPricing&&Number(c.value)>0&&Number.isFinite(Number(c.value))&&cviCostStatus(c)!=='unknown'&&cviCostStatus(c)!=='estimated');
 const sum=(arr,key)=>cviRound(arr.reduce((n,o)=>n+cviNum(o[key]),0));
 return {today,start,sales,verified,estimated,uncertain,investment,inventorySet,priced,
  profit:sum(verified,'profit'),estProfit:sum(estimated,'profit'),net:sum(sales,'net'),
  gainInvest:sum(investment,'profit'),investBasis:sum(investment,'cost'),
  priceValue:sum(priced,'value'),priceBasis:sum(priced,'cost'),
  wins:verified.filter(s=>s.profit>0).length,losses:verified.filter(s=>s.profit<0).length,breakeven:verified.filter(s=>s.profit===0).length,
  noDate:start?soldHistory.map(cviSale).filter(s=>!s.date&&(CVI.player==='all'||s.player===CVI.player)&&(CVI.sport==='all'||s.sport===CVI.sport)&&(CVI.platform==='all'||s.platform===CVI.platform)).length:0,
  discrepancies:sales.filter(s=>s.discrepancy).length};
}
function cviGroup(arr,key){
 const m=new Map();
 for(const x of arr){const name=String(x[key]||'Other');if(!m.has(name))m.set(name,{name,count:0,profit:0});
 const group=m.get(name);group.count++;group.profit=cviRound(group.profit+x.profit);}
 return [...m.values()].sort((a,b)=>b.profit-a.profit||a.name.localeCompare(b.name));
}
function cviOpt(items,state,kind,allText){
 return '<select class="form-select" style="font-size:12px;min-width:0;padding:9px 6px" aria-label="'+kind+'" onchange="cviSet(\''+kind+'\',this.value)"><option value="all">'+allText+'</option>'+
 items.map(x=>'<option value="'+cvxEsc(x)+'"'+(x===state?' selected':'')+'>'+cvxEsc(x)+'</option>').join('')+'</select>';
}
function cviSet(kind,value){CVI[kind]=value;cviRender();}
function cviReset(){CVI.period='all';CVI.player='all';CVI.sport='all';CVI.platform='all';cviRender();}
function cviCash(n){return fmt(cviRound(n));}
function cviPL(n){return fmtPL(cviRound(n));}
function cviPct(n,d){return d>0?(n/d*100).toFixed(1)+'%':'N/A';}
function cviMetric(label,value,detail,signal=0){
 const keys={'Verified Net Profit':'profit','Realized ROI':'roi','Win Rate':'wins','Net Sale Proceeds':'proceeds','Unrealized P&L':'unreal','Unrealized ROI':'unrealroi','Priced Card Value':'value','Need Review':'review'};
 const key=keys[label]||'proceeds';
 return '<button type="button" class="cvi-metric cvi-tile" onclick="cviDrill(\''+key+'\')" aria-label="View '+label+' details"><span class="cvi-caption">'+label+'</span><span class="cvi-number" style="'+(signal?'color:'+(signal>0?'var(--green)':'var(--red)'):'')+'">'+value+'</span><span class="cvi-caption">'+detail+' <b style="color:var(--gold)">›</b></span></button>';
}
function cviBreakdown(label,items){
 return '<details class="cvi-section"><summary>'+label+'</summary>'+ (items.length?items.slice(0,12).map(v=>'<div class="cvi-line"><span>'+cvxEsc(v.name)+' <small>('+v.count+')</small></span><b style="color:'+(v.profit>=0?'var(--green)':'var(--red)')+'">'+cviPL(v.profit)+'</b></div>').join(''):'<p class="cvi-caption">No recorded sales match this selection.</p>')+'</details>';
}
function cviRank(kind,cards){
 const el=se(kind);if(!el)return;
 if(CVI.platform!=='all'){el.innerHTML='<div class="cvi-caption">Inventory cannot be assigned to a selling platform.</div>';return;}
 if(!cards.length){el.innerHTML='<div class="cvi-caption">No qualifying priced cards.</div>';return;}
 el.innerHTML=cards.slice(0,10).map((c,i)=>{
 const gain=cviRound(cviNum(c.value)-cviNum(c.cost));
 return '<div class="insight-item" onclick="openCard('+Number(c.id)+')"><div class="insight-rank">'+(i+1)+'</div><div class="insight-info"><div class="insight-name">'+cvxEsc(c.player)+'</div><div class="insight-meta">'+cvxEsc([c.year,c.set,c.variation,c.grade].filter(Boolean).join(' · '))+'</div></div>'+
 '<div class="insight-right"><div class="insight-val">'+(kind==='i-top'?cviCash(c.value):cviPL(gain))+'</div><div class="insight-pl" style="color:'+(gain>=0?'var(--green)':'var(--red)')+'">'+(kind==='i-top'?cviPL(gain):cviCash(c.value))+'</div></div></div>';
 }).join('');
}
function cviRender(){
 const root=se('cvi-root');if(!root)return;
 const filter={player:[...new Set([...inventory,...soldHistory].map(x=>String(x.player||'Unknown')))].sort(),
  sport:[...new Set([...inventory,...soldHistory].map(x=>String(x.sport||'Other')))].sort(),
  platform:[...new Set(soldHistory.map(x=>String(x.platform||'Unspecified')))].sort()};
 for(const key of ['player','sport','platform'])if(CVI[key]!=='all'&&!filter[key].includes(CVI[key]))CVI[key]='all';
 const data=cviData(),verified=data.verified,estimate=data.estimated,unknown=data.uncertain;
 const unknownAll=soldHistory.map(cviSale).filter(s=>s.status==='unknown');
 const rows=unknownAll.slice(0,15).map(s=>
  '<button class="cvi-review" onclick="cviReviewSale('+Number(s.id)+')"><span>'+cvxEsc(s.player)+'<span class="cvi-caption" style="display:block">'+cvxEsc(s.date||'Date unknown')+' · '+cvxEsc(s.platform)+' · '+cviCash(s.net)+' proceeds</span></span><span style="color:var(--gold)">Review ›</span></button>').join('');
 const monthMap=new Map();for(const x of verified){if(!/^\d{4}-\d{2}/.test(x.date))continue;const mon=x.date.slice(0,7);monthMap.set(mon,cviRound((monthMap.get(mon)||0)+x.profit));}
 const months=[...monthMap].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,6).map(([name,profit])=>({name,profit,count:0}));
 const gValue=cviRound(data.priceValue-data.priceBasis);
 const rROI=data.investBasis>0?cviPct(data.gainInvest,data.investBasis):'N/A';
 const include=(CVI.platform==='all');
 root.innerHTML='<div class="cvi-section"><div style="display:flex;justify-content:space-between;align-items:center"><b>Performance Filters</b><button class="btn-sm" onclick="cviReset()">Reset</button></div>'+
 '<div class="cvi-filters">'+
 '<div><label class="cvi-caption">Sales period</label><select class="form-select" onchange="cviSet(\'period\',this.value)">'+[['all','Lifetime'],['30','Last 30 Days'],['90','Last 90 Days'],['ytd','Year to Date']].map(([v,n])=>'<option value="'+v+'"'+(CVI.period===v?' selected':'')+'>'+n+'</option>').join('')+'</select></div>'+
 '<div><label class="cvi-caption">Player</label>'+cviOpt(filter.player,CVI.player,'player','All players')+'</div>'+
 '<div><label class="cvi-caption">Sport</label>'+cviOpt(filter.sport,CVI.sport,'sport','All sports')+'</div>'+
 '<div><label class="cvi-caption">Selling platform</label>'+cviOpt(filter.platform,CVI.platform,'platform','All platforms')+'</div></div></div>'+
 '<div class="cvi-title">Realized Sales <small>· selected period</small></div><div class="cvi-metrics">'+
 cviMetric('Verified Net Profit',cviPL(data.profit),verified.length+' verified sales',data.profit<0?-1:1)+
 cviMetric('Realized ROI',rROI,'Positive-cost sales only')+
 cviMetric('Win Rate',verified.length?cviPct(data.wins,verified.length):'N/A',data.wins+' wins · '+data.losses+' losses')+
 cviMetric('Net Sale Proceeds',cviCash(data.net),'All '+data.sales.length+' recorded sales')+'</div>'+
 (estimate.length||unknown.length?'<div class="cvi-warning">Profit excludes '+unknown.length+' unknown-basis sale(s) and '+estimate.length+' estimated-basis sale(s) from this period.'+(estimate.length?' Estimated profit: '+cviPL(data.estProfit)+'.':'')+'</div>':'')+
 (data.noDate?'<div class="cvi-warning">'+data.noDate+' undated sales excluded from this period.</div>':'')+
 (data.discrepancies?'<div class="cvi-warning">'+data.discrepancies+' stored sale P&L amounts differ from recomputed proceeds minus expenses and basis.</div>':'')+
 '<div class="cvi-title">Current Holdings <small>· today (not historical)</small></div>'+
 (include?'<div class="cvi-metrics">'+cviMetric('Unrealized P&L',cviPL(gValue),data.priced.length+' priced cards with verified costs',gValue<0?-1:1)+
 cviMetric('Unrealized ROI',data.priceBasis>0?cviPct(gValue,data.priceBasis):'N/A','Verified current cost basis')+
 cviMetric('Priced Card Value',cviCash(data.priceValue),'Excludes uncertain costs')+
 cviMetric('Need Review',String(data.inventorySet.length-data.priced.length),'Unpriced or uncertain basis')+'</div>':
 '<div class="cvi-caption">Selling-platform filters apply only to sales. Select All platforms to see current holdings.</div>')+
 '<p class="cvi-caption">ROI is profit on cards with positive purchase basis divided by that basis. Truly free cards contribute to verified profit, but do not inflate ROI. Current holdings use today’s values; date filters apply to completed sales only.</p>'+
 cviBreakdown('Profit by Player',cviGroup(verified,'player'))+
 cviBreakdown('Profit by Sport',cviGroup(verified,'sport'))+
 cviBreakdown('Profit by Selling Platform',cviGroup(verified,'platform'))+
 cviBreakdown('Recent Monthly Profits',months)+
 '<details class="cvi-section"><summary>Review Unknown Cost Basis ('+unknownAll.length+')</summary><p class="cvi-caption">Legacy sales with $0 cost are unverified until you mark them Free or enter a known/estimated cost. No changes are automatic.</p>'+ (rows||'<div class="cvi-caption">No unknown-basis sales.</div>')+'</details>';
 const old=se('cvg-analytics');if(old)old.style.display='none';
 se('insights-sub').textContent=data.sales.length+' sold cards selected · '+data.inventorySet.length+' current cards';
 const priced=data.priced.map(c=>({...c,gain:cviRound(cviNum(c.value)-cviNum(c.cost))}));
 cviRank('i-top',[...priced].sort((a,b)=>cviNum(b.value)-cviNum(a.value)));
 cviRank('i-gainers',priced.filter(c=>c.gain>0).sort((a,b)=>b.gain-a.gain));
 cviRank('i-losers',priced.filter(c=>c.gain<0).sort((a,b)=>a.gain-b.gain));
}
function cviReviewSale(id){
 const s=soldHistory.find(r=>Number(r.id)===Number(id));if(!s)return;
 CVI.reviewId=id;
 const body=se('cvi-review-body');if(!body)return;
 se('cvi-review-title').textContent='Review Cost Basis';
 const r=cviSale(s);
 body.innerHTML='<div style="font-weight:700;margin:0 0 8px">'+cvxEsc(s.player)+'</div>'+
 '<div class="cvi-caption">Recorded gross '+cviCash(r.gross)+' · Net proceeds '+cviCash(r.net)+' · Cost used '+cviCash(r.cost)+'</div>'+
 '<div class="form-group"><label class="form-label">Recorded Card Cost ($)</label><input id="cvi-review-cost" class="form-input" inputmode="decimal" type="number" min="0" step=".01" value="'+cviNum(s.cost)+'"></div>'+
 '<div class="form-group"><label class="form-label">Cost Basis Status</label><select id="cvi-review-status" class="form-select">'+
 [['known','Known purchase cost'],['free','Truly free ($0)'],['estimated','Estimated purchase cost'],['unknown','Unknown purchase cost']].map(([v,n])=>'<option value="'+v+'"'+(v===cviCostStatus(s)?' selected':'')+'>'+n+'</option>').join('')+
 '</select></div>'+
 '<div class="form-group"><label class="form-label">Correction Note (optional)</label><textarea id="cvi-review-note" class="form-textarea" rows="2" placeholder="e.g. Corrected allocation from purchased lot"></textarea></div>'+
 '<p class="cvi-caption">A free card must have a $0 acquisition cost. Cards included in a purchased lot should generally receive part of that lot’s cost. Saving a correction changes only this sold-card record, not the original sale price, fees or other cards.</p>'+
 '<div class="cvi-warning" id="cvi-review-error" style="display:none"></div><button class="btn btn-primary" onclick="cviSaveReview()">Save Reviewed Cost Basis</button>';
 openModal('cvi-edit-overlay');
}
function cviSaveReview(){
 const s=soldHistory.find(r=>Number(r.id)===Number(CVI.reviewId));if(!s)return;
 const status=se('cvi-review-status').value,raw=se('cvi-review-cost').value.trim(),number=Number(raw),error=se('cvi-review-error');
 error.style.display='none';
 if(!['known','free','estimated','unknown'].includes(status)||!Number.isFinite(number)||number<0||number>100000000||
 (status==='free'&&number!==0)||(status==='known'&&number<=0)||(status==='estimated'&&!raw)){
  error.textContent='Enter a valid basis. Known purchases require a positive cost; truly free cards must have $0 cost.';error.style.display='block';return;
 }
 const original=JSON.parse(JSON.stringify(s));
 const beforeCost=cviNum(s.cost),beforeStatus=cviCostStatus(s),afterCost=cviRound(number);
 if(beforeCost===afterCost&&beforeStatus===status){closeModal('cvi-edit-overlay');return;}
 s.basisStatus=status;s.cost=afterCost;s.pl=cviSale(s).profit;
 s.basisCorrections=[...(Array.isArray(s.basisCorrections)?s.basisCorrections:[]),{
  at:new Date().toISOString(),oldCost:beforeCost,newCost:afterCost,oldStatus:beforeStatus,newStatus:status,note:se('cvi-review-note')?.value.trim()||''
 }];
 try{save();closeModal('cvi-edit-overlay');cviRender();renderSold();toast('Sale cost basis corrected','success');}
 catch(e){Object.keys(s).forEach(k=>delete s[k]);Object.assign(s,original);error.textContent='Save failed: '+e.message;error.style.display='block';}
}
function cviInit(){
 const page=se('page-insights');if(!page)return;
 const css=document.createElement('style');
 css.textContent='.cvi-section{background:var(--bg2);border:1px solid var(--border2);border-radius:10px;padding:12px;margin:12px 0}.cvi-section summary{font-weight:700;font-size:13px;cursor:pointer}.cvi-title{margin:18px 0 10px;color:var(--gold);font-size:13px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}.cvi-title small{color:var(--text2);text-transform:none;font-weight:400}.cvi-filters,.cvi-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.cvi-filters .form-select{font-size:12px;min-width:0;padding:9px 5px;width:100%}.cvi-filters>div{min-width:0}.cvi-metric{padding:12px;border-radius:10px;background:var(--bg2);border:1px solid var(--border2);min-width:0}.cvi-number{font-family:"DM Mono",monospace;font-weight:700;font-size:18px;margin:5px 0;overflow-wrap:anywhere}.cvi-caption{color:var(--text2);font-size:11px;line-height:1.5}.cvi-warning{font-size:11px;line-height:1.5;color:var(--text);background:var(--gold-dim);padding:10px;border:1px solid var(--gold);border-radius:8px;margin:12px 0}.cvi-line{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border2);gap:8px;font-size:12px}.cvi-line small{color:var(--muted)}.cvi-review{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;background:transparent;color:var(--text);border:0;border-top:1px solid var(--border2);padding:12px 0;text-align:left;font-family:inherit;font-size:12px}';
 css.textContent+='.cvi-metric.cvi-tile{display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:5px;width:100%;min-width:0;box-sizing:border-box;text-align:left;color:var(--text);font-family:inherit;cursor:pointer;white-space:normal;overflow:hidden}.cvi-tile>.cvi-caption{display:block;flex:0 0 auto;width:100%;line-height:1.45;overflow-wrap:break-word;white-space:normal}.cvi-tile>.cvi-number{display:block;flex:0 0 auto;width:100%;margin:2px 0;font-size:clamp(16px,4.6vw,20px);line-height:1.25;letter-spacing:-.6px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;white-space:normal}.cvi-tile:active{border-color:var(--gold)}.cvi-drill-row{display:flex;width:100%;align-items:center;text-align:left;justify-content:space-between;gap:10px;border:none;border-bottom:1px solid var(--border2);padding:13px 0;background:transparent;font-family:inherit;color:var(--text);font-size:12px;cursor:pointer}.cvi-drill-row small{display:block;color:var(--text2);font-size:11px;line-height:1.6}.cvi-drill-row>b{white-space:nowrap;color:var(--gold)}.cvi-detail-line{display:flex;justify-content:space-between;gap:10px;padding:10px 0;font-size:12px;border-bottom:1px solid var(--border2)}.cvi-detail-line>span{color:var(--text2)}.cvi-detail-rule{border-top:2px solid var(--border2);margin:13px 0}';
 document.head.appendChild(css);
 const root=document.createElement('div');root.id='cvi-root';page.querySelector('.sec-header').after(root);
 const overlay=document.createElement('div');overlay.className='overlay';overlay.id='cvi-edit-overlay';overlay.style.zIndex='450';
 overlay.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-header"><div class="sheet-title" id="cvi-review-title">Review Cost Basis</div><button class="sheet-close" onclick="closeModal(\'cvi-edit-overlay\')">✕</button></div><div class="sheet-body" id="cvi-review-body"></div></div>';
 document.body.append(overlay);
 const details=document.createElement('div');details.className='overlay';details.id='cvi-details-overlay';details.style.zIndex='440';
 details.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-header"><div class="sheet-title" id="cvi-detail-title">Insight Details</div><button class="sheet-close" onclick="closeModal(\'cvi-details-overlay\')">✕</button></div><div class="sheet-body" id="cvi-detail-body"></div></div>';
 document.body.append(details);
 const prior=renderInsights;renderInsights=function(){prior();cviRender();};
 cviRender();
}

function cviDrill(metric){
 const names={
 profit:['Verified Net Profit','Verified sales with known or explicitly free cost basis.'],
 roi:['Realized ROI','Verified sales with positive card cost. Free cards are excluded from percentage ROI.'],
 wins:['Win Rate','All sales with verified card cost, including free cards.'],
 proceeds:['Net Sale Proceeds','All completed sales after fees and shipping, including uncertain cost records.'],
 unreal:['Unrealized P&L','Current priced holdings with verified cost basis.'],
 unrealroi:['Unrealized ROI','Current value versus basis of qualifying inventory, not a historical return.'],
 value:['Priced Card Value','Current value for holdings with verified cost and market values.'],
 review:['Holdings Needing Review','Cards with missing market values or uncertain cost basis.']
 };
 const info=names[metric];if(!info)return;
 CVI.lastMetric=metric;
 const d=cviData(),saleMetric=['profit','roi','wins','proceeds'].includes(metric);
 const records=(saleMetric?(metric==='profit'?d.verified:metric==='roi'?d.investment:metric==='wins'?d.verified:d.sales):
 metric==='review'?d.inventorySet.filter(c=>!d.priced.includes(c)):d.priced).slice();
 if(saleMetric)records.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 else records.sort((a,b)=>cviNum(b.value)-cviNum(a.value));
 se('cvi-detail-title').textContent=info[0];
 const lines=records.map(x=>{
  if(saleMetric){
   const val=metric==='proceeds'?cviCash(x.net):metric==='wins'?(x.profit>0?'Win':x.profit<0?'Loss':'Even'):metric==='roi'?cviPct(x.profit,x.cost):cviPL(x.profit);
   return '<button type="button" class="cvi-drill-row" onclick="cviSaleDetails('+Number(x.id)+')"><span style="min-width:0;flex:1"><b>'+cvxEsc(x.player)+'</b><small>'+cvxEsc(x.date||'Undated')+' · '+cvxEsc(x.platform)+' · '+cvxEsc(x.status)+'</small><small>Basis '+cviCash(x.cost)+' · Gross '+cviCash(x.gross)+' · Net '+cviCash(x.net)+'</small></span><b>'+val+' ›</b></button>';
  }
  const priced=!x.needsPricing&&Number(x.value)>0;
  const reason=!priced?'Needs pricing':'Cost: '+cviCostStatus(x);
  const gain=cviRound(cviNum(x.value)-cviNum(x.cost));
  const val=metric==='review'?'Review':metric==='value'?cviCash(x.value):metric==='unrealroi'?cviPct(gain,cviNum(x.cost)):cviPL(gain);
  return '<button type="button" class="cvi-drill-row" onclick="cviViewHolding('+Number(x.id)+')"><span style="min-width:0;flex:1"><b>'+cvxEsc(x.player)+'</b><small>'+cvxEsc([x.year,x.set,x.variation,x.grade].filter(Boolean).join(' · '))+'</small><small>Basis '+cviCash(x.cost)+' · '+(metric==='review'?reason:'Value '+cviCash(x.value))+'</small></span><b>'+val+' ›</b></button>';
 }).join('');
 se('cvi-detail-body').innerHTML='<p class="cvi-caption">'+cvxEsc(info[1])+' '+records.length+' record'+(records.length===1?'':'s')+' match your current filters.</p>'+
 (lines||'<p class="cvi-caption" style="padding:12px">No matching records.</p>');
 openModal('cvi-details-overlay');
}
function cviViewHolding(id){closeModal('cvi-details-overlay');openCard(id);}
function cviSaleDetails(id){
 const raw=soldHistory.find(s=>Number(s.id)===Number(id));if(!raw)return;
 const x=cviSale(raw),verified=['known','free'].includes(x.status);
 const item=(label,val,important)=>'<div class="cvi-detail-line"><span>'+label+'</span><b'+(important?' style="color:'+(x.profit>=0?'var(--green)':'var(--red)')+'"':'')+'>'+val+'</b></div>';
 const hist=Array.isArray(raw.basisCorrections)?raw.basisCorrections:[];
 se('cvi-detail-title').textContent='Sale Details';
 se('cvi-detail-body').innerHTML='<div style="font-weight:700;font-size:16px">'+cvxEsc(raw.player)+'</div>'+
 '<div class="cvi-caption">'+cvxEsc([raw.year,raw.set,raw.variation,raw.grade].filter(Boolean).join(' · '))+'</div>'+
 '<div class="cvi-caption" style="margin:8px 0 12px">'+cvxEsc(x.date||'Date not recorded')+' · '+cvxEsc(x.platform)+(Number(raw.transactionSize)>1?' · '+Number(raw.transactionSize)+'-card lot':'')+'</div>'+
 item('Gross sale',cviCash(x.gross))+item('Platform fees','−'+cviCash(raw.fees))+
 item('Shipping expense','−'+cviCash(raw.shipping))+item('Other sale expenses','−'+cviCash(raw.otherExpenses))+
 item('Net proceeds',cviCash(x.net))+'<div class="cvi-detail-rule"></div>'+
 item('Cost CardVault Used',cviCash(x.cost))+item('Basis Status',cvxEsc(x.status))+
 item((verified?'Verified':x.status==='estimated'?'Estimated':'Unverified')+' profit',cviPL(x.profit),true)+
 (x.discrepancy?'<div class="cvi-warning">Stored sale profit differs from these itemized amounts. Please review the sale carefully.</div>':'')+
 (raw.notes?'<p class="cvi-caption">Sale notes: '+cvxEsc(raw.notes)+'</p>':'')+
 '<p class="cvi-caption" style="margin:12px 0">CardVault copied this cost from the inventory record when the sale was saved. It may include grading costs or allocated purchase costs; the app cannot independently verify your original entry.</p>'+
 '<button class="btn btn-primary" onclick="closeModal(\'cvi-details-overlay\');cviReviewSale('+Number(x.id)+')">Review / Correct Cost Basis</button>'+
 (hist.length?'<details class="cvi-section"><summary>Correction History ('+hist.length+')</summary>'+
 hist.map(h=>'<div class="cvi-caption" style="padding:8px 0;border-bottom:1px solid var(--border)">'+cvxEsc(String(h.at||'').slice(0,16).replace('T',' '))+' · '+cviCash(h.oldCost)+' ('+cvxEsc(h.oldStatus)+') → '+cviCash(h.newCost)+' ('+cvxEsc(h.newStatus)+')'+(h.note?'<div>'+cvxEsc(h.note)+'</div>':'')+'</div>').join('')+'</details>':'')+
 '<button class="btn btn-secondary" style="margin-top:10px" onclick="cviDrill(CVI.lastMetric||\'proceeds\')">← Back to Tile Details</button>';
 openModal('cvi-details-overlay');
}

if(!new URLSearchParams(location.search).has('gist'))cviInit();
