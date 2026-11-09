import { build } from "esbuild";
import assert from "node:assert/strict";
import Excel from "exceljs";
import { zipSync } from "fflate";
import fs from "node:fs/promises";
await fs.mkdir("work", { recursive: true });
await build({
  entryPoints: ["app/lib/import.ts"],
  bundle: true,
  platform: "node",
  packages: "external",
  format: "esm",
  outfile: "work/import-test-module.mjs",
});
const {
  readImportFile,
  previewImport,
  parseCsv,
  importTemplate,
  validateWorkbookZip,
} = await import("../work/import-test-module.mjs");
let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed++;
  console.log("PASS " + name);
};
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
const sample = [
  "Zapatos",
  "",
  "750000001",
  "Calzado",
  "Proveedor",
  "unidad",
  "85000",
  "129000",
  "5",
];
async function workbook(rows, options = {}) {
  const book = new Excel.Workbook();
  const sheet = book.addWorksheet("Productos");
  for (const row of rows) sheet.addRow(row);
  if (options.secondSheet) book.addWorksheet("Otra");
  return new File([await book.xlsx.writeBuffer()], "productos.xlsx");
}
await test("CSV template produces valid product and automatic SKU", () => {
  const r = previewImport(parseCsv(importTemplate), []);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].errors, []);
  assert.match(r[0].product.sku, /^NX-/);
  assert.equal(r[0].product.cost, 8500000);
});
await test("quoted CSV separators, quotes and newlines", () => {
  const r = parseCsv(
    'a;b;c\r\n"Zapatos; negros";"Texto ""citado""";"dos\nlíneas"',
  );
  assert.deepEqual(r[1], ["Zapatos; negros", 'Texto "citado"', "dos\nlíneas"]);
});
await test("unclosed CSV quote rejected", () =>
  assert.throws(() => parseCsv('a;b\n"no cierra')));
await test("incorrect CSV headers rejected", () =>
  assert.throws(() => previewImport([["wrong"], sample], [])));
await test("negative and fractional minimum rejected", () => {
  const r = previewImport(
    [headers, [...sample.slice(0, 6), "-1", "100", "1.5"]],
    [],
  );
  assert.ok(r[0].errors.length);
});
await test("catalog and within-file duplicate SKU rejected", () => {
  const row = [...sample];
  row[1] = "same";
  let r = previewImport([headers, row], [{ sku: "SAME", barcode: "" }]);
  assert.ok(r[0].errors.length);
  r = previewImport([headers, row, row], []);
  assert.ok(r[1].errors.length);
});
await test("duplicate barcode rejected", () => {
  const r = previewImport(
    [headers, sample],
    [{ sku: "OTHER", barcode: "750000001" }],
  );
  assert.ok(r[0].errors.length);
});
await test("XLSX values parsed and validated", async () => {
  const f = await workbook([headers, sample]);
  const rows = await readImportFile(f);
  assert.equal(rows[1][0], "Zapatos");
  assert.deepEqual(previewImport(rows, [])[0].errors, []);
  await fs.writeFile(
    "work/importacion-verificada.xlsx",
    Buffer.from(await f.arrayBuffer()),
  );
});
await test("XLSX formula rejected", async () => {
  const f = await workbook([headers, [{ formula: "1+1" }, ...sample.slice(1)]]);
  await assert.rejects(() => readImportFile(f), /fórmulas/);
});
await test("multiple sheets rejected", async () =>
  await assert.rejects(
    async () =>
      readImportFile(await workbook([headers, sample], { secondSheet: true })),
    /una sola hoja/,
  ));
await test("XLSX macros rejected", async () => {
  const zip = zipSync({ "vbaProject.bin": new Uint8Array([1, 2]) });
  await assert.rejects(
    () => readImportFile(new File([zip], "macros.xlsx")),
    /macros/,
  );
});
await test("actual decompression limit rejects forged ZIP sizes", async () => {
  const zip = zipSync({
    "xl/worksheets/sheet1.xml": new Uint8Array(9 * 1024 * 1024).fill(65),
  });
  const view = new DataView(zip.buffer);
  for (let i = 0; i < zip.length - 46; i++) {
    if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 1, true);
  }
  await assert.rejects(() => validateWorkbookZip(zip.buffer), /8 MB/);
});
await test("file size and extension limits enforced", async () => {
  await assert.rejects(() => readImportFile(new File(["a"], "a.exe")), /Solo/);
  await assert.rejects(
    () =>
      readImportFile(
        new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.csv"),
      ),
    /2 MB/,
  );
});
await test("more than 100 rows rejected", () =>
  assert.throws(() =>
    previewImport([headers, ...Array.from({ length: 101 }, () => sample)], []),
  ));
console.log(JSON.stringify({ passed }));
