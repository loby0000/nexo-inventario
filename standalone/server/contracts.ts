import { z } from "zod";
import {
  productSchema,
  documentSchema,
  movementSchema,
  importSchema,
} from "../ui/lib/contracts";
const id = z.string().uuid();
export function validateAction(input: unknown): Record<string, unknown> {
  const b = z.record(z.string(), z.unknown()).parse(input);
  switch (b.action) {
    case "product":
      return {
        action: b.action,
        ...productSchema.parse(b),
        ...(b.id
          ? { id: z.string().max(100).parse(b.id) }
          : { createId: id.parse(b.createId) }),
      };
    case "document":
      return { action: b.action, ...documentSchema.parse(b) };
    case "movement":
      return { action: b.action, ...movementSchema.parse(b) };
    case "import":
      return { action: b.action, ...importSchema.parse(b) };
    case "workspace":
      return {
        action: b.action,
        ...z
          .object({
            name: z.string().trim().min(2).max(60),
            description: z.string().trim().max(160),
          })
          .parse(b),
      };
    case "archive":
      return {
        action: b.action,
        ...z
          .object({ id: z.string().max(100), archived: z.boolean() })
          .parse(b),
      };
    case "member":
      return {
        action: b.action,
        ...z.object({ email: z.string().trim().email().max(160) }).parse(b),
      };
    case "removeMember":
    case "resendInvitation":
      return { action: b.action, id: id.parse(b.id) };
    default:
      throw Error("Acción no permitida.");
  }
}
export const syncSchema = z.object({
  id,
  user: id,
  company: id,
  body: z.record(z.string(), z.unknown()),
  dependencies: z.array(id).max(51),
  createdAt: z.iso.datetime(),
});
