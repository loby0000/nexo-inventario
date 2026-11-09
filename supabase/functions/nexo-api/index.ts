import {
  productSchema,
  movementSchema,
  documentSchema,
  importSchema,
} from "./contracts.ts";
import { z } from "npm:zod@4.6.7";
const PUBLIC_KEY =
  "MCowBQYDK2VwAyEA5gkaZU1HTqPQ/xSr1Z49Jay/AzKcVFtJcyrGAPYmALg=";
const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
function validated(body: Record<string, unknown>) {
  const action = body.action;
  switch (action) {
    case "product":
      return {
        action,
        ...productSchema.parse(body),
        ...(body.id ? { id: z.string().min(1).max(100).parse(body.id) } : {}),
        ...(body.createId
          ? { createId: z.string().uuid().parse(body.createId) }
          : {}),
      };
    case "movement":
      return { action, ...movementSchema.parse(body) };
    case "document":
      return { action, ...documentSchema.parse(body) };
    case "import":
      return { action, ...importSchema.parse(body) };
    case "workspace":
      return {
        action,
        ...z
          .object({
            name: z.string().trim().min(2).max(60),
            description: z.string().trim().max(160),
          })
          .parse(body),
      };
    case "archive":
      return {
        action,
        ...z
          .object({ id: z.string().min(1).max(100), archived: z.boolean() })
          .parse(body),
      };
    case "member":
      return {
        action,
        ...z.object({ email: z.string().trim().email().max(160) }).parse(body),
      };
    case "acceptInvitation":
    case "removeMember":
      return {
        action,
        ...z.object({ id: z.string().min(1).max(100) }).parse(body),
      };
    case "createTransfer":
      return { action };
    case "demo":
      return { action };
    default:
      throw new SyntaxError("Acción desconocida.");
  }
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST")
    return json({ error: "Método no permitido." }, 405);
  try {
    const signature = req.headers.get("X-Nexo-Signature");
    if (!signature || signature.length > 128)
      return json({ error: "No autorizado." }, 401);
    const reader = req.body?.getReader();
    if (!reader) return json({ error: "Faltan datos." }, 400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2000000) {
        await reader.cancel();
        return json({ error: "Solicitud demasiado grande." }, 413);
      }
      chunks.push(value);
    }
    const buffer = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) {
      buffer.set(part, offset);
      offset += part.length;
    }
    const key = await crypto.subtle.importKey(
      "spki",
      bytes(PUBLIC_KEY),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    let valid = false;
    try {
      valid = await crypto.subtle.verify(
        "Ed25519",
        key,
        bytes(signature),
        buffer,
      );
    } catch {}
    if (!valid) return json({ error: "No autorizado." }, 401);
    const envelope = z
      .object({
        user: z.object({
          id: z.string().min(1).max(200),
          email: z.string().email().max(160),
          name: z.string().max(200).nullable(),
        }),
        workspace: z.string().max(200),
        method: z.enum(["GET", "POST", "BOOTSTRAP"]),
        body: z.record(z.string(), z.unknown()),
        nonce: z.string().uuid(),
        timestamp: z.number(),
      })
      .parse(JSON.parse(new TextDecoder().decode(buffer)));
    if (Math.abs(Date.now() - envelope.timestamp) > 60000)
      return json({ error: "La solicitud ha caducado." }, 401);
    const body =
      envelope.method === "POST" ? validated(envelope.body) : envelope.body;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!service) throw Error("Server configuration");
    const r = await fetch(
      Deno.env.get("SUPABASE_URL") + "/rest/v1/rpc/nexo_gateway",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: service,
          Authorization: "Bearer " + service,
        },
        body: JSON.stringify({
          p_user: envelope.user.id,
          p_email: envelope.user.email,
          p_name: envelope.user.name,
          p_workspace: envelope.workspace,
          p_method: envelope.method,
          p_body: body,
          p_nonce: envelope.nonce,
        }),
      },
    );
    const data = await r.json();
    if (!r.ok) {
      const raw = String(data.message ?? "");
      if (raw.startsWith("NEXO:")) {
        const message = raw.slice(5);
        return json(
          { error: message },
          message.includes("Demasiadas")
            ? 429
            : message.includes("acceso") || message.includes("administrador")
              ? 403
              : 409,
        );
      }
      if (data.code === "23505")
        return json(
          {
            error:
              "Ya existe un código, código de barras o solicitud con estos datos.",
          },
          409,
        );
      if (["23514", "23503", "22P02", "22003", "23502"].includes(data.code))
        return json(
          { error: "Revisa los valores y los productos de la operación." },
          400,
        );
      console.error("Nexo database error", data.code);
      return json(
        { error: "La base de datos no pudo completar la operación." },
        503,
      );
    }
    return json(data);
  } catch (e) {
    if (e instanceof z.ZodError)
      return json(
        {
          error:
            "Revisa los campos: " +
            e.issues.map((i) => i.path.join(".")).join(", ") +
            ".",
        },
        400,
      );
    if (e instanceof SyntaxError)
      return json({ error: "Los datos enviados no son válidos." }, 400);
    console.error(
      "Nexo gateway error",
      e instanceof Error ? e.name : "unknown",
    );
    return json({ error: "No pudimos completar la operación." }, 503);
  }
});
