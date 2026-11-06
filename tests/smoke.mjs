// Static smoke checks for CardVault web release (no third-party packages).
// This is not a substitute for browser QA or security penetration testing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let count=0;
function check(ok,message){assert.ok(ok,message);count++;}
function scripts(folder){
  const html=read(folder+'/index.html');
  const tags=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  check(tags.length>0,folder+': expected inline scripts');
  for(const [,attrs,inline] of tags){
    const external=attrs.match(/src=["']([^"']+)["']/i);
    if(external){
      check(fs.existsSync(path.join(root,folder,external[1].split('?')[0])),folder+': missing '+external[1]);
    }else if(inline.trim()){
      new vm.Script(inline,{filename:folder+'/index.html:inline'});
      count++;
    }
  }
  const loaded=(html.match(/const modules=\[([^\]]+)\]/)||[])[1];
  check(!!loaded,folder+': module loader missing');
  const files=[...loaded.matchAll(/"([^"]+\.js\?[^"]+)"/g)].map(m=>m[1].split('?')[0]);
  check(files.includes('cv-features.js'),folder+': missing backup module');
  check(files.includes('cv-help.js'),folder+': missing help center');
  for(const file of files){
    const full=path.join(root,folder,file);
    check(fs.existsSync(full),folder+': missing '+file);
  }
  return html;
}
const app=scripts('app'),dev=scripts('dev');
check(app.includes("cv_beta_inventory"),"production storage namespace changed unexpectedly");
check(!app.includes("cv_dev_inventory"),"production unexpectedly uses development storage");
check(dev.includes("cv_dev_inventory"),"dev storage namespace changed unexpectedly");
check(!dev.includes("cv_beta_inventory"),"dev unexpectedly shares production storage");
check(!app.includes("cv-pilot.js?v="),"production should not load dev-only AI pilot");
check(dev.includes("cv-pilot.js?v="),"dev needs invite scanner");
check(app.includes("safeImageSrc("),"production image URL guard is missing");
check(dev.includes("safeImageSrc("),"development image URL guard is missing");
check(!app.includes("Load Five Demo Cards"),"production demo-data overwrite button found");
for(const dir of ['app','dev']){
  const all=fs.readdirSync(path.join(root,dir)).filter(f=>f.endsWith('.js'));
  for(const name of all){
    const filename=dir+'/'+name;
    new vm.Script(read(filename),{filename});
    count++;
  }
  check(read(dir+'/cv-features.js').includes('cvxExportBackup'),dir+': complete backup export missing');
  check(read(dir+'/cv-features.js').includes('cvRecoveryBegin()'),dir+': transactional restore safeguard missing');
}
console.log('CardVault static smoke checks passed ('+count+' checks).');
