import {pairingMask} from "../client/scanner-qr";
import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect, vi, afterEach } from "vitest";
import { ScanGate } from "../client/scan-gate";
import {
  scannerDB,
  loadDraft,
  addDraftScan,
  updateDraft,
  freezeDraft,
  finishDraft,
  loadPhoneScan,
  savePhoneScan,
  clearPhoneScan,
} from "../client/scanner-store";
import { scannerCredential } from "../client/scanner-credential";
import { db } from "../client/offline";
import { routeScannerRead } from "../client/scanner-routing";
import {
  seal,
  unseal,
  randomSecret,
  pairText,
  pairingURL,
  messageSchema,
  parsePair,
  verifyGrant,
  verifyText,
  proofText,
  signText,
  localEndpoint,
  type DeviceGrant,
} from "../shared/scanner-protocol";
import { issueScannerGrant } from "../server/scanner-grant";
import worker, { type Env } from "../server/worker";
import type { Product } from "../ui/inventory";
import QRCode from "qrcode";
import {
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  MultiFormatReader,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";
const user = "10000000-0000-4000-8000-000000000001",
  company = "20000000-0000-4000-8000-000000000001",
  issuer = "https://nexo.test";
const product: Product = {
  id: "p1",
  barcode: "000123",
  sku: "NX-1",
  name: "Zapatos",
  stock: 3,
  price: 200,
  cost: 100,
  archived: 0,
  minimum: 0,
  unit: "unidad",
  supplier: "Proveedor",
  category: "",
};
beforeEach(async () => {
  const d = await scannerDB();
  await d.clear("drafts");
  await d.clear("credentials");
});
afterEach(() => vi.unstubAllGlobals());
describe("continuous camera gate", () => {
  it("counts a held code once and requires an empty interval before any next code", () => {
    const g = new ScanGate();
    expect(g.frame("000123", 100)).toBe(true);
    g.done();
    expect(g.frame("000123", 300)).toBe(false);
    expect(g.frame("DIFFERENT", 400)).toBe(false);
    g.frame(null, 500);
    expect(g.frame("000123", 900)).toBe(false);
    g.frame(null, 1000);
    g.frame(null, 1500);
    expect(g.frame("000123", 1850)).toBe(true);
    g.frame(null, 2000);
    expect(g.frame("other", 3000)).toBe(false); // awaiting durable ACK
  });
});
describe("durable scan receipts and drafts", () => {
  it("never adds to a closed or different draft, but returns a durable delayed receipt", async () => {
    const sale = await loadDraft(user, company, "sale"),
      purchase = await loadDraft(user, company, "purchase");
    const id = crypto.randomUUID();
    await addDraftScan(sale.key, id, "000123", [product]);
    const late = await routeScannerRead(
      user,
      company,
      undefined,
      id,
      "000123",
      sale.id,
    );
    expect(late.ok).toBe(true);
    expect(late.message).toContain("anterior");
    const read = vi
        .fn()
        .mockResolvedValue({ id, ok: true, message: "current" }),
      target = {
        draft: purchase.id,
        mode: "purchase" as const,
        companyName: "QA",
        read,
      };
    const rejected = await routeScannerRead(
      user,
      company,
      target,
      crypto.randomUUID(),
      "000123",
      sale.id,
    );
    expect(rejected.ok).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect((await loadDraft(user, company, "sale")).lines[0].quantity).toBe(
      "1",
    );
    expect((await loadDraft(user, company, "purchase")).lines).toEqual([]);
    expect(
      (await routeScannerRead(user, company, target, id, "000123", purchase.id))
        .ok,
    ).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
    expect(
      (
        await routeScannerRead(
          "other",
          company,
          undefined,
          id,
          "000123",
          sale.id,
        )
      ).ok,
    ).toBe(false);
  });
  it("persists a phone retry independently of tab/session storage and protects its identity", async () => {
    const key = user + ":phone-pending",
      event = {
        id: crypto.randomUUID(),
        code: "000123",
        draft: crypto.randomUUID(),
      };
    await clearPhoneScan(key);
    await savePhoneScan(key, event);
    expect(await loadPhoneScan(key)).toMatchObject(event);
    await expect(savePhoneScan(key,{...event,code:"different"})).rejects.toThrow(/contenido/);
    await expect(
      savePhoneScan(key, { ...event, id: crypto.randomUUID() }),
    ).rejects.toThrow(/sin confirmar/);
    await clearPhoneScan(key, "another-id");
    expect(await loadPhoneScan(key)).toBeDefined();
    await clearPhoneScan(key, event.id);
    expect(await loadPhoneScan(key)).toBeUndefined();
  });
  it("retries ten times across concurrent tabs and reload, adding exactly once", async () => {
    const d = await loadDraft(user, company, "sale"),
      id = crypto.randomUUID();
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () =>
        addDraftScan(d.key, id, "000123", [product]),
      ),
    );
    expect(attempts.every((a) => a.ack.ok && a.ack.quantity === 1)).toBe(true);
    const restored = await loadDraft(user, company, "sale");
    expect(restored.id).toBe(d.id);
    expect(restored.lines[0].quantity).toBe("1");
    expect(
      (await addDraftScan(d.key, id, "000123", [product])).draft.lines[0]
        .quantity,
    ).toBe("1");
    expect(product.stock).toBe(3);
  });
  it("rejects unknown, archived and over-stock codes without changing the draft inventory", async () => {
    const d = await loadDraft(user, company, "sale");
    expect(
      (await addDraftScan(d.key, crypto.randomUUID(), "123", [product])).ack.ok,
    ).toBe(false);
    expect(
      (
        await addDraftScan(d.key, crypto.randomUUID(), "000123", [
          { ...product, archived: 1 },
        ])
      ).ack.ok,
    ).toBe(false);
    for (let i = 0; i < 3; i++)
      expect(
        (await addDraftScan(d.key, crypto.randomUUID(), "000123", [product]))
          .ack.ok,
      ).toBe(true);
    expect(
      (await addDraftScan(d.key, crypto.randomUUID(), "000123", [product])).ack
        .ok,
    ).toBe(false);
    expect((await loadDraft(user, company, "sale")).lines[0].quantity).toBe(
      "3",
    );
  });
  it("isolates users, companies and operation modes and persists extra fields", async () => {
    const d = await loadDraft(user, company, "purchase");
    await updateDraft(d.key, (d) => ({
      ...d,
      contact: "Nike",
      note: "Recibido",
      reference: "F-1",
    }));
    await addDraftScan(d.key, crypto.randomUUID(), "000123", [
      { ...product, stock: 0 },
    ]);
    expect((await loadDraft(user, company, "purchase")).reference).toBe("F-1");
    for (const [u, c, m] of [
      ["other", company, "purchase"],
      [user, "other", "purchase"],
      [user, company, "sale"],
    ] as const)
      expect((await loadDraft(u, c, m)).lines).toEqual([]);
  });
  it("freezes a submitted draft and refuses late scans; only its own document can remove it", async () => {
    const d = await loadDraft(user, company, "sale");
    await freezeDraft(d.key);
    await expect(
      addDraftScan(d.key, crypto.randomUUID(), "000123", [product]),
    ).rejects.toThrow(/cerrada/);
    await finishDraft(d.key, "other");
    expect((await loadDraft(user, company, "sale")).id).toBe(d.id);
    await finishDraft(d.key, d.id);
    expect((await loadDraft(user, company, "sale")).id).not.toBe(d.id);
  });
  it("never reports success when the local write fails", async () => {
    const d = await loadDraft(user, company, "sale");
    const fail = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(() => {
        throw new DOMException("Full", "QuotaExceededError");
      });
    await expect(
      addDraftScan(d.key, crypto.randomUUID(), "000123", [product]),
    ).rejects.toThrow("Full");
    fail.mockRestore();
    expect((await loadDraft(user, company, "sale")).lines).toEqual([]);
  });
});
describe("encrypted local protocol", () => {
  it("allows a cached offline device only with a valid prepared snapshot and never masks revocation", async () => {
    vi.stubGlobal("location", { origin: issuer });
    const signing = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
      ),
      privateKey = JSON.stringify(
        await crypto.subtle.exportKey("jwk", signing.privateKey),
      ),
      verifyKey = await crypto.subtle.exportKey("jwk", signing.publicKey);
    const c = await scannerCredential(user, company, async (_path, body) => {
      const input = body as {
        device: string;
        publicKey: DeviceGrant["publicKey"];
      };
      const now = Date.now();
      return {
        grant: await issueScannerGrant(privateKey, {
          v: 1,
          issuer,
          user,
          company,
          device: input.device,
          publicKey: input.publicKey,
          role: "admin",
          issuedAt: now,
          expiresAt: now + 86400000,
        }),
        verifyKey,
      };
    });
    await expect(
      crypto.subtle.exportKey("jwk", c.credential.privateKey),
    ).rejects.toThrow();
    const offline = async () => {
      throw Object.assign(Error("offline"), { status: 0 });
    };
    await expect(scannerCredential(user, company, offline)).rejects.toThrow(
      /Prepara/,
    );
    const local = await db(),
      key = user + ":" + company;
    await local.put("snapshots", {
      key,
      user,
      company,
      enabled: true,
      validatedAt: Date.now(),
      data: {
        workspace: { owner: company, name: "QA", description: "" },
        workspaces: [],
        invitations: [],
        products: [product],
        documents: [],
        movements: [],
        members: [],
        user: { role: "admin", name: "QA", email: "qa@nexo.test" },
      },
    });
    expect((await scannerCredential(user, company, offline)).grant.device).toBe(
      c.grant.device,
    );
    await expect(
      scannerCredential(user, company, async () => {
        throw Object.assign(Error("revoked"), { status: 403 });
      }),
    ).rejects.toThrow("revoked");
    const snapshot = await local.get("snapshots", key);
    await local.put("snapshots", { ...snapshot!, locked: true });
    await expect(scannerCredential(user, company, offline)).rejects.toThrow(
      /Prepara/,
    );
    await local.delete("snapshots", key);
  });
  it("generates compact QR symbols decodable without pure-barcode assumptions", () => {
    for (let i = 0; i < 5; i++) {
      const text = pairingURL({
        company,
        v: 1,
        session: crypto.randomUUID(),
        endpoint: "http://192.168.1.20:47831",
        secret: randomSecret(),
        token: randomSecret(),
        expiresAt: Date.now() + 120000,
      },"https://nexo-escaner.loby207.workers.dev");
      const qr = QRCode.create(text, { errorCorrectionLevel: "M", maskPattern:pairingMask(text) });
      expect(qr.modules.size).toBeLessThanOrEqual(97);
      const width = (qr.modules.size + 8) * 6,
        pixels = new Uint8ClampedArray(width * width).fill(255);
      for (let y = 0; y < width; y++)
        for (let x = 0; x < width; x++) {
          const row = Math.floor(y / 6) - 4,
            col = Math.floor(x / 6) - 4;
          if (
            row >= 0 &&
            col >= 0 &&
            row < qr.modules.size &&
            col < qr.modules.size &&
            qr.modules.get(row, col)
          )
            pixels[y * width + x] = 0;
        }
      const reader = new MultiFormatReader();
      expect(
        reader
          .decode(
            new BinaryBitmap(
              new HybridBinarizer(new RGBLuminanceSource(pixels, width, width)),
            ),
            new Map<DecodeHintType,unknown>([
              [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]],
              [DecodeHintType.TRY_HARDER,true],
            ]),
          )
          .getText(),
      ).toBe(text);
    }
  });
  it("binds ciphertext to its session, detects tampering and never includes the code in plaintext", async () => {
    const secret = randomSecret(),
      packet = await seal(secret, "session", { type: "scan", code: "000123" });
    expect(JSON.stringify(packet)).not.toContain("000123");
    expect(await unseal(secret, "session", packet)).toEqual({
      type: "scan",
      code: "000123",
    });
    await expect(unseal(secret, "another", packet)).rejects.toThrow();
    await expect(unseal(randomSecret(), "session", packet)).rejects.toThrow();
  });
  it("accepts fresh private-network pairing only, without navigating to arbitrary QR URLs", () => {
    const info = {
      v: 1 as const,
      session: crypto.randomUUID(),
      endpoint: "http://192.168.1.2:47831",
      secret: randomSecret(),
      token: randomSecret(),
      expiresAt: Date.now() + 120000,
    };
    expect(parsePair(pairText(info))).toEqual(info);
    expect(() => parsePair("https://evil.test")).toThrow();
    expect(() =>
      parsePair(pairText({ ...info, endpoint: "http://example.com:47831" })),
    ).toThrow();
    expect(() => parsePair(pairText({ ...info, expiresAt: 1 }))).toThrow();
    expect(() => localEndpoint("http://127.0.0.1:47831")).toThrow();
    expect(localEndpoint("http://172.16.0.1:47831")).toBe(
      "http://172.16.0.1:47831",
    );
  });
  it("checks signature, issuer, expiry, role and proof of possession", async () => {
    const signing = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const device = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const jwk = await crypto.subtle.exportKey("jwk", device.publicKey),
      key = await crypto.subtle.exportKey("jwk", signing.publicKey),
      now = Date.now();
    const grant: DeviceGrant = {
      v: 1,
      issuer,
      user,
      company,
      device: crypto.randomUUID(),
      role: "operator",
      publicKey: { kty: "EC", crv: "P-256", x: jwk.x!, y: jwk.y! },
      issuedAt: now,
      expiresAt: now + 86400000,
    };
    const signed = await issueScannerGrant(
      JSON.stringify(await crypto.subtle.exportKey("jwk", signing.privateKey)),
      grant,
    );
    expect((await verifyGrant(signed, key, issuer)).role).toBe("operator");
    await expect(
      verifyGrant(signed, key, "https://other.test"),
    ).rejects.toThrow();
    await expect(
      verifyGrant(signed, key, issuer, now + 86400000),
    ).rejects.toThrow();
    await expect(
      verifyGrant(
        { ...signed, payload: JSON.stringify({ ...grant, role: "admin" }) },
        key,
        issuer,
      ),
    ).rejects.toThrow();
    const proof = await signText(
      device.privateKey,
      proofText("session", "nonce", "phone"),
    );
    expect(
      await verifyText(
        grant.publicKey,
        proofText("session", "nonce", "phone"),
        proof,
      ),
    ).toBe(true);
    expect(
      await verifyText(
        grant.publicKey,
        proofText("another", "nonce", "phone"),
        proof,
      ),
    ).toBe(false);
  });
  it("issues grants with server membership, never a client role, and denies foreign companies", async () => {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const key = await crypto.subtle.exportKey("jwk", pair.privateKey),
      pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const env = {
      APP_ORIGIN: issuer,
      SUPABASE_URL: "https://db.test",
      SUPABASE_PUBLISHABLE_KEY: "public",
      SUPABASE_SECRET_KEY: "secret",
      SCANNER_SIGNING_KEY: JSON.stringify(key),
    } as Env;
    const req = () =>
      new Request(issuer + "/api/scanner/grant?company=" + company, {
        method: "POST",
        headers: {
          Authorization: "Bearer test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          device: crypto.randomUUID(),
          publicKey: pub,
          role: "admin",
          user: "attacker",
        }),
      });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ id: user, email_confirmed_at: "now" }),
        )
        .mockResolvedValueOnce(
          Response.json({ workspaces: [{ owner: company, role: "operator" }] }),
        )
        .mockResolvedValueOnce(Response.json({ ok: true })),
    );
    const result = await worker.fetch(req(), env);
    expect(result.status).toBe(200);
    const data = (await result.json()) as { grant: { payload: string } };
    expect(JSON.parse(data.grant.payload)).toMatchObject({
      user,
      company,
      role: "operator",
    });
    expect(JSON.stringify(data)).not.toContain(key.d);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ id: user, email_confirmed_at: "now" }),
        )
        .mockResolvedValueOnce(Response.json({ workspaces: [] })),
    );
    expect((await worker.fetch(req(), env)).status).toBe(403);
  });
});

describe("scanner v2 operation commands",()=>{
 it("allows opening a draft but has no confirmation message",()=>{const id=crypto.randomUUID();expect(messageSchema.parse({v:2,type:"open_operation",id,revision:1,mode:"sale"}).type).toBe("open_operation");expect(messageSchema.safeParse({v:2,type:"confirm",id,revision:1}).success).toBe(false);expect(messageSchema.safeParse({v:1,type:"open_operation",id,revision:1,mode:"sale"}).success).toBe(false);});
 it("keeps temporary credentials exclusively in the scanner URL fragment",()=>{const p={v:1 as const,session:crypto.randomUUID(),endpoint:"http://192.168.1.20:47831",token:randomSecret(),secret:randomSecret(),expiresAt:Date.now()+120000};const url=new URL(pairingURL(p,"https://nexo-escaner.loby207.workers.dev"));expect(url.search).toBe("");expect(parsePair(url.href)).toEqual(p);expect(()=>parsePair(url.href.replace("nexo-escaner.loby207.workers.dev","evil.test"))).toThrow();});
});
