// CardVault pilot scanning API — Cloudflare Worker + D1. No browser-exposed Anthropic key.
// Deploy only after configuring D1 and the two required secrets (README.md).
const MAX_IMAGE_BYTES = 200_000;
const MAX_SIDE = 600;
const RESERVED_MICRO_USD = 30_000; // $0.03 reserved until request settles.
const MODEL = 'claude-opus-4-6';
const OUTPUT_TOKENS = 500;
const PROMPT = `You are a sports card expert. Extract only information visible in this one card image.
Respond ONLY with a valid JSON object, no markdown and no additional commentary:
{"player":"","year":"","sport":"","team":"","set":"","cardNum":"","variation":"","condition":"Raw","grade":"","certNumber":"","printRun":"","notes":""}
Rules: sport = Baseball/Basketball/Football/Hockey/Soccer/Other/Non-Sports.
Use Non-Sports for entertainment, movie, music and other non-sport cards.
condition = Raw/NM-MT/EX-MT/VG-EX/Graded.
grade = grading label if visible (PSA 9, BGS 9.5, SGC 10 etc), else empty.
certNumber = cert or serial number on slab label if visible, else empty.
printRun = print run total only (if 47/150, use "150").
Set condition Graded if graded. Use empty strings rather than guessing.`;

function respond(body, status = 200, origin = '') {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, X-CardVault-Invite, Authorization';
    headers['Access-Control-Max-Age'] = '3600';
  }
  return new Response(JSON.stringify(body), { status, headers });
}
function problem(error, status, origin) {
  return respond({ ok: false, error }, status, origin);
}
function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGIN || 'https://rorymallard78-design.github.io');
  return origin === allowed ? origin : '';
}
function normalizedCode(value) {
  const code = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  return /^CV-[A-F0-9]{32}$/.test(code) ? code : '';
}
async function hashCode(code) {
  const bytes = new TextEncoder().encode(code);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}
function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return 'CV-' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
function isAdmin(request, env) {
  const provided = request.headers.get('Authorization') || '';
  const expected = env.ADMIN_TOKEN ? 'Bearer ' + env.ADMIN_TOKEN : '';
  if (!expected || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
async function jsonBody(request, max = 350_000) {
  const size = request.headers.get('Content-Length');
  if (size && Number(size) > max) throw new Error('Request too large');
  const raw = await request.text();
  if (raw.length > max) throw new Error('Request too large');
  return JSON.parse(raw);
}
// Scans are JPEG only: CardVault compresses each photo to JPEG at <=600px.
// Reject invalid dimensions even when a caller bypasses the frontend.
function jpegSize(bytes) {
  if (bytes.length < 40 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    while (bytes[i] === 0xff) i++;
    const marker = bytes[i++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 2 > bytes.length) return null;
    const length = (bytes[i] << 8) + bytes[i + 1];
    if (length < 2 || i + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) return null;
      return { height: (bytes[i + 3] << 8) + bytes[i + 4], width: (bytes[i + 5] << 8) + bytes[i + 6] };
    }
    i += length;
  }
  return null;
}
function validateImage(value) {
  if (typeof value !== 'string' || !value.startsWith('data:image/jpeg;base64,')) throw new Error('Upload a JPEG photo');
  const base64 = value.slice('data:image/jpeg;base64,'.length);
  if (!base64 || base64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error('Card photo is too large or invalid');
  }
  let bytes;
  try { bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)); } catch { throw new Error('Invalid image encoding'); }
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Photo must be under 200 KB');
  const d = jpegSize(bytes);
  if (!d || !d.width || !d.height || d.width > MAX_SIDE || d.height > MAX_SIDE) {
    throw new Error('Photo dimensions must be 600px or smaller');
  }
  return base64;
}
async function lookupInvite(request, env) {
  const code = normalizedCode(request.headers.get('X-CardVault-Invite'));
  if (!code) return null;
  return hashCode(code);
}
async function invitationStatus(env, codeHash) {
  return env.DB.prepare('SELECT label, quota, used, active FROM pilot_invites WHERE code_hash = ?').bind(codeHash).first();
}
async function handleScan(request, env, origin) {
  const hash = await lookupInvite(request, env);
  if (!hash) return problem('Enter a valid invitation code', 403, origin);
  let image;
  try {
    const payload = await jsonBody(request);
    image = validateImage(payload.image);
  } catch (e) { return problem(e.message === 'Request too large' ? e.message : 'Invalid or oversized card photo: ' + e.message, 400, origin); }
  const attempt = crypto.randomUUID();
  let slot;
  try {
    // Atomic reservation via D1 triggers; checks both per-invite and global budget.
    slot = await env.DB.prepare(`UPDATE pilot_invites
      SET used = used + 1, last_attempt_id = ?, last_scan_at = unixepoch()
      WHERE code_hash = ? AND active = 1 AND used < quota
        AND (last_scan_at IS NULL OR last_scan_at <= unixepoch() - 2)
      RETURNING quota, used`).bind(attempt, hash).first();
  } catch (e) {
    if (String(e).includes('BUDGET_EXHAUSTED')) return problem('Pilot scanning budget reached', 429, origin);
    console.error('Reservation error', e);
    return problem('Scanning temporarily unavailable', 503, origin);
  }
  if (!slot) {
    const state = await invitationStatus(env, hash);
    if (!state || !state.active) return problem('Invitation code not recognized or disabled', 403, origin);
    if (state.used >= state.quota) return problem('All 50 pilot scans have been used', 429, origin);
    return problem('Please allow 2 seconds between scans', 429, origin);
  }
  let billedMicroUsd = 0;
  let inTokens = 0;
  let outTokens = 0;
  let card = null;
  let failure = null;
  try {
    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(35_000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: OUTPUT_TOKENS,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: PROMPT }
        ] }]
      })
    });
    if (!apiResponse.ok) throw new Error('Anthropic API returned ' + apiResponse.status);
    const data = await apiResponse.json();
    inTokens = Math.max(0, Number(data.usage?.input_tokens) || 0);
    outTokens = Math.max(0, Number(data.usage?.output_tokens) || 0);
    // Standard Claude Opus 4.6 pricing: $5/$25 per million input/output tokens.
    billedMicroUsd = Math.round(inTokens * 5 + outTokens * 25);
    const text = (data.content || []).filter(x => x.type === 'text').map(x => x.text).join('').trim();
    const parsed = JSON.parse(text.replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi, ''));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.player !== 'string' || !parsed.player.trim()) {
      throw new Error('AI could not identify a card');
    }
    const fields = ['player','year','sport','team','set','cardNum','variation','condition','grade','certNumber','printRun','notes'];
    card = Object.fromEntries(fields.map(k => [k, typeof parsed[k] === 'string' ? parsed[k].slice(0, k === 'notes' ? 500 : 120) : '']));
  } catch (e) {
    console.error('Scan failed', e);
    failure = 'Could not read this card. Your scan credit was returned; you can enter the card manually.';
  }
  try {
    // Triggers settle the budget AND invitation allowance in one atomic statement.
    const status = card ? 'succeeded' : 'failed';
    const settled = await env.DB.prepare(`UPDATE pilot_scans
      SET status = ?, finished_at = unixepoch(), input_tokens = ?, output_tokens = ?, cost_micro_usd = ?
      WHERE id = ? AND status = 'pending' RETURNING id`)
      .bind(status, inTokens, outTokens, billedMicroUsd, attempt).first();
    if (!settled) return problem('Scan request expired, please retry', 503, origin);
  } catch (e) {
    console.error('Settlement failed', e);
    return problem('Could not verify scan allowance, contact the tester administrator', 503, origin);
  }
  if (!card) return problem(failure, 422, origin);
  return respond({ ok: true, card, remaining: slot.quota - slot.used, model: MODEL }, 200, origin);
}
async function handleStatus(request, env, origin) {
  const hash = await lookupInvite(request, env);
  if (!hash) return problem('Enter an invitation code', 403, origin);
  const state = await invitationStatus(env, hash);
  if (!state || !state.active) return problem('Invitation code not recognized or disabled', 403, origin);
  return respond({ ok: true, quota: state.quota, used: state.used, remaining: Math.max(0, state.quota - state.used) }, 200, origin);
}
async function createInvite(request, env, origin) {
  let label;
  try {
    const body = await jsonBody(request, 5000);
    label = String(body.label || '').trim().slice(0, 100);
  } catch { return problem('Invalid request', 400, origin); }
  if (!label) return problem('A tester label is required', 400, origin);
  const code = newCode();
  const hash = await hashCode(code);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO pilot_invites (id, code_hash, label) VALUES (?, ?, ?)')
    .bind(id, hash, label).run();
  return respond({ ok: true, id, label, code, quota: 50, note: 'Copy this code now; it is not stored in plaintext.' }, 201, origin);
}
async function adminStats(env, origin) {
  const budget = await env.DB.prepare('SELECT max_scans, max_spend_micro_usd, claimed_scans, completed_scans, failed_scans, spent_micro_usd, reserved_micro_usd FROM pilot_budget WHERE id=1').first();
  const invitations = await env.DB.prepare('SELECT id, label, quota, used, active, created_at FROM pilot_invites ORDER BY created_at DESC').all();
  return respond({ ok: true, maxScans: budget.max_scans, claimedScans: budget.claimed_scans, completedScans: budget.completed_scans, failedScans: budget.failed_scans, estimatedSpentUsd: budget.spent_micro_usd / 1_000_000, reservedUsd: budget.reserved_micro_usd / 1_000_000, budgetUsd: budget.max_spend_micro_usd / 1_000_000, invitations: invitations.results }, 200, origin);
}
async function revokeInvite(request, env, origin) {
  let id;
  try { id = String((await jsonBody(request, 5000)).id || ''); } catch { return problem('Invalid request', 400, origin); }
  const changed = await env.DB.prepare('UPDATE pilot_invites SET active=0 WHERE id=? RETURNING id').bind(id).first();
  return changed ? respond({ ok: true, id }, 200, origin) : problem('Invitation not found', 404, origin);
}
function adminPage() {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CardVault Pilot Manager</title><style>
  :root{font-family:system-ui;color-scheme:dark;background:#101827;color:#eee}body{max-width:640px;margin:auto;padding:18px}
  section{border:1px solid #475569;border-radius:12px;background:#1e293b;padding:15px;margin:14px 0}input{padding:12px;background:#101827;border:1px solid #64748b;border-radius:8px;width:100%;color:white;box-sizing:border-box;font-size:16px}
  button{border:0;border-radius:8px;padding:12px;background:#ebb54c;color:#111;font-weight:bold;margin:8px 6px 0 0}#message{color:#ebb54c;white-space:pre-wrap}.hidden{display:none}
  table{width:100%;border-collapse:collapse}td,th{padding:8px 3px;text-align:left;border-bottom:1px solid #475569}small{color:#aaa}#newcode{overflow-wrap:anywhere;background:#101827;padding:12px;font-family:monospace}
  </style></head><body><h2>CardVault Pilot Manager</h2><p>Manage invitations from your phone.</p><section><label for="token">Administrator token</label><input id="token" type="password" autocomplete="off" placeholder="Paste ADMIN_TOKEN"><button id="unlock">Unlock</button><button id="lock">Lock</button><p><small>The token stays in memory only until this page closes. It is not saved.</small></p></section><p id="message" role="status"></p>
  <div id="panel" class="hidden"><section><h3>Usage</h3><p id="stats"></p><button id="refresh">Refresh</button></section><section><h3>Create an invitation</h3><input id="label" maxlength="100" placeholder="Tester name"><button id="create">Create 50-scan code</button><div id="newbox" class="hidden"><p>Copy this code now; it cannot be retrieved later.</p><div id="newcode"></div><button id="copy">Copy Code</button></div></section><section><h3>Invitations</h3><table><thead><tr><th>Tester</th><th>Used</th><th>State</th><th>Action</th></tr></thead><tbody id="list"></tbody></table></section></div>
  <script>
  (()=>{'use strict';let token='';const el=id=>document.getElementById(id),say=t=>el('message').textContent=t;
  function lock(){token='';el('token').value='';el('panel').classList.add('hidden');el('newbox').classList.add('hidden');say('Locked.')}
  async function api(path,method='GET',body){
   if(!token)throw Error('Enter your token.');
   const r=await fetch('/v1/admin/'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
   const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||'Request failed');return d;
  }
  async function refresh(){
   const d=await api('stats');
   el('stats').textContent=d.completedScans+' completed scans; measured cost USD '+Number(d.estimatedSpentUsd||0).toFixed(4)+' of USD '+Number(d.budgetUsd||0).toFixed(2)+' pilot budget.';
   el('list').replaceChildren();
   for(const inv of d.invitations||[]){
    const tr=document.createElement('tr');
    for(const text of [inv.label,inv.used+'/'+inv.quota,inv.active?'Active':'Revoked']){let td=document.createElement('td');td.textContent=text;tr.append(td);}
    const td=document.createElement('td');
    if(inv.active){const b=document.createElement('button');b.textContent='Revoke';b.onclick=async()=>{if(!confirm('Revoke '+inv.label+'?'))return;try{await api('revoke','POST',{id:inv.id});await refresh();say('Revoked.')}catch(e){say(e.message)}};td.append(b)}
    tr.append(td);el('list').append(tr);
   }
  }
  el('unlock').onclick=async()=>{token=el('token').value.trim();el('token').value='';try{await refresh();el('panel').classList.remove('hidden');say('Unlocked.')}catch(e){lock();say(e.message)}};
  el('lock').onclick=lock;el('refresh').onclick=()=>refresh().catch(e=>say(e.message));
  el('create').onclick=async()=>{const label=el('label').value.trim();if(!label){say('Enter tester name');return}try{const d=await api('invites','POST',{label});el('newcode').textContent=d.code;el('newbox').classList.remove('hidden');el('label').value='';await refresh();say('Code created. Copy it now.')}catch(e){say(e.message)}};
  el('copy').onclick=()=>navigator.clipboard.writeText(el('newcode').textContent).then(()=>say('Copied')).catch(()=>say('Select and copy the code manually.'));
  })();
  </script></body></html>`;
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
}

export default {
  async fetch(request, env) {
    const originHeader = request.headers.get('Origin');
    const origin = allowedOrigin(request, env);
    if (originHeader && !origin) return problem('Origin not permitted', 403, '');
    if (request.method === 'OPTIONS') return origin ? respond({ ok: true }, 200, origin) : problem('Origin not permitted', 403, '');
    const path = new URL(request.url).pathname;
    if (path === '/admin' && request.method === 'GET') return adminPage();
    try {
      if (path === '/v1/health' && request.method === 'GET') return respond({ ok: true, configured: !!(env.DB && env.ANTHROPIC_API_KEY) }, 200, origin);
      if (!env.DB || !env.ANTHROPIC_API_KEY) return problem('Pilot scanning backend not configured', 503, origin);
      if (path === '/v1/status' && request.method === 'GET') return handleStatus(request, env, origin);
      if (path === '/v1/scan' && request.method === 'POST') return handleScan(request, env, origin);
      if (path.startsWith('/v1/admin/')) {
        if (!isAdmin(request, env)) return problem('Unauthorized', 401, origin);
        if (path === '/v1/admin/invites' && request.method === 'POST') return createInvite(request, env, origin);
        if (path === '/v1/admin/stats' && request.method === 'GET') return adminStats(env, origin);
        if (path === '/v1/admin/revoke' && request.method === 'POST') return revokeInvite(request, env, origin);
      }
      return problem('Not found', 404, origin);
    } catch (e) {
      console.error('CardVault pilot backend error', e);
      return problem('Pilot service error', 500, origin);
    }
  },
  async scheduled(event, env) {
    // Abandoned requests reclaim a scan after ten minutes.
    const expired = await env.DB.prepare(`UPDATE pilot_scans SET status='expired', finished_at=unixepoch()
      WHERE status='pending' AND started_at < unixepoch()-600 RETURNING id`).all();
    if (expired.results?.length) console.log('Reclaimed abandoned scan reservations:', expired.results.length);
  }
};
