import { productSchema, newSku } from "./contracts";
export type ImportProduct = ReturnType<typeof productSchema.parse>;
export type PreviewRow = {
  line: number;
  product: ImportProduct | null;
  errors: string[];
};
const MAX_ROWS = 100,
  MAX_SIZE = 2 * 1024 * 1024;
export function parseCsv(text: string): string[][] {
  if (text.length > MAX_SIZE) throw Error("El archivo supera 2 MB.");
  text = text.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0];
  const delimiter =
    (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
    } else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
      closed = false;
      if (rows.length > MAX_ROWS + 1)
        throw Error("Importa hasta 100 productos por archivo.");
    } else {
      if (closed && c.trim())
        throw Error(
          "CSV no válido: hay texto después de una comilla de cierre.",
        );
      cell += c;
    }
  }
  if (quoted) throw Error("CSV no válido: falta cerrar una comilla.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
function validateZip(buffer: ArrayBuffer) {
  const v = new DataView(buffer);
  if (v.byteLength < 22 || v.getUint32(0, true) !== 0x04034b50)
    throw Error("El archivo no es un XLSX válido.");
  let end = -1;
  for (let i = v.byteLength - 22; i >= Math.max(0, v.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw Error("El archivo XLSX está dañado.");
  const count = v.getUint16(end + 10, true),
    offset = v.getUint32(end + 16, true);
  if (count > 100 || offset >= v.byteLength)
    throw Error("El libro es demasiado complejo. Usa la plantilla.");
  let p = offset,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > v.byteLength || v.getUint32(p, true) !== 0x02014b50)
      throw Error("El archivo XLSX está dañado.");
    if (v.getUint16(p + 8, true) & 1)
      throw Error("No se admiten libros cifrados.");
    total += v.getUint32(p + 24, true);
    if (total > 8 * 1024 * 1024)
      throw Error("El contenido descomprimido supera 8 MB.");
    const n = v.getUint16(p + 28, true),
      extra = v.getUint16(p + 30, true),
      comment = v.getUint16(p + 32, true);
    if (p + 46 + n + extra + comment > v.byteLength)
      throw Error("El archivo XLSX está dañado.");
    const name = new TextDecoder().decode(new Uint8Array(buffer, p + 46, n));
    if (/vbaProject|externalLinks|\.bin$/i.test(name))
      throw Error("No se admiten macros ni enlaces externos.");
    p += 46 + n + extra + comment;
  }
}
export async function validateWorkbookZip(buffer: ArrayBuffer) {
  validateZip(buffer);
  const { Unzip, UnzipInflate } = await import("fflate");
  let total = 0,
    entries = 0,
    finished = 0;
  let failure: Error | null = null;
  const unzip = new Unzip((file) => {
    entries++;
    if (entries > 100 || /vbaProject|externalLinks|\.bin$/i.test(file.name))
      throw Error("El libro contiene elementos no admitidos.");
    file.ondata = (error, chunk, final) => {
      if (error) throw failure ?? Error("El archivo XLSX está dañado.");
      total += chunk.length;
      if (total > 8 * 1024 * 1024) {
        failure = Error("El contenido descomprimido supera 8 MB.");
        file.terminate();
        throw failure;
      }
      if (final) finished++;
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  const data = new Uint8Array(buffer);
  for (let i = 0; i < data.length; i += 1024) {
    unzip.push(
      data.subarray(i, Math.min(i + 1024, data.length)),
      i + 1024 >= data.length,
    );
    if (i % 65536 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (!entries || finished !== entries)
    throw Error("El archivo XLSX está incompleto.");
}
export async function readImportFile(file: File): Promise<string[][]> {
  if (!file.size || file.size > MAX_SIZE)
    throw Error("Selecciona un archivo de hasta 2 MB.");
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  if (!/\.xlsx$/i.test(file.name))
    throw Error("Solo se admiten archivos .csv o .xlsx.");
  const buffer = await file.arrayBuffer();
  await validateWorkbookZip(buffer);
  const Excel = await import("exceljs");
  const Workbook = Excel.Workbook ?? Excel.default.Workbook;
  const book = new Workbook();
  await book.xlsx.load(buffer);
  if (book.worksheets.length !== 1)
    throw Error("El archivo debe tener una sola hoja.");
  const sheet = book.worksheets[0];
  if (sheet.rowCount > MAX_ROWS + 1 || sheet.columnCount > 12)
    throw Error("Usa hasta 100 productos y las columnas de la plantilla.");
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const cells: string[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      const value = row.getCell(c).value;
      if (
        value &&
        typeof value === "object" &&
        ("formula" in value || "sharedFormula" in value || "hyperlink" in value)
      )
        throw Error(
          "No se admiten fórmulas ni hipervínculos. Sustitúyelos por valores.",
        );
      cells.push(
        value == null
          ? ""
          : typeof value === "object"
            ? row.getCell(c).text
            : String(value),
      );
    }
    if (cells.some((c) => c.trim())) rows.push(cells);
  });
  return rows;
}
const headers = [
  "nombre",
  "sku",
  "codigo_barras",
  "categoria",
  "proveedor",
  "unidad",
  "costo",
  "precio",
  "minimo",
];
export function previewImport(
  rows: string[][],
  existing: { sku: string; barcode: string }[],
): PreviewRow[] {
  if (rows.length < 2 || rows.length > MAX_ROWS + 1)
    throw Error("Incluye una cabecera y entre 1 y 100 productos.");
  const actual = rows[0].map((v) =>
    v
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  );
  if (
    actual.length !== headers.length ||
    headers.some((v, i) => actual[i] !== v)
  )
    throw Error(
      "Las columnas deben coincidir con la plantilla: " +
        headers.join(", ") +
        ".",
    );
  const skus = new Set(existing.map((p) => p.sku)),
    barcodes = new Set(existing.map((p) => p.barcode).filter(Boolean));
  return rows.slice(1).map((r, i) => {
    const errors: string[] = [];
    if (r.length !== headers.length)
      errors.push("Número de columnas incorrecto.");
    const decimal = (s: string) => {
      const v = s.trim().replace(",", ".");
      return /^\d+(\.\d{1,2})?$/.test(v) ? Math.round(Number(v) * 100) : NaN;
    };
    const integer = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : NaN);
    const draft = {
      name: r[0] ?? "",
      sku: r[1]?.trim() || newSku(),
      barcode: r[2] ?? "",
      category: r[3] ?? "",
      supplier: r[4] ?? "",
      unit: r[5]?.trim().toLowerCase() || "unidad",
      cost: decimal(r[6] ?? ""),
      price: decimal(r[7] ?? ""),
      minimum: integer(r[8] ?? ""),
    };
    const parsed = productSchema.safeParse(draft);
    if (!parsed.success)
      errors.push(
        ...parsed.error.issues.map((e) => "Revisa " + e.path.join(".") + "."),
      );
    if (parsed.success) {
      if (skus.has(parsed.data.sku))
        errors.push("SKU repetido en el archivo o catálogo.");
      if (parsed.data.barcode && barcodes.has(parsed.data.barcode))
        errors.push("Código de barras repetido.");
      skus.add(parsed.data.sku);
      if (parsed.data.barcode) barcodes.add(parsed.data.barcode);
    }
    return {
      line: i + 2,
      product: parsed.success ? parsed.data : null,
      errors,
    };
  });
}
export const importTemplate =
  "\uFEFF" +
  headers.join(";") +
  "\r\nZapatos deportivos;;;Calzado;Proveedor de ejemplo;unidad;85000;129000;5\r\n";
