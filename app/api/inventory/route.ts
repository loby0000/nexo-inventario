import {
  usesSupabase,
  supabaseCall,
  migrateLegacy,
} from "../../lib/supabase-gateway";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { z } from "zod";
import {
  productSchema,
  movementSchema,
  documentSchema,
  importSchema,
  newSku,
  digest,
} from "../../lib/contracts";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
async function context(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    throw new ApiError("Inicia sesión para acceder al inventario.", 401);
  const db = env.DB!;
  const owner =
    new URL(request.url).searchParams.get("workspace") ?? user.userId;
  if (owner.length > 200) throw new ApiError("Espacio no válido.");
  const member =
    owner === user.userId
      ? null
      : await db
          .prepare(
            "SELECT role FROM members WHERE owner=? AND user_id=? AND accepted=1",
          )
          .bind(owner, user.userId)
          .first<{ role: string }>();
  if (owner !== user.userId && !member)
    throw new ApiError("No tienes acceso a este negocio.", 403);
  return {
    db,
    user,
    owner,
    role: owner === user.userId ? "admin" : member!.role,
  };
}
async function failure(e: unknown) {
  if (
    e instanceof Error &&
    "status" in e &&
    typeof e.status === "number" &&
    [400, 401, 403, 404, 409, 413, 415, 429, 503].includes(e.status)
  )
    return json({ error: e.message }, e.status);
  if (e instanceof ApiError) return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError)
    return json(
      {
        error:
          "Revisa los campos: " +
          e.issues.map((i) => i.path.join(".") || "datos").join(", ") +
          ". Los códigos admiten letras, números, puntos, guiones y guiones bajos.",
      },
      400,
    );
  const message = String(e);
  if (/UNIQUE|unique/i.test(message))
    return json(
      {
        error:
          "Ya existe un código, código de barras o solicitud con estos datos. Revisa el catálogo antes de repetir.",
      },
      409,
    );
  if (/insufficient_stock|invalid_product|CHECK constraint/i.test(message))
    return json(
      {
        error:
          "La operación no se guardó: revisa las existencias y los productos activos.",
      },
      409,
    );
  console.error(
    "Inventory request failed",
    e instanceof Error ? e.name : "unknown",
  );
  return json(
    { error: "No pudimos completar la operación. Inténtalo de nuevo." },
    500,
  );
}
export async function GET(request: Request) {
  try {
    if (usesSupabase()) {
      const user = await getChatGPTUser();
      if (!user)
        throw new ApiError("Inicia sesión para acceder al inventario.", 401);
      await migrateLegacy(user);
      return json(
        await supabaseCall(
          user,
          new URL(request.url).searchParams.get("workspace") ?? user.userId,
          "GET",
          {},
        ),
      );
    }

    const { db, owner, user, role } = await context(request);
    const [p, m, team, workspace, spaces, invites, docs] = await Promise.all([
      db
        .prepare("SELECT * FROM products WHERE owner=? ORDER BY archived,name")
        .bind(owner)
        .all(),
      db
        .prepare(
          "SELECT m.*,p.name AS product_name,p.sku FROM movements m JOIN products p ON p.id=m.product_id WHERE m.owner=? ORDER BY m.created_at DESC,m.rowid DESC LIMIT 2000",
        )
        .bind(owner)
        .all(),
      role === "admin"
        ? db
            .prepare("SELECT id,email,role,accepted FROM members WHERE owner=?")
            .bind(owner)
            .all()
        : Promise.resolve({ results: [] }),
      db
        .prepare("SELECT name,description FROM workspaces WHERE owner=?")
        .bind(owner)
        .first(),
      db
        .prepare(
          "SELECT m.owner,COALESCE(w.name,'Negocio compartido') name,m.role FROM members m LEFT JOIN workspaces w ON w.owner=m.owner WHERE m.user_id=? AND m.accepted=1",
        )
        .bind(user.userId)
        .all(),
      db
        .prepare(
          "SELECT m.id,COALESCE(w.name,'Negocio compartido') name FROM members m LEFT JOIN workspaces w ON w.owner=m.owner WHERE m.email=? AND m.accepted=0",
        )
        .bind(user.email.toLowerCase())
        .all(),
      db
        .prepare(
          "SELECT * FROM documents WHERE owner=? ORDER BY created_at DESC LIMIT 500",
        )
        .bind(owner)
        .all(),
    ]);
    const own = await db
      .prepare("SELECT name FROM workspaces WHERE owner=?")
      .bind(user.userId)
      .first<{ name: string }>();
    return json({
      products: p.results,
      movements: m.results,
      members: team.results,
      documents: docs.results,
      workspace: {
        owner,
        name: "Mi negocio",
        description: "",
        ...(workspace ?? {}),
      },
      workspaces: [
        { owner: user.userId, name: own?.name ?? "Mi negocio", role: "admin" },
        ...spaces.results,
      ],
      invitations: invites.results,
      user: { name: user.fullName ?? user.email, email: user.email, role },
    });
  } catch (e) {
    return failure(e);
  }
}
async function readBody(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new ApiError("El formato de la solicitud no es válido.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("Faltan los datos.");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 262144) {
      await reader.cancel();
      throw new ApiError("La solicitud supera el límite de 256 KB.", 413);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const part of chunks) {
    all.set(part, offset);
    offset += part.length;
  }
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(all));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
    return body as Record<string, unknown>;
  } catch {
    throw new ApiError("Los datos enviados no son válidos.");
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (
      (origin && origin !== new URL(request.url).origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new ApiError("Solicitud no autorizada.", 403);
    if (usesSupabase()) {
      const user = await getChatGPTUser();
      if (!user)
        throw new ApiError("Inicia sesión para acceder al inventario.", 401);
      const body = await readBody(request);
      await migrateLegacy(user);
      return json(
        await supabaseCall(
          user,
          new URL(request.url).searchParams.get("workspace") ?? user.userId,
          "POST",
          body,
        ),
      );
    }
    const { db, owner, user, role } = await context(request);
    const body = await readBody(request);
    const now = new Date().toISOString(),
      action = body.action;
    if (action === "acceptInvitation") {
      const v = z.object({ id: z.string().max(100) }).parse(body);
      const result = await db
        .prepare(
          "UPDATE members SET accepted=1,user_id=? WHERE id=? AND email=? AND accepted=0",
        )
        .bind(user.userId, v.id, user.email.toLowerCase())
        .run();
      if (!result.meta.changes)
        throw new ApiError("La invitación ya no está disponible.", 404);
      return json({ ok: true });
    }
    if (action === "movement") {
      const v = movementSchema.parse(body);
      const prior = await db
        .prepare(
          "SELECT product_id,type,quantity,note FROM movements WHERE id=? AND owner=?",
        )
        .bind(v.id, owner)
        .first<{
          product_id: string;
          type: string;
          quantity: number;
          note: string;
        }>();
      if (prior) {
        if (
          prior.product_id !== v.productId ||
          prior.type !== v.type ||
          prior.quantity !== v.quantity ||
          prior.note !== v.note
        )
          throw new ApiError(
            "Ese identificador ya pertenece a otro movimiento.",
            409,
          );
        return json({ ok: true });
      }
      await db
        .prepare(
          "INSERT INTO movements(id,owner,product_id,type,quantity,note,actor,created_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .bind(
          v.id,
          owner,
          v.productId,
          v.type,
          v.quantity,
          v.note,
          user.email,
          now,
        )
        .run();
      return json({ ok: true });
    }
    if (action === "document") {
      const v = documentSchema.parse(body);
      if (v.type === "purchase" && role !== "admin")
        throw new ApiError(
          "Solo el administrador puede registrar compras.",
          403,
        );
      const hash = await digest(v);
      const prior = await db
        .prepare("SELECT payload_hash FROM documents WHERE id=? AND owner=?")
        .bind(v.id, owner)
        .first<{ payload_hash: string }>();
      if (prior) {
        if (prior.payload_hash !== hash)
          throw new ApiError(
            "Esta solicitud ya se utilizó para otra operación.",
            409,
          );
        return json({ ok: true });
      }
      const total = v.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
      const ref =
        v.reference ||
        `${v.type === "purchase" ? "COMPRA" : "VENTA"}-${v.id.slice(0, 8).toUpperCase()}`;
      const batch = [
        db
          .prepare(
            "INSERT INTO documents(id,owner,type,reference,contact,note,actor,total,payload_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            v.id,
            owner,
            v.type,
            ref,
            v.contact,
            v.note,
            user.email,
            total,
            hash,
            now,
          ),
      ];
      for (const line of [...v.lines].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      ))
        batch.push(
          db
            .prepare(
              "INSERT INTO movements(id,owner,product_id,type,quantity,note,actor,created_at,document_id,unit_price) VALUES(?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              crypto.randomUUID(),
              owner,
              line.productId,
              v.type === "purchase" ? "in" : "out",
              line.quantity,
              `${v.type === "purchase" ? "Compra" : "Venta"} · ${ref}`,
              user.email,
              now,
              v.id,
              line.unitPrice,
            ),
        );
      await db.batch(batch);
      return json({ ok: true, id: v.id });
    }
    if (role !== "admin")
      throw new ApiError(
        "Esta acción requiere permisos de administrador.",
        403,
      );
    if (action === "workspace") {
      const v = z
        .object({
          name: z.string().trim().min(2).max(60),
          description: z.string().trim().max(160),
        })
        .parse(body);
      await db
        .prepare(
          "INSERT INTO workspaces(owner,name,description,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET name=excluded.name,description=excluded.description,updated_at=excluded.updated_at",
        )
        .bind(owner, v.name, v.description, now)
        .run();
      return json({ ok: true });
    }
    if (action === "product") {
      const v = productSchema.parse(body);
      const createId = body.createId
        ? z.string().uuid().parse(body.createId)
        : null;
      const productHash = await digest({ ...v, createId });
      if (createId && !body.id) {
        const prior = await db
          .prepare("SELECT payload_hash FROM requests WHERE id=? AND owner=?")
          .bind(createId, owner)
          .first<{ payload_hash: string }>();
        if (prior) {
          if (prior.payload_hash !== productHash)
            throw new ApiError(
              "Esta solicitud ya pertenece a otro producto.",
              409,
            );
          return json({ ok: true, id: createId });
        }
      }

      const id =
        typeof body.id === "string"
          ? z.string().min(1).max(100).parse(body.id)
          : (createId ?? crypto.randomUUID());
      const sku = v.sku || newSku();
      const p = [
        v.name,
        sku,
        v.barcode,
        v.category,
        v.supplier,
        v.unit,
        v.cost,
        v.price,
        v.minimum,
        now,
      ];
      if (body.id) {
        const r = await db
          .prepare(
            "UPDATE products SET name=?,sku=?,barcode=?,category=?,supplier=?,unit=?,cost=?,price=?,minimum=?,updated_at=? WHERE id=? AND owner=? AND archived=0",
          )
          .bind(...p, id, owner)
          .run();
        if (!r.meta.changes)
          throw new ApiError(
            "El producto no está disponible para editar.",
            404,
          );
      } else {
        const insert = db
          .prepare(
            "INSERT INTO products(name,sku,barcode,category,supplier,unit,cost,price,minimum,updated_at,id,owner,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(...p, id, owner, now);
        if (createId)
          await db.batch([
            db
              .prepare(
                "INSERT INTO requests(id,owner,payload_hash,created_at) VALUES(?,?,?,?)",
              )
              .bind(createId, owner, productHash, now),
            insert,
          ]);
        else await insert.run();
      }
      return json({ ok: true, id });
    }
    if (action === "import") {
      const v = importSchema.parse(body);
      const hash = await digest(v);
      const prior = await db
        .prepare("SELECT payload_hash FROM requests WHERE id=? AND owner=?")
        .bind(v.id, owner)
        .first<{ payload_hash: string }>();
      if (prior) {
        if (prior.payload_hash !== hash)
          throw new ApiError(
            "Esta importación ya se utilizó con otros datos.",
            409,
          );
        return json({ ok: true });
      }
      const rows = v.rows.map((p) => ({ ...p, sku: p.sku || newSku() }));
      if (new Set(rows.map((p) => p.sku)).size !== rows.length)
        throw new ApiError("Hay códigos SKU repetidos en el archivo.", 409);
      const barcodes = rows.map((p) => p.barcode).filter(Boolean);
      if (new Set(barcodes).size !== barcodes.length)
        throw new ApiError(
          "Hay códigos de barras repetidos en el archivo.",
          409,
        );
      const batch = [
        db
          .prepare(
            "INSERT INTO requests(id,owner,payload_hash,created_at) VALUES(?,?,?,?)",
          )
          .bind(v.id, owner, hash, now),
      ];
      for (const p of rows)
        batch.push(
          db
            .prepare(
              "INSERT INTO products(id,owner,name,sku,barcode,category,supplier,unit,cost,price,minimum,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              crypto.randomUUID(),
              owner,
              p.name,
              p.sku,
              p.barcode,
              p.category,
              p.supplier,
              p.unit,
              p.cost,
              p.price,
              p.minimum,
              now,
              now,
            ),
        );
      await db.batch(batch);
      return json({ ok: true, count: rows.length });
    }
    if (action === "archive") {
      const v = z
        .object({ id: z.string().max(100), archived: z.boolean() })
        .parse(body);
      const r = await db
        .prepare(
          "UPDATE products SET archived=?,updated_at=? WHERE id=? AND owner=? AND (?=0 OR stock=0)",
        )
        .bind(v.archived ? 1 : 0, now, v.id, owner, v.archived ? 1 : 0)
        .run();
      if (!r.meta.changes)
        throw new ApiError(
          "Solo puedes archivar productos sin existencias.",
          409,
        );
      return json({ ok: true });
    }
    if (action === "member") {
      const v = z
        .object({ email: z.string().trim().email().max(160) })
        .parse(body);
      if (v.email.toLowerCase() === user.email.toLowerCase())
        throw new ApiError("Ya eres administrador de este negocio.");
      await db
        .prepare("INSERT INTO members(id,owner,email,role) VALUES(?,?,?,?)")
        .bind(crypto.randomUUID(), owner, v.email.toLowerCase(), "operator")
        .run();
      return json({ ok: true });
    }
    if (action === "removeMember") {
      const v = z.object({ id: z.string().max(100) }).parse(body);
      const r = await db
        .prepare("DELETE FROM members WHERE id=? AND owner=?")
        .bind(v.id, owner)
        .run();
      if (!r.meta.changes) throw new ApiError("No se encontró el acceso.", 404);
      return json({ ok: true });
    }
    if (action === "demo") {
      const existing = await db
        .prepare("SELECT COUNT(*) n FROM products WHERE owner=?")
        .bind(owner)
        .first<{ n: number }>();
      if (existing?.n)
        return json(
          {
            error: "Los ejemplos solo se pueden cargar en un inventario vacío.",
          },
          409,
        );
      const samples = [
        [
          "Cuaderno A5 · puntos",
          "PAP-001",
          "Papelería",
          "Papel & Co.",
          850000,
          1490000,
          42,
          10,
        ],
        [
          "Bolígrafo gel negro",
          "PAP-002",
          "Papelería",
          "Papel & Co.",
          180000,
          350000,
          8,
          15,
        ],
        [
          "Botella térmica 500 ml",
          "HOG-001",
          "Hogar",
          "Casa Norte",
          2850000,
          4900000,
          24,
          8,
        ],
        [
          "Café de origen 250 g",
          "ALI-001",
          "Alimentos",
          "Origen Andino",
          1650000,
          2800000,
          6,
          10,
        ],
        [
          "Organizador de escritorio",
          "HOG-002",
          "Hogar",
          "Casa Norte",
          1200000,
          2200000,
          18,
          5,
        ],
        [
          "Cable USB-C 1 m",
          "TEC-001",
          "Tecnología",
          "Conecta",
          650000,
          1500000,
          0,
          8,
        ],
        [
          "Audífonos inalámbricos",
          "TEC-002",
          "Tecnología",
          "Conecta",
          6200000,
          9900000,
          12,
          4,
        ],
        [
          "Tote bag de algodón",
          "ACC-001",
          "Accesorios",
          "Taller Local",
          900000,
          1800000,
          31,
          10,
        ],
      ] as const;
      const statements = [];
      for (const [
        name,
        sku,
        category,
        supplier,
        cost,
        price,
        stock,
        minimum,
      ] of samples) {
        const id = crypto.randomUUID();
        statements.push(
          db
            .prepare(
              "INSERT INTO products(id,owner,name,sku,category,supplier,cost,price,minimum,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              id,
              owner,
              name,
              sku,
              category,
              supplier,
              cost,
              price,
              minimum,
              now,
              now,
            ),
        );
        if (stock)
          statements.push(
            db
              .prepare(
                "INSERT INTO movements(id,owner,product_id,type,quantity,note,actor,created_at) VALUES(?,?,?,?,?,?,?,?)",
              )
              .bind(
                crypto.randomUUID(),
                owner,
                id,
                "in",
                stock,
                "Existencias iniciales · datos de ejemplo",
                user.email,
                now,
              ),
          );
      }
      await db.batch(statements);
      return json({ ok: true });
    }

    throw new ApiError("Acción desconocida.");
  } catch (e) {
    return failure(e);
  }
}
