import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const dir=resolve(import.meta.dirname,'../.sites-runtime');
await mkdir(dir,{recursive:true});
const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
await writeFile(resolve(dir,'scanner-signing-key.json'),JSON.stringify(jwk),{encoding:'utf8',flag:'wx',mode:0o600});
console.log('Clave creada en .sites-runtime/scanner-signing-key.json. No la publiques. Si ya existe, se conserva y no se sobrescribe.');
