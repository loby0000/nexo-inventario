import crypto from "node:crypto";
const input = await new Promise((resolve) => {
  let value = "";
  process.stdin.setRawMode?.(true);
  process.stdin.setEncoding("utf8");
  process.stderr.write("Ready for signing key on stdin (hidden).\n");
  const onData = (chunk) => {
    value += chunk;
    if (/[\r\n]/.test(value)) {
      process.stdin.off("data", onData);
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      resolve(JSON.parse(value));
    }
  };
  process.stdin.on("data", onData);
});
const key = crypto.createPrivateKey({
  key: Buffer.from(input.privateKey, "base64"),
  type: "pkcs8",
  format: "der",
});
const url = "https://awihnwliaqehmzntutmb.supabase.co/functions/v1/nexo-api";
const owner = "qa-" + crypto.randomUUID(),
  operator = "qa-" + crypto.randomUUID(),
  other = "qa-" + crypto.randomUUID(),
  legacy = "qa-" + crypto.randomUUID(),
  badLegacy = "qa-" + crypto.randomUUID();
const calls = [];
let passed = 0;
function assert(ok, message) {
  if (!ok) throw Error(message);
  passed++;
  console.log("PASS " + message);
}
async function call(body = {}, options = {}) {
  const user = options.user ?? owner;
  const envelope = {
    user: { id: user, email: user + "@example.com", name: "Pruebas Nexo" },
    workspace: options.workspace ?? user,
    method: options.method ?? "POST",
    body,
    nonce: options.nonce ?? crypto.randomUUID(),
    timestamp: options.timestamp ?? Date.now(),
  };
  const text = JSON.stringify(envelope);
  const signature = crypto
    .sign(null, Buffer.from(text), key)
    .toString("base64");
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Nexo-Signature": signature,
    },
    body: text,
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json();
  calls.push({ status: r.status, action: body.action, error: data.error });
  return { status: r.status, data };
}
const product = (name = "Prueba") => ({
  action: "product",
  name,
  sku: "",
  barcode: "",
  category: "Calidad",
  supplier: "Pruebas",
  unit: "unidad",
  cost: 10000,
  price: 20000,
  minimum: 2,
});
const document = (type, lines, id = crypto.randomUUID()) => ({
  action: "document",
  id,
  type,
  reference: "Prueba " + id.slice(0, 8),
  contact: "Pruebas",
  note: "Verificación automática",
  lines: lines.map(([productId, quantity, unitPrice]) => ({
    productId,
    quantity,
    unitPrice,
  })),
});
try {
  let r = await fetch(url, { method: "POST", body: "{}" });
  assert(r.status === 401, "anonymous denied");
  r = await fetch(url, {
    method: "POST",
    headers: { "X-Nexo-Signature": crypto.randomBytes(64).toString("base64") },
    body: "{}",
  });
  assert(r.status === 401, "invalid signature denied");
  r = await call({}, { method: "GET", timestamp: Date.now() - 120000 });
  assert(r.status === 401, "expired signature denied");
  r = await call({}, { method: "GET", workspace: other });
  assert(r.status === 403, "foreign workspace denied");
  const legacyProduct = {
    id: crypto.randomUUID(),
    name: "Producto legado",
    sku: "LEGACY-ONE",
    category: "Legado",
    supplier: "Proveedor",
    unit: "unidad",
    cost: 10000,
    price: 20000,
    minimum: 2,
    stock: 3,
    archived: 0,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-02T00:00:00Z",
  };
  const history = [
    {
      id: crypto.randomUUID(),
      product_id: legacyProduct.id,
      type: "in",
      quantity: 5,
      note: "Entrada original",
      actor: "legado@example.com",
      created_at: "2026-11-01T00:00:00Z",
    },
    {
      id: crypto.randomUUID(),
      product_id: legacyProduct.id,
      type: "out",
      quantity: 2,
      note: "Salida original",
      actor: "legado@example.com",
      created_at: "2026-11-02T00:00:00Z",
    },
  ];
  const snapshot = {
    products: [legacyProduct],
    movements: history,
    members: [],
    workspace: { name: "Negocio legado", description: "Prueba de migración" },
  };
  r = await call(snapshot, { user: legacy, method: "BOOTSTRAP" });
  assert(r.status === 200, "legacy migration");
  r = await call({}, { user: legacy, method: "GET" });
  assert(
    r.data.products[0].id === legacyProduct.id &&
      r.data.products[0].stock === 3 &&
      r.data.movements.length === 2 &&
      r.data.workspace.name === "Negocio legado",
    "migration preserves IDs, stock, history and business",
  );
  r = await call(snapshot, { user: legacy, method: "BOOTSTRAP" });
  assert(
    r.status === 200 && r.data.migrated === false,
    "migration is one-time",
  );
  const invalid = {
    ...snapshot,
    products: [{ ...legacyProduct, id: crypto.randomUUID(), stock: 4 }],
    movements: [],
  };
  r = await call(invalid, { user: badLegacy, method: "BOOTSTRAP" });
  assert(r.status === 409, "inconsistent legacy snapshot rejected");
  r = await call({}, { user: badLegacy, method: "GET" });
  assert(
    r.data.products.length === 0,
    "failed migration rolls back completely",
  );
  r = await call(
    { products: [], movements: [], members: [], workspace: null },
    { method: "BOOTSTRAP" },
  );
  assert(r.status === 200, "empty bootstrap");
  const create = {
    ...product("Creación repetida"),
    createId: crypto.randomUUID(),
  };
  r = await call(create);
  assert(
    r.status === 200 && r.data.id === create.createId,
    "product request ID",
  );
  r = await call(create);
  assert(
    r.status === 200 && r.data.id === create.createId,
    "product retry is idempotent",
  );
  r = await call({ ...create, name: "Distinto" });
  assert(r.status === 409, "product request cannot change content");
  const p = await call(product("Producto A")),
    q = await call(product("Producto B"));
  assert(p.status === 200 && q.status === 200, "create products");
  const a = p.data.id,
    b = q.data.id;
  r = await call({}, { method: "GET" });
  assert(
    r.data.products.every((p) => p.sku.startsWith("NX-")),
    "server-generated SKUs",
  );
  const purchase = document("purchase", [
    [a, 5, 10000],
    [b, 1, 10000],
  ]);
  r = await call(purchase);
  assert(r.status === 200, "purchase atomic entry");
  r = await call(purchase);
  assert(r.status === 200, "purchase idempotency");
  r = await call({ ...purchase, note: "Cambió" });
  assert(r.status === 409, "id reuse rejected");
  const invalidSale = document("sale", [
    [a, 2, 20000],
    [b, 2, 20000],
  ]);
  r = await call(invalidSale);
  assert(r.status === 409, "oversell rejected");
  r = await call({}, { method: "GET" });
  assert(
    r.data.products.find((p) => p.id === a).stock === 5 &&
      r.data.products.find((p) => p.id === b).stock === 1 &&
      !r.data.documents.some((d) => d.id === invalidSale.id),
    "failed sale fully rolled back",
  );
  const sales = await Promise.all([
    call(document("sale", [[b, 1, 20000]])),
    call(document("sale", [[b, 1, 20000]])),
  ]);
  assert(
    sales
      .map((s) => s.status)
      .sort()
      .join(",") === "200,409",
    "concurrent last-unit sales safe",
  );
  const imp = {
    action: "import",
    id: crypto.randomUUID(),
    rows: [{ ...product("Importado"), sku: "IMPORT-TEST" }],
  };
  delete imp.rows[0].action;
  r = await call(imp);
  assert(r.status === 200, "import");
  r = await call(imp);
  assert(r.status === 200, "import idempotency");
  r = await call({
    ...imp,
    id: crypto.randomUUID(),
    rows: [{ ...imp.rows[0], sku: "SHOULD-ROLLBACK" }, imp.rows[0]],
  });
  assert(r.status === 409, "duplicate import rejected");
  r = await call({}, { method: "GET" });
  assert(
    !r.data.products.some((p) => p.sku === "SHOULD-ROLLBACK"),
    "import rolls back all rows",
  );
  r = await call({ action: "member", email: operator + "@example.com" });
  assert(r.status === 200, "invitation created");
  r = await call({}, { method: "GET", user: operator, workspace: owner });
  assert(r.status === 403, "pending invitation has no access");
  r = await call({}, { method: "GET", user: operator });
  const invitation = r.data.invitations[0];
  assert(!!invitation, "invitation visible to recipient");
  r = await call(
    { action: "acceptInvitation", id: invitation.id },
    { user: other },
  );
  assert(r.status === 409, "other user cannot accept invitation");
  r = await call(
    { action: "acceptInvitation", id: invitation.id },
    { user: operator },
  );
  assert(r.status === 200, "recipient accepts invitation");
  r = await call(product(), { user: operator, workspace: owner });
  assert(r.status === 403, "operator cannot modify catalog");
  r = await call(document("purchase", [[a, 1, 10000]]), {
    user: operator,
    workspace: owner,
  });
  assert(r.status === 403, "operator cannot receive purchases");
  r = await call(document("sale", [[a, 1, 20000]]), {
    user: operator,
    workspace: owner,
  });
  assert(r.status === 200, "operator can register sale");
  r = await call({}, { method: "GET" });
  const member = r.data.members[0];
  r = await call({ action: "removeMember", id: member.id });
  assert(r.status === 200, "access revoked");
  r = await call({}, { method: "GET", user: operator, workspace: owner });
  assert(r.status === 403, "revocation takes effect immediately");
  const nonce = crypto.randomUUID();
  await call({}, { method: "GET", nonce });
  r = await call({}, { method: "GET", nonce });
  assert(r.status === 409, "transport replay rejected");
  await (
    await import("node:fs/promises")
  ).writeFile(
    "work/supabase-test-owners.json",
    JSON.stringify([owner, operator, other, legacy, badLegacy]),
  );
  console.log(
    JSON.stringify({
      passed,
      testOwners: [owner, operator, other, legacy, badLegacy],
    }),
  );
} catch (e) {
  console.log(
    JSON.stringify({
      failed: e.message,
      calls,
      testOwners: [owner, operator, other, legacy, badLegacy],
    }),
  );
  process.exitCode = 1;
}
