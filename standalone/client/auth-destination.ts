const pages = new Set(
  [
    "resumen",
    "productos",
    "movimientos",
    "reportes",
    "configuracion",
    "empresas",
    "ventas/nueva",
    "compras/recibir",
  ].map((p) => "/app/" + p),
);
export function inventoryDestination(value: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value, "https://nexo.invalid");
    if (url.origin !== "https://nexo.invalid" || !pages.has(url.pathname))
      return undefined;
    const company = url.searchParams.get("empresa");
    if (
      company &&
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        company,
      )
    )
      return undefined;
    return url.pathname + (company ? "?empresa=" + company : "");
  } catch {
    return undefined;
  }
}
