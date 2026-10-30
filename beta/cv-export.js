'use strict';
// CardVault CSV export: read-only downloads generated entirely in this browser.
function cvExportRound(v){const n=Number(v);return Number.isFinite(n)?Math.round(n*100)/100:0;}
function cvExportDollars(v){return cvExportRound(v).toFixed(2);}
function cvExportDate(value){return String(value||'').slice(0,10);}
function cvExportStatus(card){
 if(typeof cviCostStatus==='function')return cviCostStatus(card);
 const status=String(card.basisStatus||'').toLowerCase();
 if(['known','free','estimated','unknown'].includes(status))return status;
 return card.cost!==''&&card.cost!=null&&Number(card.cost)>0?'known':'unknown';
}
function cvExportBasis(card){
 const status=cvExportStatus(card),recorded=cvExportRound(card.cost),grading=cvExportRound(card.gradingCosts);
 const purchase=cvExportRound(recorded-grading);
 return {status,recorded,grading,purchase,statusVerified:status==='known'||status==='free'};
}
function cvExportCSV(headers,records){
 const safe=value=>{
  let s=String(value==null?'':value);
  // Prevent spreadsheet applications interpreting user-provided fields as formulas.
  if(/^[\s]*[=+@-]/.test(s)&&!/^-?\d+(?:\.\d+)?$/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
 };
 return '\ufeff'+[headers,...records].map(row=>row.map(safe).join(',')).join('\r\n')+'\r\n';
}
function cvExportDownload(filename,headers,records){
 const blob=new Blob([cvExportCSV(headers,records)],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=filename;a.style.display='none';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
 toast('Exported '+records.length+' rows to '+filename,'success');
}
function cvExportFilename(kind,year=''){
 const date=new Date(),stamp=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
 return 'cardvault-'+kind+(year?'-'+year:'')+'-'+stamp+'.csv';
}
function cvExportInventoryRows(cards){
 const h=['Card ID','Player','Sport','Year','Team','Set / Brand','Card Number','Parallel / Variation','Print Run',
 'Condition','Grade','Cert Number','Date Added (Not Necessarily Purchase Date)','Purchase Date','Receipt ID',
 'Cost Basis Status','Recorded Total Card Cost','Recorded Grading Costs (Included in Cost)','Estimated Acquisition Cost (Excluding Recorded Grading)','Estimated Market Value','Needs Pricing','Has Photo','Notes'];
 const rows=cards.map(c=>{
  const b=cvExportBasis(c);
  return [c.id,c.player,c.sport,c.year,c.team,c.set,c.cardNum,c.variation,c.printRun,c.condition,c.grade,c.certNumber,
   cvExportDate(c.dateAdded),cvExportDate(c.purchaseDate),c.receiptId||'',b.status,
   cvExportDollars(b.recorded),cvExportDollars(b.grading),b.status==='unknown'?'':cvExportDollars(Math.max(0,b.purchase)),
   Number(c.value)>0&&!c.needsPricing?cvExportDollars(c.value):'',
   c.needsPricing||!(Number(c.value)>0)?'Yes':'No',c.photo?'Yes':'No',c.notes||''];
 });
 return {headers:h,rows};
}
function cvExportSalesRows(cards,year=''){
 const list=cards.filter(s=>!year||cvExportDate(s.dateSold||s.soldDate).startsWith(year+'-'));
 const h=['Sale ID','Transaction ID','Card ID','Receipt ID','Sale Date','Platform','Player','Sport','Card Year','Set / Brand','Parallel / Variation','Grade',
 'Gross Sale (Allocated)','Selling Fees (Allocated)','Shipping Paid (Allocated)','Other Selling Costs (Allocated)',
 'Net Sale Proceeds','Cost Basis Status','Recorded Total Cost Basis','Recorded Grading Cost (Already Included in Basis)',
 'Verified Total Basis (Blank if Estimated / Unknown)','Verified Gain/Loss (Blank if Estimated / Unknown)','Indicative P&L Using Recorded Basis',
 'Acquisition Date (If Recorded)','Notes','Number of Prior Sale Corrections','Number of Basis Corrections'];
 const rows=list.map(s=>{
  const b=cvExportBasis(s),gross=cvExportRound(s.salePrice),fees=cvExportRound(s.fees),
   ship=cvExportRound(s.shipping),other=cvExportRound(s.otherExpenses),
   net=cvExportRound(gross-fees-ship-other),profit=cvExportRound(net-b.recorded);
  return [s.id,s.transactionId||'',s.cardId||'',s.receiptId||'',cvExportDate(s.dateSold||s.soldDate),s.platform||'',s.player||'',
   s.sport||'',s.year||'',s.set||'',s.variation||'',s.grade||'',cvExportDollars(gross),
   cvExportDollars(fees),cvExportDollars(ship),cvExportDollars(other),cvExportDollars(net),b.status,
   cvExportDollars(b.recorded),cvExportDollars(b.grading),b.statusVerified?cvExportDollars(b.recorded):'',
   b.statusVerified?cvExportDollars(profit):'',cvExportDollars(profit),
   cvExportDate(s.purchaseDate),s.notes||'',(s.saleCorrections||[]).length,(s.basisCorrections||[]).length];
 });
 return {headers:h,rows};
}
function cvExportPurchaseRows(){
 // A sold card and a held card each represent one acquisition; do not sum purchase receipts again.
 const held=inventory.map(c=>({state:'Held',c})),sold=soldHistory.map(c=>({state:'Sold',c}));
 const h=['Holding Status','Card ID','Sale ID (if sold)','Receipt ID','Purchase Date (If Recorded)',
  'Date Added To App (Not Purchase Date)','Player','Sport','Card Year','Set / Brand','Variation / Parallel',
  'Recorded Total Card Cost','Recorded Grading Charges Included in Total',
  'Recorded Acquisition Cost Excluding Grading','Cost Basis Status','Acquisition Cost Verified','Notes'];
 const rows=[...held,...sold].map(({state,c})=>{
  const b=cvExportBasis(c);
  return [state,c.cardId||c.id,state==='Sold'?c.id:'',c.receiptId||'',
   cvExportDate(c.purchaseDate),cvExportDate(c.dateAdded),c.player||'',c.sport||'',c.year||'',
   c.set||'',c.variation||'',cvExportDollars(b.recorded),cvExportDollars(b.grading),
   b.status==='unknown'?'':cvExportDollars(Math.max(0,b.purchase)),b.status,
   b.statusVerified?'Yes':'No',c.notes||''];
 });
 return {headers:h,rows};
}
function cvExportReceiptRows(){
 const h=['Receipt ID','Kind','Status','Recorded Date','Recorded Amount','Currency','Processed At',
  'Linked Card IDs','Linked Sale Transaction ID','Notes','Number of Attached Photos','Reconciliation Note'];
 const rows=(typeof CVR==='object'&&Array.isArray(CVR.items)?CVR.items:[]).map(r=>[
  r.id,r.kind,r.status,cvExportDate(r.at),cvExportDollars(r.amount),'USD',cvExportDate(r.processedAt),
  (r.cardIds||[]).join('; '),r.transactionId||'',r.notes||'',r.photoCount||0,
  r.status==='pending'?'Pending: not necessarily posted to inventory/sales':'Informational receipt only: do not add amount to card cost or sale proceeds again']);
 return {headers:h,rows};
}
function cvExportAnnualRows(cards,year){
 const list=cards.filter(s=>cvExportDate(s.dateSold||s.soldDate).startsWith(year+'-'));
 const groups=new Map();
 for(const sale of list){
  const key=sale.platform||'Unspecified',group=groups.get(key)||{count:0,gross:0,fees:0,shipping:0,other:0,net:0,verifiedBasis:0,verifiedGain:0,unverified:0,unverifiedGross:0,unverifiedNet:0};
  const b=cvExportBasis(sale),gross=cvExportRound(sale.salePrice),fees=cvExportRound(sale.fees),
   ship=cvExportRound(sale.shipping),other=cvExportRound(sale.otherExpenses),net=cvExportRound(gross-fees-ship-other);
  group.count++;group.gross+=gross;group.fees+=fees;group.shipping+=ship;group.other+=other;group.net+=net;
  if(b.statusVerified){group.verifiedBasis+=b.recorded;group.verifiedGain+=net-b.recorded;}
  else {group.unverified++;group.unverifiedGross+=gross;group.unverifiedNet+=net;}
  groups.set(key,group);
 }
 const h=['Tax Year (Calendar Year)','Platform','Cards Sold','Gross Allocated Sales','Fees','Shipping Paid','Other Selling Costs',
  'Net Sale Proceeds','Verified Basis (Known + Free)','Verified Gains/Losses (Known + Free)',
  'Sales With Estimated / Unknown Basis','Gross Sales With Estimated / Unknown Basis',
  'Net Proceeds With Estimated / Unknown Basis','Tax Prep Notes'];
 const fmt=row=>[year,row.platform,row.count,cvExportDollars(row.gross),cvExportDollars(row.fees),cvExportDollars(row.shipping),cvExportDollars(row.other),
  cvExportDollars(row.net),cvExportDollars(row.verifiedBasis),cvExportDollars(row.verifiedGain),row.unverified,
  cvExportDollars(row.unverifiedGross),cvExportDollars(row.unverifiedNet),'Informational records; compare with actual payouts, 1099-K, tax collected, refunds and purchase evidence. Do not double-count capitalized grading charges.'];
 const total={platform:'ALL PLATFORMS',count:0,gross:0,fees:0,shipping:0,other:0,net:0,verifiedBasis:0,verifiedGain:0,unverified:0,unverifiedGross:0,unverifiedNet:0};
 const rows=[...groups].sort((a,b)=>a[0].localeCompare(b[0])).map(([platform,x])=>{
  Object.keys(total).filter(k=>k!=='platform').forEach(k=>total[k]+=x[k]||0);
  return fmt({...x,platform});
 });
 if(list.length)rows.push(fmt(total));
 return {headers:h,rows};
}
function cvExportAction(type){
 const year=se('cv-export-year')?.value||'all';
 try{
  let report,suffix=type;
  if(type==='inventory')report=cvExportInventoryRows(inventory);
  else if(type==='sales')report=cvExportSalesRows(soldHistory);
  else if(type==='purchases')report=cvExportPurchaseRows();
  else if(type==='receipts')report=cvExportReceiptRows();
  else if(type==='year-sales'){
   if(year==='all')throw Error('Choose a calendar year for the tax sales detail.');
   report=cvExportSalesRows(soldHistory,year);suffix='tax-sales-detail';}
  else if(type==='year-summary'){
   if(year==='all')throw Error('Choose a calendar year for the tax summary.');
   report=cvExportAnnualRows(soldHistory,year);suffix='tax-summary';}
  else throw Error('Unknown export type.');
  if(!report.rows.length){toast('No '+type+' records to export','error');return;}
  cvExportDownload(cvExportFilename(suffix,['year-sales','year-summary'].includes(type)?year:''),report.headers,report.rows);
 }catch(err){toast('Export failed: '+err.message,'error');}
}
function cvExportUpdateYears(){
 const el=se('cv-export-year');if(!el)return;
 const current=el.value;
 const years=[...new Set(soldHistory.map(s=>cvExportDate(s.dateSold||s.soldDate).slice(0,4)).filter(x=>/^\d{4}$/.test(x)))].sort().reverse();
 const now=String(new Date().getFullYear());
 if(!years.includes(now))years.unshift(now);
 el.innerHTML=years.map(y=>'<option value="'+y+'">'+y+'</option>').join('');
 el.value=years.includes(current)?current:now;
}
function cvExportInit(){
 const section=document.createElement('div');section.className='setting-section';section.id='cv-export-section';
 section.innerHTML='<div class="setting-section-title">Data Exports · Excel / CSV</div><div class="setting-box">'+
  '<div class="setting-desc">Create spreadsheet-friendly CSV files on this device. No images or API keys are included.</div>'+
  '<div style="font-size:12px;font-weight:700;margin:12px 0 8px">Collection & transaction records</div>'+
  '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">'+
  '<button class="btn btn-secondary" onclick="cvExportAction(\'inventory\')">Inventory CSV</button>'+
  '<button class="btn btn-secondary" onclick="cvExportAction(\'purchases\')">Purchases CSV</button>'+
  '<button class="btn btn-secondary" onclick="cvExportAction(\'sales\')">All Sales CSV</button>'+
  '<button class="btn btn-secondary" onclick="cvExportAction(\'receipts\')">Receipts CSV</button></div>'+
  '<div style="font-size:12px;font-weight:700;margin:16px 0 8px">Tax-year workpapers</div>'+
  '<div class="form-group"><label class="form-label" for="cv-export-year">Calendar Year</label>'+
  '<select id="cv-export-year" class="form-select"></select></div>'+
  '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">'+
  '<button class="btn btn-secondary" onclick="cvExportAction(\'year-sales\')">Year Sales Detail</button>'+
  '<button class="btn btn-secondary" onclick="cvExportAction(\'year-summary\')">Year Summary</button></div>'+
  '<p style="font-size:11px;color:var(--text2);line-height:1.5;margin-top:12px">Amounts are from your entered records, not a verified tax return. Unknown/estimated basis is flagged; receipts are a separate reference and must not be added to recorded purchase/sale amounts again. Confirm dates, card costs, platform payouts, 1099-K amounts and the correct tax treatment with your preparer. CSVs may contain private notes.</p>'+
  '<div style="font-size:11px;color:var(--text2);margin-top:8px">For a full restore including card photos, use the JSON backup controls below.</div>'+
  '</div>';
 const target=se('page-settings');
 const before=target.querySelector('.setting-section:last-child');if(before)target.insertBefore(section,before);else target.append(section);
 // Keep export buttons OUT of crowded page headers. Multiple actions in
 // the Inventory header pushed Export CSV partly beyond narrow phone screens.
 // Export actions are permanent full-width HTML buttons, not items in the crowded header.
 // Remove any legacy dynamic export buttons left by an older mobile-app script.
 for(const page of ['page-inventory','page-sold']){
  const header=se(page)?.querySelector('.sec-header');
  if(!header)continue;
  [...header.querySelectorAll('button')].forEach(b=>{
   if(/export.*csv/i.test(b.textContent||''))b.remove();
  });
 }
 const old=showPage;
 showPage=function(name){old(name);if(name==='settings')cvExportUpdateYears();};
 cvExportUpdateYears();
}
if(!new URLSearchParams(location.search).has('gist'))cvExportInit();
