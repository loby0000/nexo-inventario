// Opt-in migration rehearsal on the restored validation copy. Never production.
// Legacy identity comes from a trusted test service, not a signed ChatGPT session;
// the real owner's signed transfer remains a separate launch gate.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const project='https://ddxosemcisemyhywmfkj.supabase.co';
const origin='https://nexo-inventario-validacion.loby207.workers.dev';
const {SUPABASE_SECRET_KEY:key}=JSON.parse(await readFile('.sites-runtime/nexo-validation-secrets.json','utf8'));
const {credentials}=JSON.parse(await readFile('.sites-runtime/nexo-validation-users.json','utf8'));
const backup=JSON.parse(await readFile('../nexo-respaldo-2026-11-06.json','utf8'));
assert.equal(backup.format,'nexo-backup-v1');
const owners=[...new Set(backup.tables.products.map(p=>p.owner))];
assert.equal(owners.length,1,'Rehearsal expects one restored legacy business');
const legacy=owners[0];
async function json(url,body,headers={}) {
 const r=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 return {status:r.status,data:await r.json()};
}
const config=await json(origin+'/api/config');assert.equal(config.data.url,project);
async function session(u) {
 const r=await json(project+'/auth/v1/token?grant_type=password',{email:u.email,password:u.password},{apikey:config.data.key});
 assert.equal(r.status,200,'Fixture login failed');return r.data.access_token;
}
const token=await session(credentials[0]);
const trusted={apikey:key};
const legacyCall=(method,body={})=>json(project+'/rest/v1/rpc/nexo_gateway',{p_user:legacy,p_email:'owner-rehearsal@example.test',p_name:'Ensayo',p_workspace:legacy,p_method:method,p_body:body,p_nonce:randomUUID()},trusted);
const before=await legacyCall('GET');assert.equal(before.status,200,'Restored origin must remain untransferred');
const transfer=await legacyCall('POST',{action:'createTransfer'});assert.equal(transfer.status,200,'Owner service token generation');
assert.equal(transfer.data.expiresIn,900);
const headers={Authorization:'Bearer '+token};
const invalid=await json(origin+'/api/transfer',{token:'invalid-token-for-hosted-test-000000000000000000'},headers);
assert.equal(invalid.status,409,'Invalid transfer token must be rejected');
const claimed=await json(origin+'/api/transfer',{token:transfer.data.token},headers);
assert.equal(claimed.status,200,'Transfer failed');
const company=claimed.data.id;
await writeFile('.sites-runtime/nexo-transfer-rehearsal.json',JSON.stringify({company,legacy,at:new Date().toISOString()},null,2));
const moved=await json(origin+'/api/inventory?company='+company,null,headers);
assert.equal(moved.status,200);
for(const entity of ['products','documents','movements']) {
 const expected=backup.tables[entity].filter(r=>r.owner===legacy);
 assert.equal(moved.data[entity].length,expected.length,entity+' count');
 assert.deepEqual(moved.data[entity].map(r=>r.id).sort(),expected.map(r=>r.id).sort(),entity+' IDs');
}
for(const p of backup.tables.products)assert.equal(moved.data.products.find(r=>r.id===p.id).stock,p.stock,'Stock preserved');
const after=await legacyCall('POST',{action:'createTransfer'});
assert.notEqual(after.status,200);assert.match(after.data.message,/traslad/);
const oldRead=await legacyCall('GET');assert.notEqual(oldRead.status,200);assert.match(oldRead.data.message,/traslad/);
const reused=await json(origin+'/api/transfer',{token:transfer.data.token},{Authorization:'Bearer '+await session(credentials[1])});
assert.equal(reused.status,409,'Transfer token must be one-use');
const cross=await json(origin+'/api/inventory?company='+company,null,{Authorization:'Bearer '+await session(credentials[1])});
assert.equal(cross.status,403,'Unrelated account must not see transferred business');
const report={at:new Date().toISOString(),project,origin,company,counts:{products:moved.data.products.length,documents:moved.data.documents.length,movements:moved.data.movements.length},checks:['Invalid token rejected','IDs and stocks preserved in hosted transfer','Old reads and writes blocked after claim','Reused token rejected for another account','Transferred business inaccessible to unrelated account'],limitations:['Validation copy only; original production inventory unchanged','Legacy service identity supplied by test harness; signed real-owner session still requires end-to-end verification','Fixture user email auto-confirmed; real email flow not proven']};
await writeFile('../nexo-hosted-transfer.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
