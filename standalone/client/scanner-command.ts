export async function openScannerOperation(
  command: { mode: "sale" | "purchase"; revision: number },
  role: "admin" | "operator",
  revision: number,
  open: (
    mode: "sale" | "purchase",
  ) => Promise<{ ok: boolean; message: string }>,
) {
  if (command.revision !== revision)
    return { ok: false, message: "La operación cambió. Vuelve a elegirla." };
  if (command.mode === "purchase" && role !== "admin")
    return {
      ok: false,
      message: "Solo el administrador puede recibir compras.",
    };
  return open(command.mode);
}
