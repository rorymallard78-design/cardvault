'use strict';
let CVVOICE={mode:'inventory',recognizer:null,recording:false,base:'',active:false,restartTimer:null,session:0,quietEnds:0};
const VOICE_SETS=['Topps Chrome Sapphire','Bowman Chrome Sapphire','Topps Chrome','Topps Update','Topps Heritage','Bowman Chrome','Donruss Optic','National Treasures','Panini Prizm','Panini Select','Panini Mosaic','Panini Certified','Panini Contenders','Topps Finest','Topps Flagship','Upper Deck','Skybox','Fleer Ultra','Immaculate','Flawless','Prizm','Mosaic','Optic','Select','Donruss','Bowman','Topps','Fleer','Pokemon','Pokémon','One Piece','Magic The Gathering'];
const VOICE_PARALLELS=['Blue X-Fractor','Red White and Blue','Red White & Blue','Blue Refractor','Red Refractor','Gold Refractor','Silver Prizm','Gold Vinyl','Pink Glitter','Blue Wave','Gold Wave','Sonic Boom','Crystallized','Astrovision','Kaboom','Downtown','Sapphire','Silver','Gold','Holofoil','Holo','Refractor','X-Fractor','Base','Autograph','Pink','Purple','Blue','Red','Green','Orange'];
const VOICE_SPORTS=[['Non-Sports',/\b(non.sports?|pokemon|pokémon|star wars|marvel|one piece|magic the gathering)\b/i],['Basketball',/\bbasketball\b/i],['Baseball',/\bbaseball\b/i],['Football',/\bfootball\b/i],['Hockey',/\bhockey\b/i],['Soccer',/\b(soccer|futbol)\b/i]];
function voiceEscape(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function voiceRegex(s){return String(s).replace(/[.*+?^$(){}|[\]\\]/g,'\\$&')}
function voicePhrase(text,choices){for(const s of choices){const rx=new RegExp('(^|[^a-z0-9])'+voiceRegex(s).replace(/\s+/g,'\\s+')+'(?=$|[^a-z0-9])','i');if(rx.test(text))return s}return ''}
function voiceMoney(s){if(s==null||s==='')return null;const v=String(s).replace(/[$,\s]/g,'');if(!/^\d+(?:\.\d{1,2})?$/.test(v))return null;const n=Number(v);return n>=0&&n<=1e8?Math.round(n*100)/100:null}
function voiceLabel(text,labels){
 const all='player(?: name)?|athlete|character|subject|brand|manufacturer|set|year|season|grade|grading|parallel|variation|card number|card #|numbered to|out of|print run|purchase price|paid|bought|cost|price|worth|estimated value|market value|value|target price|target|priority|sport|category|team|notes?';
 return (new RegExp('(?:^|[\\s,;])(?:'+labels+')\\s*(?::|is\\b|was\\b)?\\s*(.+?)(?=\\s*(?:[,;]\\s*)?(?:'+all+')\\b|[;,.]|$)','i').exec(text)?.[1]||'').trim();
}
function voiceParse(input){
 const raw=String(input||'').replace(/\s+/g,' ').trim(),d={};if(!raw)return d;
 const year=/\b(?:19|20)\d{2}\b/.exec(raw);if(year)d.year=year[0];
 const sport=VOICE_SPORTS.find(x=>x[1].test(raw));if(sport)d.sport=sport[0];
 const grade=/\b(PSA|BGS|SGC)\s*(?:grade\s*)?(\d{1,2}(?:\.\d)?)\b/i.exec(raw);
 if(grade){d.grade=grade[1].toUpperCase()+' '+grade[2];d.condition='Graded'}
 if(!grade&&/\b(raw|ungraded)\b/i.test(raw))d.condition='Raw';
 const brand=voiceLabel(raw,'brand|manufacturer|set'),set=voicePhrase(raw,VOICE_SETS);
 if(brand)d.set=brand;else if(set)d.set=set;
 const parallel=voiceLabel(raw,'parallel|variation'),par=voicePhrase(raw,VOICE_PARALLELS);
 if(parallel)d.variation=parallel;else if(par)d.variation=par;
 const run=/\b(?:numbered\s*(?:to|out of)|out of|\/)\s*(\d{1,5})\b/i.exec(raw);if(run)d.printRun=run[1];
 const cardNum=/\b(?:card\s*(?:number|no\.?|#)|#)\s*([a-z0-9-]{1,12})\b/i.exec(raw);if(cardNum)d.cardNum=cardNum[1];
 const cert=/\b(?:cert(?:ification)?(?:\s*number|\s*#)?|PSA cert)\s*(\d{6,15})\b/i.exec(raw);if(cert)d.certNumber=cert[1];
 const paid=/\b(?:bought(?:\s+it)?(?:\s+for)?|purchase(?:d)?(?:\s+for|\s+price)?|paid|cost(?:\s+me)?|price(?:\s+paid)?|spent)\s*(?:was|is|at|of|about|around|roughly|for)?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)\b/i.exec(raw);
 if(paid)d.cost=voiceMoney(paid[1]);
 const value=/\b(?:worth|valued at|market value|estimated value|current value|value)\s*(?:is|was|at|of|about|around|roughly|now)?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)\b/i.exec(raw);
 if(value)d.value=voiceMoney(value[1]);
 const target=/\b(?:target(?:\s+price)?|maximum|budget|max(?:\s+price)?|up to|want to pay)\s*(?:is|was|at|of|about|around|for|only)?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)\b/i.exec(raw);
 if(target)d.target=voiceMoney(target[1]);else if(paid)d.target=d.cost;
 for(const p of ['High','Medium','Low'])if(new RegExp('\\b'+p+' priority\\b','i').test(raw))d.priority=p;
 const player=voiceLabel(raw,'player(?: name)?|athlete|character|subject');if(player)d.player=player;
 const team=voiceLabel(raw,'team');if(team)d.team=team;
 const notes=voiceLabel(raw,'notes?');if(notes)d.notes=notes;
 if(!d.player){
  let text=raw;
  for(const m of [year,grade,paid,value,target,run,cardNum,cert])if(m)text=text.replace(m[0],' ');
  for(const name of [set,par])if(name)text=text.replace(new RegExp(voiceRegex(name),'i'),' ');
  for(const [,rx]of VOICE_SPORTS)text=text.replace(rx,' ');
  text=text.replace(/\b(?:rookie card|rookie|rc|graded|raw|card|the|an|a|my|i have|i bought|add|want|find|this|for|on|in|at|of|and|player|brand|set|year|parallel|variation|grade|sport|category|team|notes|priority)\b/gi,' ').replace(/[,;.]/g,' ').replace(/\s+/g,' ').trim();
  if(text&&text.split(' ').length<=5)d.player=text;
 }
 return d;
}
// Merge overlapping phrases only at session boundaries; interim hypotheses must NEVER be appended.
function voiceJoin(previous,addition){
 const a=String(previous||'').trim(),b=String(addition||'').trim();
 if(!a)return b;if(!b)return a;
 const left=a.split(/\s+/),right=b.split(/\s+/);
 const norm=w=>String(w).toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,'');
 const max=Math.min(12,left.length,right.length);
 let overlap=0;
 for(let n=max;n>0;n--){
  let same=true;
  for(let k=0;k<n;k++)if(norm(left[left.length-n+k])!==norm(right[k])){same=false;break;}
  if(same){overlap=n;break;}
 }
 return (a+' '+right.slice(overlap).join(' ')).trim();
}
function voiceOpen(mode){
 voiceStop();
 CVVOICE.mode=mode==='chase'?'chase':'inventory';
 CVVOICE.base='';
 document.getElementById('voice-title').textContent=CVVOICE.mode==='chase'?'🎤 Chase Card by Voice':'🎤 Inventory Card by Voice';
 document.getElementById('voice-transcript').value='';
 document.getElementById('voice-preview').innerHTML='';
 document.getElementById('voice-status').textContent='Use the microphone on your phone keyboard and speak normally. CardVault reads the text when you finish.';
 document.getElementById('voice-apply').textContent=CVVOICE.mode==='chase'?'Fill Chase Form':'Fill Inventory Form';
 openModal('voice-modal');
}
function voiceListening(active){
 const b=document.getElementById('voice-mic');
 if(b){b.textContent=active?'⏹ Stop Listening':'🎤 Start Talking';b.style.background=active?'var(--red-dim)':'';}
}
function voiceStop(){
 CVVOICE.active=false;CVVOICE.recording=false;CVVOICE.session++;
 if(CVVOICE.restartTimer!==null){clearTimeout(CVVOICE.restartTimer);CVVOICE.restartTimer=null;}
 const rec=CVVOICE.recognizer;CVVOICE.recognizer=null;
 if(rec)try{rec.abort()}catch(e){}
 voiceListening(false);
}
function voiceClose(){voiceStop();closeModal('voice-modal');}
function voiceTyped(){
 // Preserve manual corrections instead of overwriting them with the next interim result.
 if(CVVOICE.active)voiceStop();
 CVVOICE.base=document.getElementById('voice-transcript')?.value||'';
 const status=document.getElementById('voice-status');
 if(status)status.textContent='Transcript edited. Tap Start Talking to add more.';
}
function voiceWrite(text){
 const area=document.getElementById('voice-transcript');
 if(!area)return;
 area.value=text;voicePreview();
}
function voiceStartSession(){
 if(!CVVOICE.active)return;
 const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!Speech){voiceStop();return;}
 const token=++CVVOICE.session;
 const rec=new Speech();
 CVVOICE.recognizer=rec;
 rec.lang='en-US';rec.interimResults=true;rec.continuous=true;rec.maxAlternatives=1;
 // Each recognition session starts from an immutable confirmed transcript.
 const base=CVVOICE.base;
 let lastPhrase='',heardWords=false,finalPhrase='';
 rec.onstart=()=>{
  if(token!==CVVOICE.session)return;
  CVVOICE.recording=true;voiceListening(true);
  document.getElementById('voice-status').textContent='Listening… keep speaking, even through pauses.';
 };
 rec.onresult=e=>{
  if(token!==CVVOICE.session)return;
  let final='',interim='';
  // On Android, result entries can repeat/change until final. Rebuild rather than append.
  for(let i=0;i<e.results.length;i++){
   const result=e.results[i];
   const phrase=String(result?.[0]?.transcript||'').trim();
   if(!phrase)continue;
   if(result.isFinal)final=voiceJoin(final,phrase);
   else interim=voiceJoin(interim,phrase);
  }
  finalPhrase=final;
  lastPhrase=voiceJoin(final,interim);
  if(lastPhrase)heardWords=true;
  voiceWrite(voiceJoin(base,lastPhrase));
 };
 rec.onerror=e=>{
  if(token!==CVVOICE.session)return;
  const code=e.error||'unavailable';
  if(['not-allowed','service-not-allowed','audio-capture','network'].includes(code)){
   voiceStop();
   document.getElementById('voice-status').textContent='Microphone unavailable ('+code+'). Try keyboard dictation or check browser permissions.';
  }else if(code==='no-speech'){
   document.getElementById('voice-status').textContent='No speech detected. Listening will resume automatically…';
  }else if(code!=='aborted'){
   document.getElementById('voice-status').textContent='Recognition interrupted ('+code+'). Attempting to resume…';
  }
 };
 rec.onend=()=>{
  if(token!==CVVOICE.session)return;
  CVVOICE.recording=false;CVVOICE.recognizer=null;
  // Commit recognized final speech once. Use last interim only when the browser never finalized it.
  const completed=finalPhrase||lastPhrase;
  if(completed){CVVOICE.base=voiceJoin(base,completed);voiceWrite(CVVOICE.base);}
  if(!CVVOICE.active){voiceListening(false);return;}
  CVVOICE.quietEnds=completed?0:CVVOICE.quietEnds+1;
  // Avoid an endless restart loop on browsers that repeatedly fail without audio.
  if(CVVOICE.quietEnds>=5){
   voiceStop();
   document.getElementById('voice-status').textContent='Paused after several attempts without speech. Tap Start Talking to resume.';
   return;
  }
  document.getElementById('voice-status').textContent='Continuing to listen…';
  CVVOICE.restartTimer=setTimeout(()=>{
   CVVOICE.restartTimer=null;
   if(CVVOICE.active)voiceStartSession();
  },350);
 };
 try{rec.start();}
 catch(e){
  if(token!==CVVOICE.session)return;
  voiceStop();
  document.getElementById('voice-status').textContent='Could not restart the microphone: '+e.message+'. Tap Start Talking again or use keyboard dictation.';
 }
}
function voiceUseKeyboard(){
 voiceStop();
 const area=document.getElementById('voice-transcript');
 if(!area)return;
 area.focus();
 try{area.setSelectionRange(area.value.length,area.value.length)}catch(e){}
 const status=document.getElementById('voice-status');
 if(status)status.textContent='Tap the microphone on your Samsung/Google keyboard, then describe the whole card at your normal speaking pace.';
}
function voiceListen(){
 if(CVVOICE.active){
  const rec=CVVOICE.recognizer;
  // Keep the current transcript; a natural onend callback is not needed to stop safely.
  voiceStop();
  document.getElementById('voice-status').textContent='Stopped — review the details or speak again.';
  return;
 }
 if(!(window.SpeechRecognition||window.webkitSpeechRecognition)){
  document.getElementById('voice-status').textContent='Please use your keyboard microphone or type.';
  return;
 }
 CVVOICE.active=true;CVVOICE.quietEnds=0;
 CVVOICE.base=document.getElementById('voice-transcript').value.trim();
 voiceListening(true);
 voiceStartSession();
}
function voicePreview(){
 const d=voiceParse(document.getElementById('voice-transcript')?.value),el=document.getElementById('voice-preview');
 const keys={player:'Player / subject',sport:'Sport',year:'Year',set:'Brand / set',variation:'Parallel',grade:'Grade',condition:'Condition',cardNum:'Card #',printRun:'Numbered to',team:'Team',cost:'Purchase cost',value:'Estimated value',target:'Target price',priority:'Priority',notes:'Notes',certNumber:'Cert #'};
 const rows=Object.entries(d).filter(([k,v])=>v!=null&&v!==''&&(CVVOICE.mode==='inventory'||!['cost','value','condition','certNumber'].includes(k)));
 el.innerHTML=rows.length?'<div style="color:var(--gold);font-size:13px;font-weight:700;margin:10px 0">Recognized details</div>'+rows.map(([k,v])=>'<div style="display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--border);padding:5px 0;font-size:12px"><span style="color:var(--text2)">'+voiceEscape(keys[k]||k)+'</span><b style="text-align:right;overflow-wrap:anywhere">'+voiceEscape(v)+'</b></div>').join(''):'<p style="font-size:12px;color:var(--text2);margin:12px 0">Speak or type to preview fields.</p>';
}
function voiceApply(){
 const d=voiceParse(document.getElementById('voice-transcript')?.value);
 if(!d.player){document.getElementById('voice-status').textContent='Please say “player” followed by the name so it can be identified.';return;}
 voiceClose();
 if(CVVOICE.mode==='chase'){
  chaseEdit('');
  const fields={'chase-name':d.player,'chase-details':[d.year,d.set,d.variation,d.grade,d.printRun?'/'+d.printRun:''].filter(Boolean).join(' · '),'chase-target':d.target??d.cost,'chase-priority':d.priority,'chase-notes':d.notes};
  for(const [id,value]of Object.entries(fields))if(value!=null&&value!==''){const el=document.getElementById(id);if(el)el.value=String(value);}
  const category=document.getElementById('chase-category');if(category&&d.sport&&Array.from(category.options).some(o=>o.value===d.sport))category.value=d.sport;
 }else{
  openAddModal();showAddStep('form');
  const fields={'n-player':d.player,'n-sport':d.sport,'n-year':d.year,'n-team':d.team,'n-set':d.set,'n-cardnum':d.cardNum,'n-variation':d.variation,'n-printrun':d.printRun,'n-cost':d.cost,'n-value':d.value,'n-notes':d.notes,'n-cert':d.certNumber,'n-grade':d.grade,'n-condition':d.condition};
  for(const [id,value]of Object.entries(fields)){
   if(value==null||value==='')continue;
   const el=document.getElementById(id);if(!el)continue;
   if(el.tagName==='SELECT'&&!Array.from(el.options).some(o=>o.value===String(value)))continue;
   el.value=String(value);
  }
 }
 toast('Voice details filled. Review before saving.','success');
}
function voiceInit(){
 const modal=document.createElement('div');modal.id='voice-modal';modal.className='overlay';modal.style.zIndex='410';
 modal.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-header"><div class="sheet-title" id="voice-title">🎤 Voice Entry</div><button class="sheet-close" type="button" onclick="voiceClose()">✕</button></div><div class="sheet-body">'+
 '<p style="font-size:12px;color:var(--text2);line-height:1.5;margin:0 0 10px">Dictate the entire card description using your phone keyboard, at a normal speaking pace. For example: “2015 Panini Prizm Nikola Jokic Silver PSA 9, paid 300 dollars, worth 450 dollars.”</p>'+
 '<button class="btn btn-primary" type="button" id="voice-keyboard" onclick="voiceUseKeyboard()">🎙 Dictate with Phone Keyboard</button>'+
 '<div id="voice-status" role="status" style="font-size:12px;color:var(--text2);margin:8px 0 10px">Tap above, then the microphone on your keyboard.</div>'+
 '<label class="form-label" for="voice-transcript">What you said — editable</label>'+
 '<textarea id="voice-transcript" class="form-input" rows="4" style="min-height:120px;width:100%;font-size:16px" autocomplete="off" autocapitalize="sentences" placeholder="Describe the player, brand, grade, price, etc." oninput="voicePreview();voiceTyped()"></textarea>'+
 '<div id="voice-preview" style="margin:10px 0"></div>'+
 '<button class="btn btn-primary" id="voice-apply" type="button" onclick="voiceApply()">Fill Inventory Form</button>'+
 '<details style="margin:8px 0 12px"><summary style="font-size:12px;color:var(--text2);cursor:pointer">Alternative: experimental browser microphone</summary><p style="font-size:11px;line-height:1.5;color:var(--muted);margin:8px 0">Some Android browsers cut off speech after short pauses. Use the phone keyboard option above if this happens.</p><button class="btn btn-secondary" type="button" id="voice-mic" onclick="voiceListen()">🎤 Browser Mic (Experimental)</button></details>'+
 '<p style="font-size:11px;color:var(--muted);line-height:1.5;margin:0 0 12px">No paid AI API. Your phone or browser may use online speech processing. CardVault does not retain audio recordings or transcripts; only saved card fields are stored.</p></div></div>';
 document.body.appendChild(modal);
}
voiceInit();
