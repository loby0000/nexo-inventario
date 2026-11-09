import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  db,
  stage,
  project,
  pending,
  saveSnapshot,
  localView,
  lockUser,
  synchronize,
  type Operation,
} from "../client/offline";
import type { Data } from "../ui/inventory";
const user = "u1",
  company = "c1";
const base: Data = {
  workspace: { owner: company, name: "Empresa A", description: "" },
  workspaces: [],
  invitations: [],
  documents: [],
  products: [
    {
      id: "p1",
      name: "Zapatos",
      sku: "PAP-001",
      barcode: "000123",
      supplier: "Nike",
      category: "Calzado",
      unit: "unidad",
      cost: 100,
      price: 200,
      stock: 2,
      minimum: 0,
      archived: 0,
    },
  ],
  members: [],
  movements: [],
  user: { name: "Prueba", email: "test@nexo.test", role: "admin" },
};
const purchase = () => ({
  action: "document",
  id: crypto.randomUUID(),
  type: "purchase",
  reference: "",
  contact: "Nike",
  note: "",
  lines: [{ productId: "p1", quantity: 3, unitPrice: 100 }],
});
beforeEach(async () => {
  const d = await db();
  await d.clear("snapshots");
  await d.clear("operations");
});
describe("durable offline operations", () => {
  it("allows a sale after an offline product and purchase regardless of UUID sorting", async () => {
    await saveSnapshot(user, company, {...base, products:[]}, true);
    const productId = "f0000000-0000-4000-8000-000000000001";
    const time = Date.now();
    await stage(user, company, {
      action:"product", createId:productId, name:"Prueba offline",
      sku:"OFF-001",barcode:"",category:"Prueba",supplier:"",unit:"unidad",
      cost:100,price:200,minimum:0,
    },time+1);
    const received={...purchase(),id:"00000000-0000-4000-8000-000000000001",lines:[{productId,quantity:3,unitPrice:100}]};
    await stage(user,company,received,time+2);
    expect((await localView(user,company)).products[0].stock).toBe(3);
    await stage(user,company,{...received,id:"70000000-0000-4000-8000-000000000001",type:"sale",lines:[{productId,quantity:1,unitPrice:200}]},time+3);
    expect((await localView(user,company)).products[0].stock).toBe(2);
  });
  it("requires explicit enablement and expires after 24 hours without deleting pending data", async () => {
    await expect(stage(user, company, purchase())).rejects.toThrow(/Conéctate/);
    await saveSnapshot(user, company, base, true);
    const body = purchase();
    await stage(user, company, body);
    await expect(
      stage(user, company, purchase(), Date.now() + 86400001),
    ).rejects.toThrow(/Conéctate/);
    expect(await pending(user)).toHaveLength(1);
  });
  it("persists independently of an open connection and projects estimates", async () => {
    await saveSnapshot(user, company, base, true);
    await stage(user, company, purchase());
    expect((await localView(user, company)).products[0].stock).toBe(5);
    (await db()).close();
    expect((await localView(user, company)).products[0].stock).toBe(5);
    expect(await localView("another", company).catch(() => null)).toBeNull();
  });
  it("does not double-count a committed document after a lost response", async () => {
    await saveSnapshot(user, company, base, true);
    const b = purchase();
    await stage(user, company, b);
    const confirmed = structuredClone(base);
    confirmed.products[0].stock = 5;
    confirmed.documents.push({
      id: b.id,
      type: "purchase",
      reference: "COMPRA",
      contact: "Nike",
      note: "",
      actor: "test",
      total: 300,
      created_at: new Date().toISOString(),
    });
    expect(project(confirmed, await pending(user)).products[0].stock).toBe(5);
  });
  it("checks local quantities and employee permissions", async () => {
    const employee = structuredClone(base);
    employee.user.role = "operator";
    await saveSnapshot(user, company, employee, true);
    await expect(stage(user, company, purchase())).rejects.toThrow(
      /administrador/,
    );
    const sale = { ...purchase(), type: "sale" };
    await expect(stage(user, company, sale)).rejects.toThrow(/supera/);
    sale.lines[0].quantity = 1;
    await stage(user, company, sale);
    expect((await localView(user, company)).products[0].stock).toBe(1);
  });
  it("keeps payload immutable and records product dependencies", async () => {
    await saveSnapshot(user, company, base, true);
    const p = {
      ...base.products[0],
      action: "product",
      createId: crypto.randomUUID(),
      id: undefined,
      sku: "NUEVO",
      barcode: "",
    };
    delete p.id;
    await stage(user, company, p);
    const b = purchase();
    b.lines[0].productId = p.createId;
    await stage(user, company, b);
    expect(
      (await pending(user)).find((o) => o.id === b.id)?.dependencies,
    ).toEqual([p.createId]);
    await expect(
      stage(user, company, { ...b, note: "edited" }),
    ).rejects.toThrow(/otros datos/);
  });
  it("preserves a pending operation when transmission fails, then retries the same identifier", async () => {
    await saveSnapshot(user, company, base, true);
    const b = purchase();
    await stage(user, company, b);
    await synchronize(user, async () => {
      throw Error("lost");
    });
    expect((await pending(user))[0].id).toBe(b.id);
    await synchronize(user, async (op) => {
      expect(op.id).toBe(b.id);
      return { state: "synced" };
    });
    expect(await pending(user)).toHaveLength(0);
  });
  it("locks snapshots on logout while retaining only account-scoped pending operations", async () => {
    await saveSnapshot(user, company, base, true);
    await stage(user, company, purchase());
    await lockUser(user);
    await expect(localView(user, company)).rejects.toThrow();
    expect(await pending(user)).toHaveLength(1);
    expect(await pending("different")).toHaveLength(0);
  });
  it("atomically stores a server receipt before removing the pending estimate", async () => {
    await saveSnapshot(
      user,
      company,
      { ...structuredClone(base), revision: 1 },
      true,
    );
    const b = purchase();
    await stage(user, company, b);
    await synchronize(user, async () => ({
      state: "synced",
      revision: 2,
      products: [{ ...base.products[0], stock: 5 }],
      documents: [
        {
          id: b.id,
          type: "purchase",
          reference: "COMPRA",
          contact: "Nike",
          note: "",
          actor: "test",
          total: 300,
          created_at: new Date().toISOString(),
        },
      ],
    }));
    expect(await pending(user)).toHaveLength(0);
    expect((await localView(user, company)).products[0].stock).toBe(5);
    await saveSnapshot(user, company, {
      ...structuredClone(base),
      revision: 1,
    });
    expect((await localView(user, company)).products[0].stock).toBe(5);
  });
  it("does not unlock a logged-out cache when an older request finishes", async () => {
    await saveSnapshot(user, company, base, true);
    await lockUser(user);
    await saveSnapshot(user, company, base);
    await expect(localView(user, company)).rejects.toThrow();
  });
  it("does not claim a durable save if the device quota is exhausted", async () => {
    await saveSnapshot(user, company, base, true);
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "add")
      .mockImplementationOnce(() => {
        throw new DOMException("Full", "QuotaExceededError");
      });
    await expect(stage(user, company, purchase())).rejects.toThrow("Full");
    spy.mockRestore();
    expect(await pending(user)).toHaveLength(0);
  });
  it("sends a new product before its dependent receipt even when timestamps tie", async () => {
    await saveSnapshot(user, company, base, true);
    const at = Date.now();
    const id = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    await stage(
      user,
      company,
      {
        action: "product",
        createId: id,
        name: "Nuevo",
        sku: "NUEVO",
        barcode: "",
      },
      at,
    );
    const b = { ...purchase(), id: "00000000-0000-4000-8000-000000000001" };
    b.lines[0].productId = id;
    await stage(user, company, b, at);
    const sent: string[] = [];
    await synchronize(user, async (op) => {
      sent.push(op.id);
      return { state: "synced" };
    });
    expect(sent).toEqual([id, b.id]);
  });
});
