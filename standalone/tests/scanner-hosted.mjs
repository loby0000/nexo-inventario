// Existing synthetic accounts only; refuses production. No mail or customer data.
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const origin = "https://nexo-inventario-validacion.loby207.workers.dev";
const config = await (await fetch(origin + "/api/config")).json();
assert.equal(config.url, "https://ddxosemcisemyhywmfkj.supabase.co");
const { credentials } = JSON.parse(
  await readFile(".sites-runtime/nexo-validation-users.json", "utf8"),
);
const cachePath=".sites-runtime/nexo-qa-auth-sessions.json";let saved={};try{saved=JSON.parse(await readFile(cachePath,"utf8"));}catch{}
async function login(role) {
 const fixture=credentials.find(c=>c.role===role);assert(fixture,"Missing synthetic fixture");
 const cache=saved[role];const r=await fetch(config.url+"/auth/v1/token?grant_type="+(cache?"refresh_token":"password"),{method:"POST",headers:{apikey:config.key,"Content-Type":"application/json"},body:JSON.stringify(cache?{refresh_token:cache.refresh_token}:{email:fixture.email,password:fixture.password})});
 assert.equal(r.status,200,"Synthetic QA login/refresh failed");const session=await r.json();saved[role]={refresh_token:session.refresh_token};await writeFile(cachePath,JSON.stringify(saved));return session;
}

const a = await login("adminA"),
  b = await login("adminB");
const request = (token, path, body) =>
  fetch(origin + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const boot = await (await request(a.access_token, "bootstrap")).json(),
  company = boot.workspaces.find((w) => w.role === "admin")?.owner;
assert(company, "Missing QA company");
const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  ),
  publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
const response = await request(
  a.access_token,
  "scanner/grant?company=" + company,
  { device: crypto.randomUUID(), publicKey, user: b.user.id, role: "operator" },
);
assert.equal(response.status, 200, "Hosted grant failed");
const result = await response.json(),
  grant = JSON.parse(result.grant.payload);
assert.equal(grant.user, a.user.id);
assert.equal(grant.company, company);
assert.equal(grant.role, "admin");
assert.equal(grant.expiresAt - grant.issuedAt, 86400000);
assert(!result.verifyKey.d);
const verification = await crypto.subtle.importKey(
  "jwk",
  result.verifyKey,
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["verify"],
);
assert(
  await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    verification,
    Buffer.from(result.grant.signature, "base64url"),
    new TextEncoder().encode(result.grant.payload),
  ),
);
assert.equal(
  (
    await request(b.access_token, "scanner/grant?company=" + company, {
      device: crypto.randomUUID(),
      publicKey,
    })
  ).status,
  403,
  "Cross-company access must fail",
);
assert.equal(
  (
    await fetch(origin + "/api/scanner/grant?company=" + company, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
  ).status,
  401,
);
const readerOrigin="https://nexo-escaner-validacion.loby207.workers.dev";
const readerConfig=await (await fetch(readerOrigin+"/api/config")).json();assert.equal(readerConfig.url,config.url);assert.equal(readerConfig.issuer,origin);
const readerGrantResponse=await fetch(readerOrigin+"/api/scanner/grant?company="+company,{method:"POST",headers:{Origin:readerOrigin,Authorization:"Bearer "+a.access_token,"Content-Type":"application/json"},body:JSON.stringify({device:crypto.randomUUID(),publicKey})});assert.equal(readerGrantResponse.status,200);const readerGrant=await readerGrantResponse.json();assert.equal(JSON.parse(readerGrant.grant.payload).issuer,origin);assert.deepEqual(readerGrant.verifyKey,result.verifyKey);
const readerManifest=await (await fetch(readerOrigin+"/scanner.webmanifest")).json();assert.equal(readerManifest.name,"Escáner Nexo");assert.equal((await fetch(readerOrigin+"/api/inventory",{method:"POST",headers:{Origin:readerOrigin}})).status,404);
const page = await fetch(origin),
  csp = page.headers.get("content-security-policy");
assert(
  csp?.includes("http://*:47831"),
  "Missing local connector CSP allowance",
);
const manifest = await (await fetch(origin + "/manifest.webmanifest")).json();
assert(manifest.icons.some((i) => i.purpose === "maskable"));
assert(manifest.icons.some((i) => i.sizes === "192x192"));
const info = await (await fetch(origin + "/downloads/connector.json")).json(),
  local = JSON.parse(
    await readFile("standalone/public/downloads/connector.json", "utf8"),
  );
assert.equal(info.sha256, local.sha256);
assert(
  info.parts.length > 0 && info.parts.every((p) => p.bytes <= 8 * 1024 * 1024),
);
for (const part of [info.parts[0], info.parts.at(-1)]) {
  const r = await fetch(origin + "/downloads/" + part.file);
  assert.equal(r.status, 200);
  const bytes = Buffer.from(await r.arrayBuffer());
  assert.equal(bytes.length, part.bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), part.sha256);
}
const sw = await (await fetch(origin + "/sw.js")).text();
const assets = JSON.parse(sw.match(/ASSETS=(\[[^;]+\])/)[1]);
assert(!assets.some((a) => a.startsWith("/downloads/")));
assert(!assets.some((a) => a.startsWith("/api/")));
assert(assets.includes("/")&&!assets.includes("/index.html"),"Offline shell must cache canonical non-redirected HTML");
const report = {
  origin,
  at: new Date().toISOString(),
  passed: [
    "synthetic Supabase login",
    "signed 24-hour permission with live membership",
    "forged identity ignored",
    "cross-company and unauthenticated access rejected",
    "public keys only",
    "CSP permits fixed local port",
    "installable icon manifest",
    "hosted connector parts match build SHA-256",
    "offline shell excludes downloads and private API",
  ],
  physicalAndroidVerified: false,
};
await writeFile(
  "standalone/work/scanner-hosted-report.json",
  JSON.stringify(report, null, 2),
);
console.log(
  "PASS: hosted validation API, isolation, signing, PWA headers and connector download integrity. Physical Android test pending.",
);
