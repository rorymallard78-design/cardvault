// Integration-level tests for the beta Worker using an in-memory SQLite database.
// No Anthropic API calls; these tests cover actual triggers, authorization, billing,
// and scan state transitions. Run with Node 24+: node tests/pilot-integration.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import handler from '../pilot-backend/src/index.js';

const schema=fs.readFileSync(new URL('../pilot-backend/schema.sql', import.meta.url),'utf8');
const db=new DatabaseSync(':memory:');
db.exec(schema);
const cloudDB={
  prepare(sql){
    const stmt=db.prepare(sql);
    return {
      bind(...params){
        const call={
          first:async()=>stmt.get(...params)||null,
          all:async()=>({results:stmt.all(...params)}),
          run:async()=>stmt.run(...params),
        };
        return call;
      },
      first:async()=>stmt.get()||null,
      all:async()=>({results:stmt.all()}),
      run:async()=>stmt.run(),
    };
  }
};
const env={DB:cloudDB,ANTHROPIC_API_KEY:'test-token-not-real',ADMIN_TOKEN:'admin-integration-test-token',ALLOWED_ORIGIN:'https://rorymallard78-design.github.io'};
const root='https://cardvault-pilot.example';
const origin='https://rorymallard78-design.github.io';
const badOrigin='https://not-cardvault.example';
const codeOf=async res=>(await res.json());
const request=async(path,{method='GET',headers={},body,host=origin}={})=>{
  const h={Origin:host,...headers};
  const req=new Request(root+path,{method,headers:h,body:body?JSON.stringify(body):undefined});
  return handler.fetch(req,env);
};
const admin={'Authorization':'Bearer '+env.ADMIN_TOKEN,'Content-Type':'application/json'};
const mkInvite=async name=>{
  const res=await request('/v1/admin/invites',{method:'POST',headers:admin,body:{label:name}});
  assert.equal(res.status,201);
  const result=await codeOf(res);
  assert.match(result.code,/^CV-[A-F0-9]{32}$/);
  assert.equal(result.quota,50);
  return result;
};
const tester=code=>({'X-CardVault-Invite':code,'Content-Type':'application/json'});
const state=async code=>{
  const res=await request('/v1/status',{headers:tester(code)});
  assert.equal(res.status,200);
  return codeOf(res);
};
const image=(w=1,h=1)=>{
  // Minimal SOF0 JPEG-like byte stream; tests parser only, not image decoding.
  const b=Buffer.alloc(44,0);
  b[0]=0xff;b[1]=0xd8;b[2]=0xff;b[3]=0xc0;b[4]=0;b[5]=17;
  b[6]=8;b[7]=h>>8;b[8]=h&255;b[9]=w>>8;b[10]=w&255;
  return 'data:image/jpeg;base64,'+b.toString('base64');
};
const goodCard={player:'Cooper Flagg',year:'2025',sport:'Basketball',set:'Topps Chrome',team:'Dallas Mavericks'};
const nativeFetch=globalThis.fetch;
let fail=false,apiCount=0;
globalThis.fetch=async (url,opts)=>{
  assert.equal(String(url),'https://api.anthropic.com/v1/messages');
  assert.equal(opts.headers['x-api-key'],env.ANTHROPIC_API_KEY);
  assert.ok(!opts.body.includes(env.ANTHROPIC_API_KEY),'key leaked to request body');
  apiCount++;
  return new Response(JSON.stringify({content:[{type:'text',text:fail?'This is not JSON':JSON.stringify(goodCard)}],usage:{input_tokens:600,output_tokens:100}}),{status:200,headers:{'Content-Type':'application/json'}});
};
try {
  const health=await codeOf(await request('/v1/health'));
  assert.equal(health.ok,true);

  const rejected=await request('/v1/health',{host:badOrigin});
  assert.equal(rejected.status,403);
  const missing=await request('/v1/status',{headers:tester('CV-'+'0'.repeat(32))});
  assert.equal(missing.status,403);
  const unknown=await request('/v1/admin/stats');
  assert.equal(unknown.status,401);

  const alice=await mkInvite('Alice');
  const bob=await mkInvite('Bob');
  assert.equal((await state(alice.code)).remaining,50);
  assert.equal((await state(bob.code)).remaining,50);
  const noImage=await request('/v1/scan',{method:'POST',headers:tester(alice.code),body:{image:'data:text/html;base64,PHNjcmlwdD4='}});
  assert.equal(noImage.status,400);
  const large=await request('/v1/scan',{method:'POST',headers:tester(alice.code),body:{image:image(601,300)}});
  assert.equal(large.status,400);
  assert.equal(apiCount,0);
  assert.equal((await state(alice.code)).used,0);

  const first=await request('/v1/scan',{method:'POST',headers:tester(alice.code),body:{image:image()}});
  assert.equal(first.status,200);
  const data=await codeOf(first);
  assert.equal(data.ok,true);assert.equal(data.card.player,goodCard.player);assert.equal(data.remaining,49);
  assert.equal((await state(bob.code)).remaining,50,'invites must be separate');

  // Simulate passage of the per-code 2-second throttle.
  db.prepare('UPDATE pilot_invites SET last_scan_at=NULL WHERE id=?').run(alice.id);
  fail=true;
  const failing=await request('/v1/scan',{method:'POST',headers:tester(alice.code),body:{image:image()}});
  assert.equal(failing.status,422);
  fail=false;
  assert.equal((await state(alice.code)).remaining,49,'failed scans must be refunded');
  const ledger=db.prepare('SELECT completed_scans,claimed_scans,failed_scans,spent_micro_usd,reserved_micro_usd FROM pilot_budget WHERE id=1').get();
  assert.equal(ledger.completed_scans,1);
  assert.equal(ledger.claimed_scans,1);
  assert.equal(ledger.failed_scans,1);
  assert.equal(ledger.reserved_micro_usd,0);
  assert.equal(ledger.spent_micro_usd,11000,'even invalid JSON outputs can cost real tokens');

  const max=await request('/v1/admin/stats',{headers:admin});
  assert.equal(max.status,200);
  const stats=await codeOf(max);
  assert.equal(stats.claimedScans,1);
  assert.equal(stats.completedScans,1);
  assert.equal(stats.estimatedSpentUsd,0.011);

  // Check quota exhaustion across 49 further successful requests.
  for(let j=0;j<49;j++){
    db.prepare('UPDATE pilot_invites SET last_scan_at=NULL WHERE id=?').run(alice.id);
    const res=await request('/v1/scan',{method:'POST',headers:tester(alice.code),body:{image:image()}});
    assert.equal(res.status,200,'scan '+(j+2));
  }
  assert.equal((await state(alice.code)).remaining,0);
  const over=await request('/v1/scan',{method:'POST',headers:tester(alice.code),body:{image:image()}});
  assert.equal(over.status,429);
  assert.equal((await state(bob.code)).remaining,50);
  assert.equal(apiCount,51,'failed response plus 50 successful requests');

  // Separate fresh database limit test: restrict global max to 50 completed.
  db.prepare('UPDATE pilot_budget SET max_scans=50').run();
  const budgeted=await request('/v1/scan',{method:'POST',headers:tester(bob.code),body:{image:image()}});
  assert.equal(budgeted.status,429);
  assert.equal((await state(bob.code)).remaining,50);

  const revoked=await request('/v1/admin/revoke',{method:'POST',headers:admin,body:{id:bob.id}});
  assert.equal(revoked.status,200);
  const revokedStatus=await request('/v1/status',{headers:tester(bob.code)});
  assert.equal(revokedStatus.status,403);
  console.log('Pilot integration checks passed (auth, CORS, invites, JPEG validation, limits, refunds, spend, revocation).');
} finally {
  globalThis.fetch=nativeFetch;
  db.close();
}
