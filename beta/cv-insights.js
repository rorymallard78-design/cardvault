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
 return '<div class="cvi-metric"><div class="cvi-caption">'+label+'</div><div class="cvi-number" style="'+(signal?'color:'+(signal>0?'var(--green)':'var(--red)'):'')+'">'+value+'</div><div class="cvi-caption">'+detail+'</div></div>';
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
 const overlay=se('cvi-edit-overlay');if(!overlay)return;
 const body=se('cvi-review-body');if(!body)return;
 se('cvi-review-title').textContent='Review Cost Basis';
 body.innerHTML='<div style="font-weight:700;margin:0 0 8px">'+cvxEsc(s.player)+'</div><div class="cvi-caption">Sale proceeds: '+cviCash(cviSale(s).net)+'</div>'+
 '<div class="form-group"><label class="form-label">Acquisition Cost ($)</label><input id="cvi-review-cost" class="form-input" inputmode="decimal" type="number" min="0" step=".01" value="'+cviNum(s.cost)+'"></div>'+
 '<div class="form-group"><label class="form-label">Cost Basis Status</label><select id="cvi-review-status" class="form-select">'+
 [['known','Known purchase cost'],['free','Truly free ($0)'],['estimated','Estimated purchase cost'],['unknown','Unknown purchase cost']].map(([v,n])=>'<option value="'+v+'"'+(v===cviCostStatus(s)?' selected':'')+'>'+n+'</option>').join('')+
 '</select></div><p class="cvi-caption">Free means you received the card for no acquisition cost. Cards included in a purchased lot should normally receive an allocated share of the lot cost.</p>'+
 '<div class="cvi-warning" id="cvi-review-error" style="display:none"></div><button class="btn btn-primary" onclick="cviSaveReview()">Save Reviewed Cost Basis</button>';
 openModal('cvi-edit-overlay');
}
function cviSaveReview(){
 const s=soldHistory.find(r=>Number(r.id)===Number(CVI.reviewId));if(!s)return;
 const status=se('cvi-review-status').value,raw=se('cvi-review-cost').value.trim(),number=Number(raw);
 const error=se('cvi-review-error');error.style.display='none';
 if(!Number.isFinite(number)||number<0||number>100000000||(status==='free'&&number!==0)||(status==='known'&&!raw)){
  error.textContent='Enter a valid cost. Truly free cards must have a $0 purchase cost.';error.style.display='block';return;
 }
 const before={...s};s.basisStatus=status;s.cost=cviRound(number);
 const entry=cviSale(s);s.pl=entry.profit;
 try{save();closeModal('cvi-edit-overlay');cviRender();renderSold();toast('Cost basis reviewed','success');}
 catch(e){Object.assign(s,before);error.textContent='Unable to save: '+e.message;error.style.display='block';}
}
function cviInit(){
 const page=se('page-insights');if(!page)return;
 const css=document.createElement('style');
 css.textContent='.cvi-section{background:var(--bg2);border:1px solid var(--border2);border-radius:10px;padding:12px;margin:12px 0}.cvi-section summary{font-weight:700;font-size:13px;cursor:pointer}.cvi-title{margin:18px 0 10px;color:var(--gold);font-size:13px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}.cvi-title small{color:var(--text2);text-transform:none;font-weight:400}.cvi-filters,.cvi-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.cvi-filters .form-select{font-size:12px;min-width:0;padding:9px 5px;width:100%}.cvi-filters>div{min-width:0}.cvi-metric{padding:12px;border-radius:10px;background:var(--bg2);border:1px solid var(--border2);min-width:0}.cvi-number{font-family:"DM Mono",monospace;font-weight:700;font-size:18px;margin:5px 0;overflow-wrap:anywhere}.cvi-caption{color:var(--text2);font-size:11px;line-height:1.5}.cvi-warning{font-size:11px;line-height:1.5;color:var(--text);background:var(--gold-dim);padding:10px;border:1px solid var(--gold);border-radius:8px;margin:12px 0}.cvi-line{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border2);gap:8px;font-size:12px}.cvi-line small{color:var(--muted)}.cvi-review{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;background:transparent;color:var(--text);border:0;border-top:1px solid var(--border2);padding:12px 0;text-align:left;font-family:inherit;font-size:12px}';
 document.head.appendChild(css);
 const root=document.createElement('div');root.id='cvi-root';page.querySelector('.sec-header').after(root);
 const overlay=document.createElement('div');overlay.className='overlay';overlay.id='cvi-edit-overlay';overlay.style.zIndex='450';
 overlay.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-header"><div class="sheet-title" id="cvi-review-title">Review Cost Basis</div><button class="sheet-close" onclick="closeModal(\'cvi-edit-overlay\')">✕</button></div><div class="sheet-body" id="cvi-review-body"></div></div>';
 document.body.append(overlay);
 const prior=renderInsights;renderInsights=function(){prior();cviRender();};
 cviRender();
}
if(!new URLSearchParams(location.search).has('gist'))cviInit();
