// CardVault private pilot: fixed HTTPS endpoint; testers enter only an invitation.
// The token belongs to this browser profile, never to a URL or shared link.
(() => {
'use strict';
const API='https://cardvault-pilot.rory-mallard78-0f9.workers.dev';
const CODE_KEY='cv_pilot_invite';
const $=id=>document.getElementById(id);
function code(){const v=(localStorage.getItem(CODE_KEY)||'').trim().toUpperCase();return /^CV-[A-F0-9]{32}$/.test(v)?v:''}
window.cvPilotEnabled=()=>!!code();
function showRemaining(n,quota){
 const el=$('cv-pilot-remaining');
 if(el)el.textContent=n+' of '+quota+' free AI scans remaining';
}
async function status(){
 const output=$('cv-pilot-status');if(!output)return;
 if(!code()){output.textContent='Enter your private beta invitation code. Manual card entry is always available.';return}
 output.textContent='Checking invitation…';
 try{
  const res=await fetch(API+'/v1/status',{headers:{'X-CardVault-Invite':code()},cache:'no-store'});
  const data=await res.json().catch(()=>({}));
  if(!res.ok||!data.ok)throw new Error(data.error||'Could not verify your invitation');
  showRemaining(data.remaining,data.quota);
  output.textContent=data.remaining>0?'Invitation accepted. AI scanning is enabled.':'Your 50 free scans have been used. You can still add cards manually.';
 }catch(e){output.textContent='Could not verify invitation: '+e.message}
}
scanCardPhoto=async function(image){
 if(!code())throw new Error('Enter your beta invitation code under Settings before using AI scanning.');
 const response=await fetch(API+'/v1/scan',{method:'POST',headers:{'Content-Type':'application/json','X-CardVault-Invite':code()},body:JSON.stringify({image})});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok||!payload.ok||!payload.card)throw new Error(payload.error||'AI scan unavailable. You can enter this card manually.');
 showRemaining(payload.remaining,50);
 return payload.card;
};
function settings(){
 const host=$('page-settings');if(!host||$('cv-pilot-setup'))return;
 const section=document.createElement('section');
 section.id='cv-pilot-setup';
 section.style.cssText='margin:16px 0;padding:16px;border-radius:12px;border:1px solid var(--border2);background:var(--bg2)';
 section.innerHTML='<div style="font-weight:700;font-size:17px">✨ Beta AI Scanning — 50 Free Scans</div>'+
 '<p style="font-size:13px;color:var(--text2);line-height:1.5;margin:8px 0 14px">Welcome to CardVault Pilot. Enter the invitation code you received. Card scans are securely processed using CardVault\'s backend; your personal collection is stored locally on this device.</p>'+
 '<label class="form-label" for="cv-pilot-code">Invitation code</label>'+
 '<input class="form-input" id="cv-pilot-code" type="text" maxlength="35" placeholder="CV-…" autocapitalize="characters" spellcheck="false" autocomplete="off">'+
 '<button type="button" class="btn btn-primary" id="cv-pilot-save" style="margin-top:12px">Activate 50 Free Scans</button>'+
 '<div id="cv-pilot-remaining" style="font-size:14px;font-weight:700;margin-top:12px"></div>'+
 '<p id="cv-pilot-status" style="font-size:12px;color:var(--text2);line-height:1.5;margin:8px 0"></p>'+
 '<p style="font-size:12px;color:var(--text2)">After your allowance ends, manual entry remains free. Export a complete backup from Settings → Data; cards and photos do not sync automatically between devices.</p>';
 host.insertBefore(section,host.firstChild);
 $('cv-pilot-code').value=code();
 $('cv-pilot-save').addEventListener('click',async()=>{
  const entered=$('cv-pilot-code').value.trim().toUpperCase().replace(/\s+/g,'');
  if(!/^CV-[A-F0-9]{32}$/.test(entered)){$('cv-pilot-status').textContent='This invitation code is invalid. Please check the entire code.';return}
  $('cv-pilot-status').textContent='Activating…';
  try{
   const r=await fetch(API+'/v1/status',{headers:{'X-CardVault-Invite':entered},cache:'no-store'});
   const data=await r.json().catch(()=>({}));
   if(!r.ok||!data.ok)throw new Error(data.error||'Invitation not accepted');
   localStorage.setItem(CODE_KEY,entered);
   showRemaining(data.remaining,data.quota);
   $('cv-pilot-status').textContent='Invitation accepted. Your scans are ready.';
  }catch(e){$('cv-pilot-status').textContent='Activation failed: '+e.message}
 });
 if(code())status();
}
settings();
})();
