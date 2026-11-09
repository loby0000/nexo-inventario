// Local-only QA harness: fake authentication + real embedded PostgreSQL. Never deployed.
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { build } from "esbuild";
const root = resolve(import.meta.dirname, "../.."),
  port = Number(process.env.NEXO_QA_PORT || 5191),
  origin = `http://127.0.0.1:${port}`;
await mkdir(resolve(root, "work"), { recursive: true });
await build({
  entryPoints: [resolve(root, "standalone/server/worker.ts")],
  bundle: true,
  platform: "neutral",
  format: "esm",
  outfile: resolve(root, "work/qa-worker.mjs"),
});
const { default: worker } = await import(
  pathToFileURL(resolve(root, "work/qa-worker.mjs")).href
);
const pg = new PGlite();
await pg.exec(
  "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);",
);
for (const f of (await readdir(resolve(root, "supabase/migrations")))
  .filter((x) => x.endsWith(".sql"))
  .sort())
  await pg.exec(
    await readFile(resolve(root, "supabase/migrations", f), "utf8"),
  );
const uid = "10000000-0000-4000-8000-000000000001",
  company = "20000000-0000-4000-8000-000000000001";
await pg.query("insert into auth.users values($1,$2,now())", [
  uid,
  "admin@nexo.test",
]);
const call = async (action, body = {}, cid = company) => {
  const r = await pg.query(
    "select public.nexo_v2_gateway($1::uuid,$2::uuid,$3,$4::jsonb) result",
    [uid, cid, action, JSON.stringify(body)],
  );
  return r.rows[0].result;
};
await call(
  "createCompany",
  { id: company, name: "Nexo · Empresa de pruebas" },
  null,
);
const p = crypto.randomUUID();
await call("mutate", {
  action: "product",
  createId: p,
  name: "Tenis de prueba",
  sku: "TEN-001",
  barcode: "0001234567890",
  category: "Calzado",
  supplier: "Nike",
  unit: "unidad",
  cost: 1000000,
  price: 2300000,
  minimum: 2,
});
await call("mutate", {
  action: "document",
  id: crypto.randomUUID(),
  type: "purchase",
  reference: "QA",
  contact: "Nike",
  note: "",
  lines: [{ productId: p, quantity: 20, unitPrice: 1000000 }],
});
// Synthetic team rows exercise settings without sending any email.
const teamUser='10000000-0000-4000-8000-000000000002';
await pg.query('insert into auth.users values($1,$2,now())',[teamUser,'ana@nexo.test']);
await pg.query("insert into nexo.company_members values($1,$2,'operator')",[company,teamUser]);
await call('mutate',{action:'member',email:'maria@nexo.test'});
const user = {
  id: uid,
  email: "admin@nexo.test",
  email_confirmed_at: new Date().toISOString(),
  role: "authenticated",
  aud: "authenticated",
  app_metadata: { provider: "email" },
  user_metadata: {},
};
const encode = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const token = () =>
  encode({ alg: "none", typ: "JWT" }) +
  "." +
  encode({
    sub: uid,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    aud: "authenticated",
    role: "authenticated",
  }) +
  ".qa";
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};
const qaHtml = bytes => process.env.NEXO_QA_CONTROLS === '0' ? bytes : Buffer.from(bytes).toString('utf8').replace('</head>', '<script src="/qa/faults.js"></script></head>');
const assets = {
  async fetch(req) {
    const url = new URL(req.url),
      file = resolve(
        root,
        "standalone/dist",
        "." + decodeURIComponent(url.pathname),
      );
    let path = file;
    if (!file.startsWith(resolve(root, "standalone/dist")))
      return new Response("Denied", { status: 403 });
    try {
      const bytes = await readFile(path);
      return new Response(extname(path)==='.html' ? qaHtml(bytes) : bytes, {
        headers: {
          "Content-Type": mime[extname(path)] ?? "application/octet-stream",
        },
      });
    } catch {
      path = resolve(root, "standalone/dist/index.html");
      return new Response(qaHtml(await readFile(path)), {
        headers: { "Content-Type": "text/html" },
      });
    }
  },
};
const env = {
  SCANNER_SIGNING_KEY: JSON.stringify(await crypto.subtle.exportKey('jwk',(await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])).privateKey)),
  ASSETS: assets,
  SUPABASE_URL: origin,
  SUPABASE_PUBLISHABLE_KEY: "qa-public",
  SUPABASE_SERVICE_ROLE_KEY: "qa-service",
  APP_ORIGIN: origin,
  REGISTRATION_ENABLED: "true",
  MAIL_FROM: "",
};
let apiAvailable = true, sessionValid = true;
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    let result;
    if (url.pathname === '/qa/faults.js' && req.method === 'GET') {
      result = new Response(await readFile(resolve(root,'standalone/tests/qa-faults.js')), {headers:{'Content-Type':'application/javascript','Cache-Control':'no-store'}});
    } else if (url.pathname === '/qa/session' && req.method === 'POST') {
      sessionValid = JSON.parse(text).valid === true;
      result = Response.json({valid:sessionValid});
    } else if (url.pathname === "/qa/availability" && req.method === "POST") {
      apiAvailable = JSON.parse(text).online;
      result = Response.json({ online: apiAvailable });
    } else if (url.pathname.startsWith("/auth/v1/")) {
      if (url.pathname === "/auth/v1/token") {
        const b = JSON.parse(text);
        const passwordLogin=b.email === 'admin@nexo.test' && b.password === 'Prueba-nexo-2026';
        if(passwordLogin) sessionValid=true;
        result =
          passwordLogin || (sessionValid && b.refresh_token === 'qa-refresh')
            ? Response.json({
                access_token: token(),
                refresh_token: "qa-refresh",
                token_type: "bearer",
                expires_in: 3600,
                user,
              })
            : Response.json({ msg: "Invalid credentials",code:'refresh_token_not_found' }, { status: 400 });
      } else if (url.pathname === "/auth/v1/user")
        result = req.headers.authorization && sessionValid
          ? Response.json(user)
          : new Response("{}", { status: 401 });
      else result = Response.json({});
    } else if (url.pathname === "/rest/v1/rpc/nexo_v2_gateway") {
      try {
        const b = JSON.parse(text);
        const r = await pg.query(
          "select public.nexo_v2_gateway($1::uuid,$2::uuid,$3,$4::jsonb) result",
          [b.p_user, b.p_company, b.p_action, JSON.stringify(b.p_body)],
        );
        result = Response.json(r.rows[0].result);
      } catch (e) {
        result = Response.json(
          { message: e.message, code: e.code },
          { status: 400 },
        );
      }
    } else if (url.pathname.startsWith("/api/") && !apiAvailable)
      result = Response.json(
        { error: "Corte de conexión simulado (solo QA)" },
        { status: 503 },
      );
    else
      result = await worker.fetch(
        new Request(url, {
          method: req.method,
          headers: req.headers,
          ...(text ? { body: text } : {}),
        }),
        env,
      );
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(Buffer.from(await result.arrayBuffer()));
  } catch (e) {
    console.error(e.message);
    res.writeHead(500);
    res.end("QA error");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(
    `QA ONLY: ${origin} · admin@nexo.test / Prueba-nexo-2026 · no production data`,
  ),
);
