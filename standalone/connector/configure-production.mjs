// Production was explicitly requested by the owner. Never reuse validation keys.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
const root=resolve(import.meta.dirname,'../..');
const config=JSON.parse(await readFile(resolve(root,'standalone/wrangler.jsonc'),'utf8'));
if(config.name!=='nexo-inventario'||config.vars.APP_ORIGIN!=='https://nexo-inventario.loby207.workers.dev'||config.vars.SUPABASE_URL!=='https://awihnwliaqehmzntutmb.supabase.co')throw Error('El destino no corresponde al servidor final de Nexo.');
const file=resolve(root,'.sites-runtime/nexo-scanner-production-signing.json');
let key;
try{key=JSON.parse(await readFile(file,'utf8'));}catch(e){
  if(e.code!=='ENOENT')throw Error('No se pudo leer la firma local de producción.');
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  key=await crypto.subtle.exportKey('jwk',pair.privateKey);
  await writeFile(file,JSON.stringify(key),'utf8');
}
const validation=JSON.parse(await readFile(resolve(root,'.sites-runtime/nexo-scanner-validation-signing.json'),'utf8'));
if(key.x===validation.x&&key.y===validation.y)throw Error('Producción requiere una clave distinta de validación.');
const child=spawn(process.execPath,[resolve(root,'standalone/cloudflare.mjs'),'secret','put','SCANNER_SIGNING_KEY','--config','standalone/wrangler.jsonc'],{cwd:root,windowsHide:true,stdio:['pipe','inherit','inherit']});
child.stdin.end(JSON.stringify(key));
await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('No se configuró la firma de producción.')));});
