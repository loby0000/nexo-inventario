import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    barcode: text("barcode").notNull().default(""),
    category: text("category").notNull(),
    supplier: text("supplier").notNull().default(""),
    unit: text("unit").notNull().default("unidad"),
    cost: integer("cost").notNull(),
    price: integer("price").notNull(),
    stock: integer("stock").notNull().default(0),
    minimum: integer("minimum").notNull().default(5),
    archived: integer("archived").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("product_owner_sku").on(t.owner, t.sku),
    uniqueIndex("product_owner_barcode")
      .on(t.owner, t.barcode)
      .where(sql`${t.barcode} <> ''`),
    check(
      "product_nonnegative",
      sql`${t.stock} >= 0 AND ${t.cost} >= 0 AND ${t.price} >= 0 AND ${t.minimum} >= 0`,
    ),
  ],
);
export const movements = sqliteTable(
  "movements",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    type: text("type").notNull(),
    quantity: integer("quantity").notNull(),
    note: text("note").notNull(),
    actor: text("actor").notNull(),
    documentId: text("document_id"),
    unitPrice: integer("unit_price"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    check(
      "movement_valid",
      sql`${t.quantity} > 0 AND ${t.type} IN ('in','out')`,
    ),
  ],
);
export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    userId: text("user_id"),
    accepted: integer("accepted").notNull().default(0),
  },
  (t) => [uniqueIndex("member_owner_email").on(t.owner, t.email)],
);

export const workspaces = sqliteTable("workspaces", {
  owner: text("owner").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});
export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    type: text("type").notNull(),
    reference: text("reference").notNull(),
    contact: text("contact").notNull(),
    note: text("note").notNull(),
    actor: text("actor").notNull(),
    total: integer("total").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    check(
      "document_valid",
      sql`${t.type} IN ('purchase','sale') AND ${t.total} >= 0`,
    ),
  ],
);
export const requests = sqliteTable("requests", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  payloadHash: text("payload_hash").notNull(),
  createdAt: text("created_at").notNull(),
});
