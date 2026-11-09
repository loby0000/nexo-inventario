import { openDB, type DBSchema } from "idb";
import type { Data, Product } from "../ui/inventory";
export type Operation = {
  id: string;
  user: string;
  company: string;
  body: Record<string, unknown>;
  dependencies: string[];
  createdAt: string;
  state: "pending" | "conflict" | "blocked" | "synced" | "cancelled";
  error?: string;
};
export type Snapshot = {
  key: string;
  user: string;
  company: string;
  data: Data;
  validatedAt: number;
  enabled: boolean;
  locked?: boolean;
};
interface LocalSchema extends DBSchema {
  snapshots: { key: string; value: Snapshot };
  operations: { key: string; value: Operation };
}
export const db = () =>
  openDB<LocalSchema>("nexo-offline-v1", 1, {
    upgrade(d) {
      d.createObjectStore("snapshots", { keyPath: "key" });
      d.createObjectStore("operations", { keyPath: "id" });
    },
  });
export const localKey = (user: string, company: string) => `${user}:${company}`;
export async function snapshots(user: string) {
  return (await (await db()).getAll("snapshots")).filter(
    (s) => s.user === user && !s.locked,
  );
}
export async function pending(user: string, company?: string) {
  return (await (await db()).getAll("operations"))
    .filter(
      (o) =>
        o.user === user &&
        (!company || o.company === company) &&
        !["synced", "cancelled"].includes(o.state),
    )
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
}
export async function saveSnapshot(
  user: string,
  company: string,
  data: Data,
  enable = false,
) {
  const d = await db(),
    key = localKey(user, company),
    tx = d.transaction(["snapshots", "operations"], "readwrite"),
    prior = await tx.objectStore("snapshots").get(key);
  const canonical =
    prior && (prior.data.revision ?? 0) > (data.revision ?? 0)
      ? prior.data
      : data;
  if (enable || (prior?.enabled && !prior.locked))
    await tx.objectStore("snapshots").put({
      key,
      user,
      company,
      data: canonical,
      validatedAt: Date.now(),
      enabled: true,
      locked: false,
    });
  if (enable)
    for (const op of await tx.objectStore("operations").getAll())
      if (
        op.user === user &&
        op.company === company &&
        op.state === "blocked" &&
        (data.user.role === "admin" ||
          (op.body.action === "document" && op.body.type === "sale"))
      )
        await tx
          .objectStore("operations")
          .put({ ...op, state: "pending", error: undefined });
  await tx.done;
  return canonical;
}
export function project(base: Data, operations: Operation[]): Data {
  const view = structuredClone(base);
  const queued = operations.filter((o) => o.state === "pending");
  // IndexedDB returns UUID key order, not creation order. Materialize every new
  // product before applying its purchases or sales, regardless of caller order.
  for (const op of queued) {
    const b = op.body;
    if (b.action === "product" && !b.id) {
      if (!view.products.some((p) => p.id === b.createId))
        view.products.push({
          ...b,
          id: b.createId,
          stock: 0,
          archived: 0,
        } as unknown as Product);
    }
  }
  for (const op of queued) {
    const b = op.body;
    if (b.action === "document" && view.documents.some((d) => d.id === b.id))
      continue;
    if (b.action === "document")
      for (const line of b.lines as { productId: string; quantity: number }[]) {
        const p = view.products.find((p) => p.id === line.productId);
        if (p)
          p.stock += b.type === "purchase" ? line.quantity : -line.quantity;
      }
  }
  return view;
}
export async function stage(
  user: string,
  company: string,
  body: Record<string, unknown>,
  now = Date.now(),
) {
  const d = await db(),
    tx = d.transaction(["snapshots", "operations"], "readwrite"),
    s = await tx.objectStore("snapshots").get(localKey(user, company));
  if (
    !s?.enabled ||
    s.locked ||
    now - s.validatedAt >= 86400000 ||
    now < s.validatedAt
  )
    throw Error("Conéctate para validar de nuevo el acceso a este equipo.");
  if (body.action !== "document" && !(body.action === "product" && !body.id))
    throw Error("Esta acción requiere conexión.");
  if (
    s.data.user.role !== "admin" &&
    (body.action !== "document" || body.type !== "sale")
  )
    throw Error(
      "Solo el administrador puede crear productos o recibir compras.",
    );
  const all = (await tx.objectStore("operations").getAll()).filter(
    (o) => o.user === user && o.company === company,
  );
  const active = all.filter((o) => !["synced", "cancelled"].includes(o.state));
  if (active.length >= 1000)
    throw Error(
      "Este equipo tiene 1000 operaciones pendientes. Sincroniza antes de continuar.",
    );
  const id = String(body.action === "product" ? body.createId : body.id);
  if (!id || id === "undefined")
    throw Error("La operación necesita un identificador estable.");
  const prior = all.find((o) => o.id === id);
  if (prior) {
    if (JSON.stringify(prior.body) !== JSON.stringify(body))
      throw Error("Este identificador ya tiene otros datos.");
    await tx.done;
    return prior;
  }
  const view = project(s.data, active);
  if (body.action === "product") {
    if (
      view.products.some(
        (p) =>
          p.sku === body.sku || (body.barcode && p.barcode === body.barcode),
      )
    )
      throw Error("Ya existe ese SKU o código de barras en el catálogo local.");
  } else {
    for (const line of body.lines as {
      productId: string;
      quantity: number;
    }[]) {
      const p = view.products.find(
        (p) => p.id === line.productId && !p.archived,
      );
      if (!p) throw Error("El producto no está disponible en este equipo.");
      if (body.type === "sale" && p.stock < line.quantity)
        throw Error(
          "La venta supera las existencias estimadas de este equipo.",
        );
    }
  }
  const deps =
    body.action === "document"
      ? (body.lines as { productId: string }[])
          .map(
            (l) =>
              active.find(
                (o) =>
                  o.body.action === "product" &&
                  o.body.createId === l.productId,
              )?.id,
          )
          .filter((x): x is string => !!x)
      : [];

  const op: Operation = {
    id,
    user,
    company,
    body: structuredClone(body),
    dependencies: [...new Set(deps)],
    createdAt: new Date(now).toISOString(),
    state: "pending",
  };
  await tx.objectStore("operations").add(op);
  await tx.done;
  return op;
}
export async function localView(user: string, company: string) {
  const s = await (await db()).get("snapshots", localKey(user, company));
  if (!s || s.locked)
    throw Error("Este equipo no está preparado para trabajar sin conexión.");
  if (Date.now() < s.validatedAt || Date.now() - s.validatedAt >= 86400000)
    throw Error(
      "La autorización sin conexión caducó. Los pendientes se conservan; conéctate para continuar.",
    );
  return project(s.data, await pending(user, company));
}
export async function lockUser(user: string) {
  const d = await db(),
    tx = d.transaction("snapshots", "readwrite");
  for (const s of await tx.store.getAll())
    if (s.user === user) await tx.store.put({ ...s, locked: true });
  await tx.done;
}
export async function blockCompany(
  user: string,
  company: string,
  error: string,
) {
  const d = await db(),
    tx = d.transaction(["snapshots", "operations"], "readwrite");
  const snapshot = await tx
    .objectStore("snapshots")
    .get(localKey(user, company));
  if (snapshot)
    await tx.objectStore("snapshots").put({ ...snapshot, locked: true });
  for (const op of await tx.objectStore("operations").getAll())
    if (
      op.user === user &&
      op.company === company &&
      !["synced", "cancelled"].includes(op.state)
    )
      await tx
        .objectStore("operations")
        .put({ ...op, state: "blocked", error });
  await tx.done;
}
export async function synchronize(
  user: string,
  send: (op: Operation) => Promise<{
    state: Operation["state"];
    error?: string;
    revision?: number;
    products?: Product[];
    documents?: Data["documents"];
    movements?: Data["movements"];
  }>,
) {
  const run = async () => {
    const d = await db();
    const queue = await pending(user),
      byId = new Map(queue.map((op) => [op.id, op])),
      ordered: Operation[] = [],
      seen = new Set<string>();
    function visit(op: Operation) {
      if (seen.has(op.id)) return;
      seen.add(op.id);
      for (const id of op.dependencies) {
        const dependency = byId.get(id);
        if (dependency) visit(dependency);
      }
      ordered.push(op);
    }
    for (const op of queue) visit(op);
    for (const op of ordered) {
      if (op.state === "blocked") continue;

      try {
        const result = await send(op);
        const tx = d.transaction(["operations", "snapshots"], "readwrite");
        await tx
          .objectStore("operations")
          .put({ ...op, state: result.state, error: result.error });
        if (result.state === "synced" && result.products) {
          const s = await tx
            .objectStore("snapshots")
            .get(localKey(user, op.company));
          if (s && (result.revision ?? 0) >= (s.data.revision ?? 0)) {
            for (const p of result.products) {
              const at = s.data.products.findIndex((x) => x.id === p.id);
              if (at < 0) s.data.products.push(p);
              else s.data.products[at] = p;
            }
            for (const doc of result.documents ?? [])
              if (!s.data.documents.some((x) => x.id === doc.id))
                s.data.documents.unshift(doc);
            for (const movement of result.movements ?? [])
              if (!s.data.movements.some((x) => x.id === movement.id))
                s.data.movements.unshift(movement);
            s.data.documents = s.data.documents.slice(0, 500);
            s.data.movements = s.data.movements.slice(0, 2000);
            s.data.revision = result.revision;
            await tx.objectStore("snapshots").put(s);
          }
        }
        await tx.done;
        if (result.state === "blocked") break;
      } catch {
        break;
      }
    }
  };
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request(`nexo-sync:${user}`, run);
  // Concurrent clients remain safe through server-side idempotency even without Web Locks.
  return run();
}
