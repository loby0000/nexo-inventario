import { openDB, type DBSchema } from "idb";
import type { Product } from "../ui/inventory";
import type { SignedGrant } from "../shared/scanner-protocol";
export type DraftLine = {
  productId: string;
  quantity: string;
  unitPrice: string;
};
export type ScanAck = {
  id: string;
  ok: boolean;
  message: string;
  quantity?: number;
};
export type PendingPhoneScan = { id: string; code: string; draft: string; mode?:"sale"|"purchase" };
interface PhoneDB extends DBSchema {
  scans: { key: string; value: PendingPhoneScan & { key: string } };
}
const phoneDB = () =>
  openDB<PhoneDB>("nexo-scanner-phone-v1", 1, {
    upgrade(d) {
      d.createObjectStore("scans", { keyPath: "key" });
    },
  });
export async function loadPhoneScan(key: string) {
  return (await phoneDB()).get("scans", key);
}
export async function savePhoneScan(key: string, value: PendingPhoneScan) {
  const tx = (await phoneDB()).transaction("scans", "readwrite");
  try {
    const prior = await tx.store.get(key);
    if (prior && prior.id !== value.id)
      throw Error(
        "Ya hay una lectura sin confirmar en este equipo. Recupérala antes de continuar.",
      );
    if(prior&&(prior.code!==value.code||prior.draft!==value.draft))throw Error("Una lectura pendiente no puede cambiar su contenido al reintentar.");
    await tx.store.put({ ...value, key });
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw error;
  }
}
export async function clearPhoneScan(key: string, id?: string) {
  const tx = (await phoneDB()).transaction("scans", "readwrite");
  const prior = await tx.store.get(key);
  if (prior && (!id || prior.id === id)) await tx.store.delete(key);
  await tx.done;
}
export type ScanDraft = {
  key: string;
  id: string;
  user: string;
  company: string;
  mode: "purchase" | "sale";
  lines: DraftLine[];
  contact: string | null;
  reference: string;
  note: string;
  receipts: Record<string, ScanAck>;
  updatedAt: number;
  submitted?: boolean;
};
export type Credential = {
  key: string;
  device: string;
  privateKey: CryptoKey;
  publicKey: JsonWebKey;
  grant?: SignedGrant;
  verifyKey?: JsonWebKey;
  issuer?: string;
};
interface ScannerDB extends DBSchema {
  drafts: { key: string; value: ScanDraft };
  credentials: { key: string; value: Credential };
}
export const scannerDB = () =>
  openDB<ScannerDB>("nexo-scanner-v1", 1, {
    upgrade(d) {
      d.createObjectStore("drafts", { keyPath: "key" });
      d.createObjectStore("credentials", { keyPath: "key" });
    },
  });
export const draftKey = (user: string, company: string, mode: string) =>
  `${user}:${company}:${mode}`;
export async function loadDraft(
  user: string,
  company: string,
  mode: "purchase" | "sale",
) {
  const d = await scannerDB(),
    key = draftKey(user, company, mode);
  const tx = d.transaction("drafts", "readwrite");
  let value = await tx.store.get(key);
  if (!value) {
    value = {
      key,
      id: crypto.randomUUID(),
      user,
      company,
      mode,
      lines: [],
      contact: null,
      reference: "",
      note: "",
      receipts: {},
      updatedAt: Date.now(),
    };
    await tx.store.put(value);
  }
  await tx.done;
  return value;
}
export async function updateDraft(
  key: string,
  change: (d: ScanDraft) => ScanDraft,
) {
  const d = await scannerDB(),
    tx = d.transaction("drafts", "readwrite");
  try {
    const prior = await tx.store.get(key);
    if (!prior || prior.submitted)
      throw Error("Esta operación está cerrada. Abre una nueva.");
    const next = change(structuredClone(prior));
    next.updatedAt = Math.max(Date.now(), prior.updatedAt + 1);
    await tx.store.put(next);
    await tx.done;
    return next;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* Already completed/aborted. */
    }
    await tx.done.catch(() => {});
    throw error;
  }
}
export async function addDraftScan(
  key: string,
  id: string,
  code: string,
  products: Product[],
) {
  let ack: ScanAck = {
    id,
    ok: false,
    message: "Código desconocido. Asócialo en el catálogo antes de escanearlo.",
  };
  const draft = await updateDraft(key, (d) => {
    if (d.receipts[id]) {
      ack = d.receipts[id];
      return d;
    }
    const p = products.find(
      (p) =>
        !p.archived &&
        (p.barcode === code || p.sku.toUpperCase() === code.toUpperCase()),
    );
    if (p) {
      const line = d.lines.find((l) => l.productId === p.id);
      const quantity = Number(line?.quantity || 0) + 1;
      if (!Number.isInteger(quantity) || quantity > 1000000)
        ack = {
          id,
          ok: false,
          message: "Revisa la cantidad de este producto en el PC.",
        };
      else if (d.mode === "sale" && quantity > p.stock)
        ack = {
          id,
          ok: false,
          message: `${p.name}: no hay existencias estimadas suficientes.`,
        };
      else if (!line && d.lines.length >= 50)
        ack = {
          id,
          ok: false,
          message: "Cada operación admite hasta 50 productos.",
        };
      else {
        if (line) line.quantity = String(quantity);
        else
          d.lines.push({
            productId: p.id,
            quantity: "1",
            unitPrice: String((d.mode === "sale" ? p.price : p.cost) / 100),
          });
        ack = { id, ok: true, message: p.name, quantity };
      }
    }
    if (Object.keys(d.receipts).length >= 10000)
      throw Error(
        "Este borrador alcanzó el límite de lecturas. Confirma o descártalo antes de continuar.",
      );
    d.receipts[id] = ack;
    return d;
  });
  return { draft, ack };
}
export async function finishDraft(key: string, id: string) {
  const d = await scannerDB(),
    tx = d.transaction("drafts", "readwrite"),
    prior = await tx.store.get(key);
  if (prior?.id === id) await tx.store.delete(key);
  await tx.done;
}
export async function freezeDraft(
  key: string,
  expectedAt?: number,
  suggestedContact = "",
) {
  const db = await scannerDB(),
    tx = db.transaction("drafts", "readwrite"),
    d = await tx.store.get(key);
  if (!d) throw Error("No encontramos el borrador.");
  if (expectedAt !== undefined && d.updatedAt !== expectedAt)
    throw Error(
      "El borrador cambió en otra pestaña. Cierra y vuelve a abrir para revisarlo antes de confirmar.",
    );
  d.contact ??= suggestedContact;
  d.submitted = true;
  await tx.store.put(d);
  await tx.done;
  return d;
}
export async function reopenDraft(key: string) {
  const d = await scannerDB(),
    tx = d.transaction("drafts", "readwrite"),
    v = await tx.store.get(key);
  if (v) {
    v.submitted = false;
    await tx.store.put(v);
  }
  await tx.done;
}
