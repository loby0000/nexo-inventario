import { z } from "zod";

export const publicKeySchema = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: z.string().regex(/^[\w-]{43}$/),
  y: z.string().regex(/^[\w-]{43}$/),
});
export const grantSchema = z.object({
  v: z.literal(1),
  issuer: z.string().url(),
  user: z.string().uuid(),
  company: z.string().uuid(),
  device: z.string().uuid(),
  role: z.enum(["admin", "operator"]),
  publicKey: publicKeySchema,
  issuedAt: z.number().int(),
  expiresAt: z.number().int(),
});
export type DeviceGrant = z.infer<typeof grantSchema>;
export type SignedGrant = { payload: string; signature: string };
export const bytes = (s: string) => new TextEncoder().encode(s);
export function encode(b: Uint8Array) {
  return btoa(String.fromCharCode(...b))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export function decode(s: string) {
  if (!/^[\w-]+$/.test(s)) throw Error("Formato inválido.");
  return Uint8Array.from(
    atob(s.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}
export function randomSecret() {
  return encode(crypto.getRandomValues(new Uint8Array(32)));
}
export async function signText(key: CryptoKey, text: string) {
  return encode(
    new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        bytes(text),
      ),
    ),
  );
}
export async function verifyText(
  key: JsonWebKey,
  text: string,
  signature: string,
) {
  const k = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    k,
    decode(signature),
    bytes(text),
  );
}
export async function verifyGrant(
  signed: SignedGrant,
  key: JsonWebKey,
  issuer: string,
  now = Date.now(),
): Promise<DeviceGrant> {
  if (
    signed.payload.length > 3000 ||
    !(await verifyText(key, signed.payload, signed.signature))
  )
    throw Error("La autorización del dispositivo no es válida.");
  const g = grantSchema.parse(JSON.parse(signed.payload));
  if (
    g.issuer !== issuer ||
    g.issuedAt > now ||
    g.expiresAt <= now ||
    g.expiresAt - g.issuedAt > 86400000
  )
    throw Error("Conéctate para renovar la autorización del escáner.");
  return g;
}
export const packetSchema = z.object({
  v: z.literal(1),
  iv: z.string().max(30),
  data: z.string().max(24000),
});
export type Packet = z.infer<typeof packetSchema>;
export async function seal(
  secret: string,
  session: string,
  value: unknown,
): Promise<Packet> {
  const k = await crypto.subtle.importKey(
    "raw",
    decode(secret),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return {
    v: 1,
    iv: encode(iv),
    data: encode(
      new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: bytes(session) },
          k,
          bytes(JSON.stringify(value)),
        ),
      ),
    ),
  };
}
export async function unseal(
  secret: string,
  session: string,
  packet: Packet,
): Promise<unknown> {
  packetSchema.parse(packet);
  const k = await crypto.subtle.importKey(
    "raw",
    decode(secret),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: decode(packet.iv),
          additionalData: bytes(session),
        },
        k,
        decode(packet.data),
      ),
    ),
  );
}
export const signedGrantSchema = z.object({
  payload: z.string().max(3000),
  signature: z.string().max(150),
});
export const messageSchema = z.discriminatedUnion("type", [
  z.object({
    v: z.literal(2),
    type: z.literal("open_operation"),
    id: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    mode: z.enum(["sale", "purchase"]),
  }),
  z.object({
    v: z.literal(2),
    type: z.literal("command_result"),
    id: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    ok: z.boolean(),
    message: z.string().max(240),
  }),
  z.object({
    v: z.literal(2),
    type: z.literal("hello"),
    grant: signedGrantSchema,
    proof: z.string().max(150),
    nonce: z.string().max(60),
  }),
  z.object({
    v: z.literal(2),
    type: z.literal("accepted"),
    active: z.boolean(),
    grant: signedGrantSchema,
    proof: z.string().max(150),
    nonce: z.string().max(60),
    draft: z.string().uuid(),
    mode: z.enum(["sale", "purchase"]),
    companyName: z.string().max(60),
  }),
  z.object({
    v: z.literal(2),
    type: z.literal("scan"),
    id: z.string().uuid(),
    draft: z.string().uuid(),
    code: z.string().min(1).max(128),
  }),
  z.object({
    v: z.literal(2),
    type: z.literal("ack"),
    id: z.string().uuid(),
    ok: z.boolean(),
    message: z.string().max(240),
    quantity: z.number().int().nonnegative().optional(),
  }),
  z.object({ v: z.literal(2), type: z.literal("closed") }),
  z.object({ v: z.literal(2), type: z.literal("heartbeat") }),
  z.object({
    v: z.literal(2),
    type: z.literal("paused"),
    revision: z.number().int().nonnegative(),
  }),
  z.object({
    v: z.literal(2),
    type: z.literal("target"),
    revision: z.number().int().nonnegative(),
    draft: z.string().uuid(),
    mode: z.enum(["sale", "purchase"]),
    companyName: z.string().max(60),
  }),
]);
export type ScannerMessage = z.infer<typeof messageSchema>;
export const proofText = (
  session: string,
  nonce: string,
  side: "host" | "phone",
  draft = "",
) => JSON.stringify(["nexo-scanner-v2", session, nonce, side, draft]);
export function localEndpoint(value: string, allowLoopback = false) {
  const u = new URL(value);
  const a = u.hostname.split(".").map(Number);
  const local =
    a.length === 4 &&
    a.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (a[0] === 10 ||
      (a[0] === 172 && a[1] >= 16 && a[1] <= 31) ||
      (a[0] === 192 && a[1] === 168) ||
      (allowLoopback && a[0] === 127));
  if (
    u.protocol !== "http:" ||
    !local ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    u.port !== "47831"
  )
    throw Error("Usa la dirección local del Conector Nexo.");
  return u.origin;
}
export const pairSchema = z.object({
  company: z.string().uuid().optional(),
  v: z.literal(1),
  session: z.string().uuid(),
  endpoint: z.string().max(80),
  token: z.string().regex(/^[\w-]{43}$/),
  secret: z.string().regex(/^[\w-]{43}$/),
  expiresAt: z.number().int(),
});
export type PairInfo = z.infer<typeof pairSchema>;
// Uppercase alphanumeric uses QR's compact mode, keeping both 256-bit secrets.
export function pairText(p: PairInfo) {
  const hex = (s: string) =>
    Array.from(decode(s), (v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  return [
    "NEXO1",
    p.session.toUpperCase(),
    new URL(p.endpoint).hostname,
    hex(p.token),
    hex(p.secret),
    p.expiresAt,
  ].join(":");
}
export function pairingURL(p: PairInfo, scannerOrigin: string) {
  const url = new URL(
    "/#vincular=" + encodeURIComponent(pairText(p)),
    scannerOrigin,
  );
  if (p.company) url.hash += "&empresa=" + p.company;
  return url.href;
}
export function parsePair(text: string, now = Date.now()): PairInfo {
  let company: string | undefined;
  if (text.startsWith("https://")) {
    const u = new URL(text);
    if (
      ![
        "nexo-escaner.loby207.workers.dev",
        "nexo-escaner-validacion.loby207.workers.dev",
      ].includes(u.hostname) ||
      u.pathname !== "/" ||
      u.search
    )
      throw Error("El QR no pertenece a Escáner Nexo.");
    const params = new URLSearchParams(u.hash.slice(1));
    company = params.get("empresa") ?? undefined;
    text = params.get("vincular") ?? "";
  }

  if (!text.startsWith("NEXO1:") || text.length > 1600)
    throw Error("Escanea el QR de «Conectar celular» en Nexo.");
  const raw = text.split(":");
  if (raw.length !== 6) throw Error("El código de conexión no es válido.");
  const unhex = (s: string) => {
    if (!/^[A-F0-9]{64}$/.test(s)) throw Error("Código de conexión no válido.");
    return encode(Uint8Array.from(s.match(/../g)!, (b) => parseInt(b, 16)));
  };
  const p = pairSchema.parse({
    ...(company ? { company } : {}),
    v: 1,
    session: raw[1].toLowerCase(),
    endpoint: `http://${raw[2]}:47831`,
    token: unhex(raw[3]),
    secret: unhex(raw[4]),
    expiresAt: Number(raw[5]),
  });
  localEndpoint(p.endpoint);
  if (p.expiresAt <= now || p.expiresAt > now + 300000)
    throw Error("El QR caducó. Genera otro en el PC.");
  return p;
}
