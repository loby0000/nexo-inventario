import { scannerDB, type ScanAck } from "./scanner-store";
export type ScannerTarget = {
  draft: string;
  busy?:()=>boolean;
  mode: "sale" | "purchase";
  companyName: string;
  read: (id: string, code: string) => Promise<ScanAck>;
};
export async function routeScannerRead(
  user: string,
  company: string,
  current: ScannerTarget | undefined,
  id: string,
  code: string,
  requestedDraft: string,
): Promise<ScanAck> {
  if (current?.draft === requestedDraft) return current.read(id, code);
  const prior = (await (await scannerDB()).getAll("drafts")).find(
    (d) => d.user === user && d.company === company && d.id === requestedDraft,
  )?.receipts[id];
  if (prior)
    return { ...prior, message: prior.message + " · operación anterior" };
  return {
    id,
    ok: false,
    message:
      "Esta lectura pertenece a una operación cerrada. Revisa su cantidad antes de repetirla.",
  };
}
