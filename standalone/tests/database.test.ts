import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
const pg = new PGlite();
const users = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
];
const companies = [
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
];
const uuid = () => crypto.randomUUID();
async function rpc(
  user: string,
  company: string | null,
  action: string,
  body: unknown = {},
) {
  const r = await pg.query<{ result: any }>(
    "select public.nexo_v2_gateway($1::uuid,$2::uuid,$3,$4::jsonb) result",
    [user, company, action, JSON.stringify(body)],
  );
  return r.rows[0].result;
}
const product = (id = uuid(), sku = "SKU-" + id) => ({
  action: "product",
  createId: id,
  name: "Producto de prueba",
  sku,
  barcode: "",
  category: "Pruebas",
  supplier: "Proveedor",
  unit: "unidad",
  cost: 100,
  price: 200,
  minimum: 1,
});
const document = (
  id: string,
  productId: string,
  type = "purchase",
  quantity = 10,
) => ({
  action: "document",
  id,
  type,
  reference: "",
  contact: "Proveedor",
  note: "",
  lines: [{ productId, quantity, unitPrice: 100 }],
});
const envelope = (company: string, body: any, dependencies: string[] = []) => ({
  id: body.createId ?? body.id,
  company,
  body,
  dependencies,
  createdAt: "2026-11-06T07:00:00.000Z",
});
beforeAll(async () => {
  await pg.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);",
  );
  for (let i = 0; i < users.length; i++)
    await pg.query("insert into auth.users values($1,$2,now())", [
      users[i],
      `user${i}@nexo.test`,
    ]);
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pg.exec(await readFile("supabase/migrations/" + file, "utf8"));
  await rpc(users[0], null, "createCompany", {
    id: companies[0],
    name: "Empresa A",
  });
  await rpc(users[1], null, "createCompany", {
    id: companies[1],
    name: "Empresa B",
  });
});
afterAll(() => pg.close());
describe("real PostgreSQL authorization and inventory transactions", () => {
  it("isolates companies and does not create a personal company for an employee", async () => {
    await expect(rpc(users[2], companies[0], "inventory")).rejects.toThrow(
      /acceso/,
    );
    const b = await rpc(users[2], null, "bootstrap");
    expect(b.workspaces).toHaveLength(0);
  });
  it("accepts only matching verified invite, supports expiry and revocation", async () => {
    const inv = await rpc(users[0], companies[0], "mutate", {
      action: "member",
      email: "user2@nexo.test",
    });
    await expect(
      rpc(users[1], null, "acceptInvitation", { id: inv.id }),
    ).rejects.toThrow(/correo/);
    await rpc(users[2], null, "acceptInvitation", { id: inv.id });
    const b = await rpc(users[2], null, "bootstrap");
    expect(b.workspaces).toHaveLength(1);
    expect(b.workspaces[0].role).toBe("operator");
    await expect(
      rpc(users[2], companies[0], "mutate", product()),
    ).rejects.toThrow(/administrador/);
    const inv2 = await rpc(users[1], companies[1], "mutate", {
      action: "member",
      email: "user2@nexo.test",
    });
    await pg.query(
      "update nexo.company_invitations set expires_at=now()-interval '1 minute' where id=$1",
      [inv2.id],
    );
    await expect(
      rpc(users[2], null, "acceptInvitation", { id: inv2.id }),
    ).rejects.toThrow(/caduc/);
  });
  it("rejects unverified accounts", async () => {
    const u = uuid();
    await pg.query("insert into auth.users(id,email)values($1,$2)", [
      u,
      "unverified@nexo.test",
    ]);
    await expect(rpc(u, null, "bootstrap")).rejects.toThrow(/verificado/);
  });
  it("keeps exactly one product and document after ten retries", async () => {
    const p = product(),
      pOp = envelope(companies[0], p);
    for (let i = 0; i < 10; i++)
      expect((await rpc(users[0], companies[0], "sync", pOp)).state).toBe(
        "synced",
      );
    const doc = document(uuid(), p.createId),
      dOp = envelope(companies[0], doc, [p.createId]);
    for (let i = 0; i < 10; i++)
      expect((await rpc(users[0], companies[0], "sync", dOp)).state).toBe(
        "synced",
      );
    const data = await rpc(users[0], companies[0], "inventory");
    expect(data.products.find((x: any) => x.id === p.createId).stock).toBe(10);
    expect(data.documents.filter((x: any) => x.id === doc.id)).toHaveLength(1);
    await expect(
      rpc(users[0], companies[0], "sync", {
        ...dOp,
        body: { ...doc, note: "changed" },
      }),
    ).rejects.toThrow(/otra operación/);
  });
  it("rolls back all lines on insufficient stock and records a resolvable conflict", async () => {
    const p = product();
    await rpc(users[0], companies[0], "sync", envelope(companies[0], p));
    await rpc(
      users[0],
      companies[0],
      "mutate",
      document(uuid(), p.createId, "purchase", 2),
    );
    const sale = document(uuid(), p.createId, "sale", 3),
      op = envelope(companies[0], sale);
    expect((await rpc(users[2], companies[0], "sync", op)).state).toBe(
      "conflict",
    );
    let data = await rpc(users[0], companies[0], "inventory");
    expect(data.products.find((x: any) => x.id === p.createId).stock).toBe(2);
    expect(data.documents.some((x: any) => x.id === sale.id)).toBe(false);
    await expect(rpc(users[2], companies[0], "conflicts")).rejects.toThrow(
      /administrador/,
    );
    await rpc(
      users[0],
      companies[0],
      "mutate",
      document(uuid(), p.createId, "purchase", 2),
    );
    expect(
      (
        await rpc(users[0], companies[0], "resolve", {
          id: sale.id,
          decision: "retry",
          reason: "Mercancía recibida",
        })
      ).state,
    ).toBe("synced");
    expect((await rpc(users[2], companies[0], "sync", op)).state).toBe(
      "synced",
    );
    data = await rpc(users[0], companies[0], "inventory");
    expect(data.products.find((x: any) => x.id === p.createId).stock).toBe(1);
  });
  it("requires dependencies and preserves barcode zeros and tenant uniqueness", async () => {
    const p = product();
    p.barcode = "0001234567890";
    expect(
      (
        await rpc(
          users[0],
          companies[0],
          "sync",
          envelope(companies[0], p, [uuid()]),
        )
      ).state,
    ).toBe("pending");
    const a = product();
    a.barcode = "0001234567890";
    await rpc(users[1], companies[1], "mutate", a);
    const b = product();
    b.barcode = a.barcode;
    await expect(rpc(users[1], companies[1], "mutate", b)).rejects.toThrow();
    const data = await rpc(users[1], companies[1], "inventory");
    expect(data.products[0].barcode).toBe("0001234567890");
  });
  it("works under the actual service_role without password-column access", async () => {
    await pg.exec(
      "grant usage on schema auth to service_role;set role service_role",
    );
    const data = await rpc(users[0], companies[0], "inventory");
    expect(data.workspace.owner).toBe(companies[0]);
    await pg.exec("reset role");
  });
  it("preserves IDs, history and a recovery copy during one-time owner transfer", async () => {
    const legacy = "legacy-owner-qa",
      p = product();
    const legacyCall = async (body: any) => {
      const r = await pg.query<any>(
        "select public.nexo_gateway($1,$2,$2,$1,'POST',$3::jsonb,$4::uuid) result",
        [legacy, "owner@nexo.test", JSON.stringify(body), uuid()],
      );
      return r.rows[0].result;
    };
    await legacyCall(p);
    const doc = document(uuid(), p.createId, "purchase", 7);
    await legacyCall(doc);
    const transfer = await legacyCall({ action: "createTransfer" });
    await expect(
      rpc(users[0], null, "claimTransfer", {
        token: "not-a-valid-token-000000000000000000",
      }),
    ).rejects.toThrow(/código/);
    const result = await rpc(users[0], null, "claimTransfer", {
      token: transfer.token,
    });
    const data = await rpc(users[0], result.id, "inventory");
    expect(data.products[0].id).toBe(p.createId);
    expect(data.products[0].stock).toBe(7);
    expect(data.documents[0].id).toBe(doc.id);
    const copy = await pg.query<any>(
      "select snapshot from nexo.transfer_backups where company_id=$1",
      [result.id],
    );
    expect(copy.rows[0].snapshot.products[0].owner).toBe(legacy);
    await expect(legacyCall(product())).rejects.toThrow(/traslad/);
    await expect(
      rpc(users[1], null, "claimTransfer", { token: transfer.token }),
    ).rejects.toThrow(/código/);
  });
  it("serializes two attempted sales of the last unit without negative stock", async () => {
    const p = product();
    await rpc(users[0], companies[0], "mutate", p);
    await rpc(
      users[0],
      companies[0],
      "mutate",
      document(uuid(), p.createId, "purchase", 1),
    );
    const results = await Promise.all([
      rpc(
        users[0],
        companies[0],
        "sync",
        envelope(companies[0], document(uuid(), p.createId, "sale", 1)),
      ),
      rpc(
        users[0],
        companies[0],
        "sync",
        envelope(companies[0], document(uuid(), p.createId, "sale", 1)),
      ),
    ]);
    expect(results.map((r) => r.state).sort()).toEqual(["conflict", "synced"]);
    const data = await rpc(users[0], companies[0], "inventory");
    expect(data.products.find((x: any) => x.id === p.createId).stock).toBe(0);
  });
  it("cancels conflicts with an audit reason and never revives cancelled retries", async () => {
    const p = product();
    await rpc(users[0], companies[0], "mutate", p);
    const op = envelope(companies[0], document(uuid(), p.createId, "sale", 1));
    expect((await rpc(users[0], companies[0], "sync", op)).state).toBe(
      "conflict",
    );
    expect(
      (
        await rpc(users[0], companies[0], "resolve", {
          id: op.id,
          decision: "cancel",
          reason: "Venta anulada por el administrador",
        })
      ).state,
    ).toBe("cancelled");
    expect((await rpc(users[0], companies[0], "sync", op)).state).toBe(
      "cancelled",
    );
    const record = await pg.query<any>(
      "select resolved_by,reason from nexo.sync_operations where id=$1",
      [op.id],
    );
    expect(record.rows[0].resolved_by).toBe(users[0]);
    expect(record.rows[0].reason).toMatch(/Venta anulada/);
  });
  it("revokes employee access and denies direct browser roles", async () => {
    await rpc(users[0], companies[0], "mutate", {
      action: "removeMember",
      id: users[2],
    });
    await expect(rpc(users[2], companies[0], "inventory")).rejects.toThrow(
      /acceso/,
    );
    await pg.exec("set role authenticated");
    await expect(pg.query("select * from nexo.products")).rejects.toThrow(
      /permission/,
    );
    await expect(
      pg.query(
        "select public.nexo_v2_gateway($1::uuid,$2::uuid,$3,$4::jsonb)",
        [users[0], companies[0], "inventory", "{}"],
      ),
    ).rejects.toThrow(/permission/);
    await pg.exec("reset role");
  });
});
