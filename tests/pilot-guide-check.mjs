import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const start=readFileSync('pilot/start.html','utf8');
const guide=readFileSync('pilot/guide.html','utf8');
const css=readFileSync('pilot/guide.css','utf8');
const help=readFileSync('pilot/cv-help.js','utf8');
for(const [name,html] of [['start',start],['guide',guide]]){
 assert.ok(html.includes('<meta name="viewport"'),'Missing mobile viewport in '+name);
 assert.ok(html.includes('guide.css?v=pilot-guide-1'),'Missing CSS in '+name);
 assert.ok(html.includes('href="./"'),'Missing app link in '+name);
 assert.ok(!html.includes('ADMIN_TOKEN'),'Unsafe secret reference in '+name);
 assert.ok(!html.includes('ANTHROPIC_API_KEY'),'Unsafe secret reference in '+name);
}
assert.ok(start.includes('Activate 50 Free Scans'));
assert.ok(start.includes('Export Complete Backup (Including Photos)'));
assert.ok(start.includes('Add to Home Screen'));
assert.ok(guide.includes('Restore Pilot Data'));
assert.ok(guide.includes('CURRENT PILOT')===false);
assert.ok(guide.includes('No cloud account or automatic sync'));
assert.ok(guide.includes('Cloudflare'));
assert.ok(guide.includes('Anthropic'));
assert.ok(css.length>1000);
assert.ok(help.includes('href="start.html"'));
assert.ok(help.includes('href="guide.html"'));
new vm.Script(help,{filename:'pilot/cv-help.js'});
console.log('Pilot quick-start and complete user guide passed content and linking checks.');
