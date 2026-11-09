import { z } from "zod";
export const productSchema = z.object({
  name: z.string().trim().min(2).max(100),
  sku: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9._-]*$/)
    .transform((v) => v.toUpperCase())
    .default(""),
  barcode: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9._-]*$/)
    .default(""),
  category: z.string().trim().min(1).max(50),
  supplier: z.string().trim().max(100).default(""),
  unit: z.enum(["unidad", "caja", "kg", "litro", "paquete"]),
  cost: z.number().int().min(0).max(100000000000),
  price: z.number().int().min(0).max(100000000000),
  minimum: z.number().int().min(0).max(1000000),
});
export const movementSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().min(1).max(100),
  type: z.enum(["in", "out"]),
  quantity: z.number().int().min(1).max(1000000),
  note: z.string().trim().min(3).max(300),
});
export const documentSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(["purchase", "sale"]),
    reference: z.string().trim().max(80),
    contact: z.string().trim().max(120),
    note: z.string().trim().max(300),
    lines: z
      .array(
        z.object({
          productId: z.string().min(1).max(100),
          quantity: z.number().int().min(1).max(1000000),
          unitPrice: z.number().int().min(0).max(100000000000),
        }),
      )
      .min(1)
      .max(50),
  })
  .superRefine((v, c) => {
    if (new Set(v.lines.map((l) => l.productId)).size !== v.lines.length)
      c.addIssue({
        code: "custom",
        message: "Hay productos repetidos en la operación.",
      });
    if (
      v.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) >
      100000000000000
    )
      c.addIssue({
        code: "custom",
        message: "El total supera el límite permitido.",
      });
  });
export const importSchema = z.object({
  id: z.string().uuid(),
  rows: z.array(productSchema).min(1).max(100),
});
export function newSku() {
  return (
    "NX-" + crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()
  );
}
export async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
