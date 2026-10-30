'use strict';
var CVImport={rows:[],filename:'',accepted:[],warnings:[]};
function cvimpCSV(text){
 text=String(text).replace(/^\uFEFF/,'');const out=[];let row=[],v='',quotes=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quotes&&text[i+1]==='"'){v+='"';i++;}else quotes=!quotes;}
 else if(ch===','&&!quotes){row.push(v);v='';}else if((ch==='\n'||ch==='\r')&&!quotes){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(v);if(row.some(x=>x.trim()))out.push(row);row=[];v='';}else v+=ch;}
 if(quotes)throw Error('Unclosed CSV quote');row.push(v);if(row.some(x=>x.trim()))out.push(row);return out;
}
function cvimpNorm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
const CVIFields={
 player:['player','playername','name','athlete','cardname'],sport:['sport'],year:['year','cardyear'],
 team:['team'],set:['set','setbrand','brand','product','cardset'],cardNum:['cardnumber','cardnum','number'],
 variation:['variation','parallel','variationparallel','parallelvariation'],printRun:['printrun','serialnumber','numberedto'],
 condition:['condition'],grade:['grade','grading'],certNumber:['certnumber','certificationnumber','psacert'],
 cost:['recordedtotalcardcost','totalcost','totalcostbasis','cost','costbasis','purchasecost','whatipaid','paid','pricepaid','acquisitioncost'],
 gradingCosts:['gradingcosts','recordedgradingcosts','gradingfees','recordedgradingcostsincludedincost','recordedgradingchargesincludedintotal'],value:['estimatedmarketvalue','currentmarketvalue','marketvalue','estimatedvalue','value','currentvalue'],
 basisStatus:['costbasisstatus','basisstatus','coststatus'],purchaseDate:['purchasedate','datepurchased'],notes:['notes','description']};
function cvimpMapped(headers){
 const norm=headers.map(cvimpNorm),mapped={};
 for(const [field,aliases] of Object.entries(CVIFields)){const i=norm.findIndex(h=>aliases.includes(h));if(i>=0)mapped[field]=i;}
 return mapped;
}
function cvimpNumber(raw){const s=String(raw??'').trim();if(!s)return null;const t=s.replace(/[$,\s]/g,'').replace(/^\((.*)\)$/,'-$1');const n=Number(t);if(!Number.isFinite(n)||n<0||n>100000000||Math.abs(n*100-Math.round(n*100))>0.001)throw Error('Invalid dollar amount: '+s);return Math.round(n*100)/100;}
function cvmStrongIdentity(c){return Boolean(c.certNumber||(c.player&&c.year&&c.set));}
function cvimpPrep(table,filename){
 if(table.length>5001)throw Error('Import up to 5,000 cards per file; split a larger spreadsheet.');
 if(!table||table.length<2)throw Error('Spreadsheet must have headers and at least one card.');
 const map=cvimpMapped(table[0]);if(map.player===undefined)throw Error('A Player or Name column is required.');
 const rows=[],warnings=[],seen=new Set();
 const fingerprint=c=>[c.player,c.year,c.set,c.cardNum,c.variation,c.grade,c.certNumber].map(cvimpNorm).join('|');
 const owned=new Set(inventory.map(fingerprint));
 for(let i=1;i<table.length;i++){
  const get=f=>map[f]===undefined?'':String(table[i][map[f]]??'').trim();
  if(!table[i].some(x=>String(x||'').trim()))continue;
  try{
   const player=get('player');if(!player)throw Error('Missing player');
   const recorded=cvimpNumber(get('cost')),grading=cvimpNumber(get('gradingCosts'))||0,value=cvimpNumber(get('value'));
   const costColumn=map.cost===undefined?'':cvimpNorm(table[0][map.cost]);
   const purchaseOnly=['purchasecost','whatipaid','paid','pricepaid','acquisitioncost'].includes(costColumn);
   const cost=purchaseOnly?(recorded===null?null:Math.round((recorded+grading)*100)/100):recorded;
   const basisRaw=get('basisStatus').toLowerCase();
   if(basisRaw&&!['known','free','estimated','unknown'].includes(basisRaw))throw Error('Unsupported basis status');
   if(cost!==null&&grading>cost)throw Error('Grading costs exceed total recorded cost');
   let status=basisRaw||(cost!==null&&cost>0?'known':'unknown');
   if(status==='free'&&cost!==null&&cost!==grading)throw Error('Free acquisition conflicts with the recorded card cost');
   if(status==='known'&&!(cost>0))throw Error('Known basis needs a positive cost');
   const card={player,sport:get('sport')||'Other',year:get('year'),team:get('team'),set:get('set'),cardNum:get('cardNum'),variation:get('variation'),printRun:get('printRun'),condition:get('condition')||(get('grade')?'Graded':'Raw'),grade:get('grade'),certNumber:get('certNumber'),cost:cost||0,gradingCosts:grading,value:value||0,needsPricing:!(value>0),basisStatus:status,purchaseDate:get('purchaseDate'),notes:get('notes'),photo:null};
   const fp=fingerprint(card),hasIdentity=Boolean(cvmStrongIdentity(card)),duplicate=hasIdentity&&(owned.has(fp)||seen.has(fp));
   if(duplicate)warnings.push('Row '+(i+1)+': possible duplicate — '+player);
   seen.add(fp);rows.push({line:i+1,card,duplicate,include:!duplicate});
  }catch(e){warnings.push('Row '+(i+1)+': '+e.message);}
 }
 if(rows.length===0)throw Error('No valid card rows found. '+warnings.slice(0,3).join('; '));
 CVImport={rows,filename,accepted:[],warnings};cvimpRender();
}
function cvimpRender(){
 const box=se('cv-import-body');if(!box)return;const rows=CVImport.rows;
 box.innerHTML='<div style="font-size:12px;color:var(--text2);margin-bottom:12px">'+cvxEsc(CVImport.filename)+' · '+rows.length+' valid rows. Potential duplicates are unchecked by default.</div>'+
 (CVImport.warnings.length?'<details style="margin-bottom:12px;color:var(--gold)"><summary>'+CVImport.warnings.length+' warnings or skipped rows</summary><div style="white-space:pre-wrap;font-size:11px">'+cvxEsc(CVImport.warnings.slice(0,100).join('\n'))+'</div></details>':'')+
 '<div style="max-height:46vh;overflow:auto">'+rows.map((r,i)=>'<label style="display:flex;gap:9px;padding:10px 2px;border-bottom:1px solid var(--border);align-items:flex-start"><input type="checkbox" style="width:20px;height:20px;flex-shrink:0" id="cv-import-check-'+i+'" '+(r.include?'checked':'')+'><span style="font-size:12px"><b>'+cvxEsc(r.card.player)+'</b> · '+cvxEsc([r.card.year,r.card.set,r.card.variation].filter(Boolean).join(' · '))+'<div style="font-size:11px;color:var(--text2)">Cost '+fmt(r.card.cost)+' · Value '+(r.card.needsPricing?'Not priced':fmt(r.card.value))+' · '+cvxEsc(r.card.basisStatus)+(r.duplicate?' · POSSIBLE DUPLICATE':'')+'</div></span></label>').join('')+'</div>'+
 '<div id="cv-import-error" style="color:var(--red);margin:10px 0;font-size:12px"></div><button class="btn btn-primary" onclick="cvimpConfirm()">Import Selected Cards</button>';
 openModal('cv-import-modal');
}
function cvimpConfirm(){
 const selected=CVImport.rows.filter((r,i)=>se('cv-import-check-'+i)?.checked);
 if(!selected.length){se('cv-import-error').textContent='Select at least one card.';return;}
 const previous=inventory,stamp=new Date().toISOString(),batchId='csv-'+Date.now();
 const cards=selected.map((r,i)=>({...r.card,id:Math.max(Date.now(),inventory.reduce((m,c)=>Math.max(m,Number(c.id)||0),0)+1)+i,dateAdded:stamp,importBatchId:batchId,importFilename:CVImport.filename,importRow:r.line}));
 try{
  inventory=[...cards,...inventory];save();closeModal('cv-import-modal');renderInventory();renderDash();renderPlayers();updateHeader();toast('Imported '+cards.length+' cards without photos','success');
 }catch(err){inventory=previous;se('cv-import-error').textContent='Could not save: '+err.message;}
}
async function cvimpFile(event){
 const file=event.target.files?.[0];event.target.value='';if(!file)return;
 try{
  if(file.size>12*1024*1024)throw Error('Maximum file size is 12 MB.');
  const ext=file.name.split('.').pop().toLowerCase();let table;
  if(ext==='csv')table=cvimpCSV(await file.text());
  else if(['xlsx','xls'].includes(ext)){
   if(typeof XLSX==='undefined'){
    await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';script.onload=resolve;script.onerror=()=>reject(Error('Excel reader unavailable. Export as CSV and try again.'));document.head.append(script);});
   }
   if(typeof XLSX==='undefined')throw Error('Excel reader unavailable. Export as CSV and try again.');
   const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
   if(!wb.SheetNames.length)throw Error('Workbook is empty.');
   table=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',raw:false,blankrows:false});
  }else throw Error('Choose .csv, .xlsx, or .xls.');
  cvimpPrep(table,file.name);
 }catch(e){toast('Import failed: '+e.message,'error');}
}
function cvimpInit(){
 const modal=document.createElement('div');modal.className='overlay';modal.id='cv-import-modal';modal.style.zIndex='530';
 modal.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-header"><div class="sheet-title">Review Spreadsheet Import</div><button class="sheet-close" onclick="closeModal(\'cv-import-modal\')">✕</button></div><div class="sheet-body" id="cv-import-body"></div></div>';document.body.append(modal);
}
if(!new URLSearchParams(location.search).has('gist'))cvimpInit();
