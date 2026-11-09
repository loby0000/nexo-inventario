import { env } from "cloudflare:workers";
import type { ChatGPTUser } from "../chatgpt-auth";
const migrated = new Set<string>();
export function usesSupabase() {
  return !!env.NEXO_SUPABASE_URL;
}
function bytes(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
export async function supabaseCall(
  user: ChatGPTUser,
  workspace: string,
  method: "GET" | "POST" | "BOOTSTRAP",
  body: unknown,
) {
  if (!env.NEXO_SUPABASE_URL || !env.NEXO_SIGNING_KEY)
    throw Error("Supabase configuration incomplete");
  const payload = JSON.stringify({
    user: { id: user.userId, email: user.email, name: user.fullName },
    workspace,
    method,
    body,
    nonce: crypto.randomUUID(),
    timestamp: Date.now(),
  });
  const key = await crypto.subtle.importKey(
    "pkcs8",
    bytes(env.NEXO_SIGNING_KEY),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "Ed25519",
    key,
    new TextEncoder().encode(payload),
  );
  const header = btoa(String.fromCharCode(...new Uint8Array(signature)));
  const r = await fetch(env.NEXO_SUPABASE_URL + "/functions/v1/nexo-api", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Nexo-Signature": header },
    body: payload,
    signal: AbortSignal.timeout(20000),
  });
  const result = (await r.json()) as { error?: string };
  if (!r.ok) {
    const error = new Error(
      result.error ?? "La base de datos no está disponible.",
    ) as Error & { status: number };
    error.status = r.status;
    throw error;
  }
  return result;
}
export async function migrateLegacy(user: ChatGPTUser) {
  if (migrated.has(user.userId)) return;
  const db = env.DB;
  if (!db) throw Error("Legacy database unavailable for migration");
  const [products, movements, members, workspace] = await db.batch([
    db.prepare("SELECT * FROM products WHERE owner=?").bind(user.userId),
    db
      .prepare(
        "SELECT * FROM movements WHERE owner=? ORDER BY created_at,rowid",
      )
      .bind(user.userId),
    db.prepare("SELECT id,email FROM members WHERE owner=?").bind(user.userId),
    db
      .prepare("SELECT name,description FROM workspaces WHERE owner=?")
      .bind(user.userId),
  ]);
  const payload = {
    products: products.results,
    movements: movements.results,
    members: members.results,
    workspace: workspace.results[0] ?? null,
  };
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 1900000)
    throw Error("Legacy data requires a staged migration");
  await supabaseCall(user, user.userId, "BOOTSTRAP", payload);
  if (migrated.size >= 1024) migrated.delete(migrated.values().next().value!);
  migrated.add(user.userId);
}
