'use strict';
// Dashboard presentation only. Keeps legacy card and receipt storage untouched.
function cvdAttention(){
 const host=se('dash-attention');if(!host)return;
 const pending=typeof CVR!=='undefined'?CVR.items.filter(r=>r.status==='pending').length:0;
 const unpriced=inventory.filter(c=>c.needsPricing||!(Number(c.value)>0)).length;
 const item=(icon,label,count,action)=>'<button type="button" onclick="'+action+'" style="width:100%;display:flex;align-items:center;gap:10px;text-align:left;border:1px solid var(--border2);border-radius:10px;padding:13px;background:var(--bg2);color:var(--text);font-family:inherit;margin:0 0 8px"><span style="font-size:21px">'+icon+'</span><span style="flex:1;font-size:13px;font-weight:600">'+label+'</span><b style="color:var(--gold)">'+count+'</b><span style="color:var(--muted)">›</span></button>';
 host.innerHTML=(pending?item('🧾','Unprocessed Receipts',pending,"showPage('receipts')"):'')+
  (unpriced?item('⏳','Cards Needing Values',unpriced,"needsFilter=true;showPage('inventory')"):'')+
  (!pending&&!unpriced?'<div style="font-size:12px;color:var(--text2);padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:10px">✓ Nothing needs attention right now.</div>':'');
 const legacy=se('dash-needs');if(legacy)legacy.style.display='none';
 const receipt=se('cvr-dash');if(receipt)receipt.style.display='none';
 const grading=se('cvg-dash');if(grading)grading.style.display='none';
}
function cvdInit(){
 const dashboard=se('page-dash');if(!dashboard)return;
 const prior=renderDash;renderDash=function(){prior();cvdAttention();};
 const oldShow=showPage;showPage=function(name){oldShow(name);if(name==='dash')cvdAttention();};
 cvdAttention();
}
if(!new URLSearchParams(location.search).has('gist'))cvdInit();
