// Explicit opt-in: sends one real company invitation from the isolated validation
// Worker. A successful HTTP response proves provider acceptance, not inbox delivery.
import {readFile, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const recipient = process.argv[2];
assert(recipient && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient), 'Supply an authorized test recipient');
const origin = 'https://nexo-inventario-validacion.loby207.workers.dev';
const project = 'https://ddxosemcisemyhywmfkj.supabase.co';
async function local(path) {
  try {return JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));}
  catch {throw Error('Cannot read local QA settings: '+path);}
}
const fixture = (await local('.sites-runtime/nexo-validation-users.json')).credentials.find(x=>x.role==='adminA');
assert(fixture, 'Existing synthetic QA administrator required');
const config = await (await fetch(origin+'/api/config')).json();
assert.equal(config.url, project, 'Refuse to send through another project');
const login = await fetch(project+'/auth/v1/token?grant_type=password', {
  method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},
  body:JSON.stringify({email:fixture.email,password:fixture.password}),
});
assert.equal(login.status,200,'QA login failed');
const {access_token:token} = await login.json();
async function api(path,body) {
  const r=await fetch(origin+'/api/'+path,{
    method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000),
  });
  const data=await r.json();
  assert.equal(r.status,200,`Validation API failed (${r.status})`);
  return data;
}
const path='.sites-runtime/nexo-mail-validation.json';
let state;
try {state=await local(path);} catch {state={company:crypto.randomUUID(),recipient};}
assert.equal(state.recipient,recipient,'Use the same recipient for this test run');
await writeFile(path,JSON.stringify(state,null,2));
if(!state.companyCreated) {
  await api('companies',{id:state.company,name:'QA correo Brevo'});
  state.companyCreated=true;
  await writeFile(path,JSON.stringify(state,null,2));
}
if(!state.invitation) {
  const result=await api('inventory?company='+state.company,{action:'member',email:recipient});
  state.invitation=result.id;
  state.providerAcceptedAt=new Date().toISOString();
  await writeFile(path,JSON.stringify(state,null,2));
}
assert(state.invitation,'Invitation identifier missing');
const result={origin,company:state.company,invitation:state.invitation,providerAcceptedAt:state.providerAcceptedAt,
  inboxDeliveryVerified:false,acceptanceVerified:false};
await writeFile('../nexo-hosted-mail.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
