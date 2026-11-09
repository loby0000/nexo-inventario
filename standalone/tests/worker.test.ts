import { describe, it, expect, vi, afterEach } from "vitest";
import worker, { rpc, type Env } from "../server/worker";
import { validateAction } from "../server/contracts";
const env = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public",
  SUPABASE_SERVICE_ROLE_KEY: "secret",
  APP_ORIGIN: "https://nexo.test",
  REGISTRATION_ENABLED: "false",
  MAIL_FROM: "",
  ASSETS: { fetch: () => new Response("shell") },
} as unknown as Env;
const request = (path: string, body?: unknown, token = "valid") =>
  new Request("https://nexo.test/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
afterEach(() => vi.unstubAllGlobals());
describe("independent API authentication boundary", () => {
  it("publishes the configured reader origin without exposing server secrets", async () => {
    const result = await worker.fetch(new Request("https://nexo.test/api/config"), {...env, SCANNER_ORIGIN:"https://reader.example.com", SUPABASE_SECRET_KEY:"private-only"});
    const config = await result.json() as Record<string,unknown>;
    expect(config.scannerOrigin).toBe("https://reader.example.com");
    expect(JSON.stringify(config)).not.toContain("private-only");
  });

  it("sends modern server keys only as apikey and keeps legacy compatibility", async () => {
    const f = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ok:true})));
    vi.stubGlobal("fetch", f);
    await rpc({...env, SUPABASE_SECRET_KEY:"sb_secret_private-test"}, "u", null, "bootstrap");
    const modern = new Headers(f.mock.calls[0][1].headers);
    expect(modern.get("apikey")).toBe("sb_secret_private-test");
    expect(modern.has("Authorization")).toBe(false);
    await rpc(env, "u", null, "bootstrap");
    expect(new Headers(f.mock.calls[1][1].headers).get("Authorization")).toBe("Bearer secret");
  });
  it("does not contact the database without a server key", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(rpc({...env,SUPABASE_SERVICE_ROLE_KEY:undefined},"u",null,"bootstrap")).rejects.toThrow(/configurada/);
    expect(f).not.toHaveBeenCalled();
  });
  it("never exposes server keys in config", async () => {
    const r = await worker.fetch(request("config"), env);
    expect(await r.json()).toEqual({
      url: env.SUPABASE_URL,
      key: "public",
      registration: false,
      issuer: env.APP_ORIGIN,
      scannerOrigin:"https://nexo-escaner.loby207.workers.dev",
    });
  });
  it("rejects absent credentials before database access", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const r = await worker.fetch(
      new Request("https://nexo.test/api/bootstrap"),
      env,
    );
    expect(r.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });
  it("rejects invalid and unverified identities", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
    );
    expect((await worker.fetch(request("bootstrap"), env)).status).toBe(401);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ id: "u" })),
    );
    expect((await worker.fetch(request("bootstrap"), env)).status).toBe(403);
  });
  it("uses the verified identity instead of client user or role", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ id: "real-user", email_confirmed_at: "now" }),
      )
      .mockResolvedValueOnce(Response.json({ workspaces: [] }));
    vi.stubGlobal("fetch", f);
    const r = await worker.fetch(
      request("companies", { id: crypto.randomUUID(), name:"Mi empresa", user: "attacker", role: "admin" }),
      env,
    );
    expect(r.status).toBe(200);
    expect(JSON.parse(f.mock.calls[1][1].body).p_user).toBe("real-user");
  });
  it("rejects foreign origins", async () => {
    const r = await worker.fetch(
      new Request("https://nexo.test/api/bootstrap", {
        headers: { Origin: "https://evil.test" },
      }),
      env,
    );
    expect(r.status).toBe(403);
  });
  it("preserves barcode zeros and strips privileged fields", () => {
    const v = validateAction({
      action: "product",
      createId: crypto.randomUUID(),
      name: "Zapatos",
      sku: "p-1",
      barcode: "0001234567890",
      category: "Calzado",
      supplier: "Nike",
      unit: "unidad",
      cost: 100,
      price: 200,
      minimum: 0,
      stock: 999,
      owner: "evil",
      role: "admin",
    });
    expect(v.barcode).toBe("0001234567890");
    expect(v).not.toHaveProperty("owner");
    expect(v).not.toHaveProperty("stock");
  });
  it("never submits a queued operation as a different logged-in account", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          id: "10000000-0000-4000-8000-000000000001",
          email_confirmed_at: "now",
        }),
      );
    vi.stubGlobal("fetch", f);
    const company = "20000000-0000-4000-8000-000000000001";
    const r = await worker.fetch(
      request("sync?company=" + company, {
        id: crypto.randomUUID(),
        user: "10000000-0000-4000-8000-000000000002",
        company,
        body: {},
        dependencies: [],
        createdAt: new Date().toISOString(),
      }),
      env,
    );
    expect(r.status).toBe(403);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
