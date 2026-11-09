import { build } from "vite";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
const root = import.meta.dirname;
await build({ configFile: resolve(root, process.argv.includes("--scanner")?"vite.scanner.config.ts":"vite.config.ts") });
async function files(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(p)));
    else out.push(p);
  }
  return out;
}
const dist = resolve(root, process.argv.includes("--scanner")?"scanner-dist":"dist");
if(process.argv.includes("--scanner")){const {rename,rm}=await import("node:fs/promises");await rename(resolve(dist,"scanner.html"),resolve(dist,"index.html"));await rm(resolve(dist,"downloads"),{recursive:true,force:true});}
const
  paths = await files(dist),
  assets = paths
    .filter((p) => !["_headers", "_redirects"].includes(relative(dist, p)))
    .filter((p)=>!relative(dist,p).replaceAll('\\','/').startsWith('downloads/'))
    .map((p) => relative(dist,p)==="index.html"?"/":"/" + relative(dist, p).replaceAll("\\", "/"));
const hash = createHash("sha256");
hash.update("nexo-shell-protocol-2-canonical-root");
for (const p of paths) hash.update(await readFile(p));
const version = hash.digest("hex").slice(0, 16);
const sw = `const CACHE='nexo-shell-${version}',ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('nexo-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type!=='NEXO_CHECK_SHELL'||!event.ports[0])return;event.waitUntil((async()=>{try{const cache=await caches.open(CACHE);const found=await Promise.all(ASSETS.map(path=>cache.match(path)));event.ports[0].postMessage({type:'NEXO_SHELL_READY',protocol:2,ready:found.every(r=>r?.ok&&!r.redirected),asset:ASSETS.includes(event.data.requiredAsset)?event.data.requiredAsset:null});}catch{event.ports[0].postMessage({type:'NEXO_SHELL_READY',protocol:2,ready:false});}})());});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=='GET'||url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/'))return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(c=>c.match('/'))));return;}
 if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(async c=>(await c.match(url.pathname))||fetch(event.request)));});`;
await writeFile(resolve(dist, "sw.js"), sw);
console.log(
  "Offline shell generated:",
  version,
  assets.length,
  "public assets; API and authentication excluded.",
);
