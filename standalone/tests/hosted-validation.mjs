// Opt-in integration check. Creates synthetic fixtures only in the named validation
// project. Auto-confirmed fixture emails do NOT prove delivery or email verification.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const origin='https://nexo-inventario-validacion.loby207.workers.dev';
const project='https://ddxosemcisemyhywmfkj.supabase.co';
const secrets=JSON.parse(await readFile('.sites-runtime/nexo-validation-secrets.json','utf8'));
const key=secrets.SUPABASE_SECRET_KEY?.trim();
assert(key?.startsWith('sb_secret_'),'Missing local validation secret');
const publicConfig=await (await fetch(origin+'/api/config')).json();
assert.equal(publicConfig.url,project,'Refuse to test another project');
const run=randomUUID(), credentials=[],checks=[];
async function json(url,options={}) {
 const r=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});
 const data=await r.json();return {status:r.status,data};
}
async function rpc(user,company,action,body={}) {
 const r=await json(project+'/rest/v1/rpc/nexo_v2_gateway',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_user:user,p_company:company,p_action:action,p_body:body})});
 assert.equal(r.status,200,`RPC ${action} failed (${r.status})`);return r.data;
}
async function api(u,path,body) {
 return json(origin+'/api/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+u.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
}
for (const role of ['adminA','adminB','employee']) {
 const email=`nexo-${role.toLowerCase()}-${run}@example.test`,password=randomUUID()+randomUUID();
 const created=await json(project+'/auth/v1/admin/users',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true,user_metadata:{synthetic_qa:true,run}})});
 assert.equal(created.status,200,'Create synthetic Auth fixture');
 const login=await json(project+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:publicConfig.key,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
 assert.equal(login.status,200,'Synthetic user password login');
 credentials.push({role,email,password,id:login.data.user.id,token:login.data.access_token});
 // Persist after each fixture, so a failure never hides already-created users.
 await writeFile('.sites-runtime/nexo-validation-users.json',JSON.stringify({run,credentials},null,2));
}
const [a,b,e]=credentials,ca=randomUUID(),cb=randomUUID();
for(const [u,id,name] of [[a,ca,'QA Empresa A'],[b,cb,'QA Empresa B']]) {
 const r=await api(u,'companies',{id,name});assert.equal(r.status,200,'Create independent company');
}
checks.push('Password login and two companies via hosted Worker');
assert.equal((await api(b,'inventory?company='+ca)).status,403);
assert.equal((await api(a,'inventory?company='+cb)).status,403);
checks.push('Cross-company API access denied both directions');
assert.equal((await api(e,'bootstrap')).data.workspaces.length,0);
// Provision invitation via private RPC: email sending is intentionally disabled.
const invitation=await rpc(a.id,ca,'mutate',{action:'member',email:e.email});
assert.equal((await api(e,'invitations/accept',{id:invitation.id})).status,200);
assert.equal((await api(e,'bootstrap')).data.workspaces.length,1);
const p={action:'product',createId:randomUUID(),name:'QA ultimas unidades',sku:'QA-'+run,barcode:'000'+Date.now(),category:'QA',supplier:'Proveedor QA',unit:'unidad',cost:100,price:200,minimum:0};
assert.equal((await api(e,'inventory?company='+ca,p)).status,403);
assert.equal((await api(a,'inventory?company='+ca,p)).status,200);
checks.push('Invitation acceptance adds membership without an extra company; employee cannot create products');
const doc=(type,quantity)=>({action:'document',id:randomUUID(),type,reference:'QA '+run,contact:'Proveedor QA',note:'Synthetic hosted acceptance',lines:[{productId:p.createId,quantity,unitPrice:100}]});
assert.equal((await api(a,'inventory?company='+ca,doc('purchase',2))).status,200);
const envelope=(u,body)=>({id:body.id,user:u.id,company:ca,body,dependencies:[],createdAt:new Date().toISOString()});
const sale=envelope(e,doc('sale',1));
const retries=await Promise.all(Array.from({length:10},()=>api(e,'sync?company='+ca,sale)));
assert(retries.every(r=>r.status===200&&r.data.state==='synced'),'Ten identical concurrent requests must confirm one operation');
let inventory=(await api(a,'inventory?company='+ca)).data;
assert.equal(inventory.products.find(x=>x.id===p.createId).stock,1);
assert.equal(inventory.documents.filter(x=>x.id===sale.id).length,1);
checks.push('Ten concurrent retries: one document and one stock decrement');
const racers=[envelope(a,doc('sale',1)),envelope(e,doc('sale',1))];
const race=await Promise.all(racers.map((op,i)=>api(i?e:a,'sync?company='+ca,op)));
assert(race.every(r=>r.status===200));
assert.deepEqual(race.map(r=>r.data.state).sort(),['conflict','synced']);
inventory=(await api(a,'inventory?company='+ca)).data;
assert.equal(inventory.products.find(x=>x.id===p.createId).stock,0);
assert.equal(inventory.documents.filter(x=>racers.some(op=>op.id===x.id)).length,1);
checks.push('Two concurrent sales of last unit: one confirmed, one conflict, zero stock');
assert.equal((await api(a,'inventory?company='+ca,{action:'removeMember',id:e.id})).status,200);
assert.equal((await api(e,'inventory?company='+ca)).status,403);
checks.push('Revocation takes effect while the prior Auth token remains valid');
const result={at:new Date().toISOString(),run,origin,project,checks,limitations:['Synthetic emails were auto-confirmed through the admin API; no real email delivery tested.','HTTP concurrency is not two physical devices or a physical scanner test.','Synthetic users and fixtures retained only in the isolated validation project.']};
await writeFile('../nexo-hosted-validation.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
