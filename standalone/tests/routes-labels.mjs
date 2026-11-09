import { createRequire } from "node:module";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import {
  MultiFormatReader,
  BinaryBitmap,
  RGBLuminanceSource,
  HybridBinarizer,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";
const { chromium } = createRequire(
  resolve(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json",
  ),
)("playwright");
const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    downloadsPath: resolve("standalone/work/routes-qa/downloads"),
  }),
  context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const origin = "http://127.0.0.1:5191",
  company = "20000000-0000-4000-8000-000000000001";
await mkdir("standalone/work/routes-qa", { recursive: true });
await context.route(origin + "/qa/faults.js", (r) =>
  r.fulfill({ contentType: "application/javascript", body: "" }),
);
await page.addInitScript(() => {
  const create = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    if (blob instanceof Blob && blob.type === "image/png")
      window.__generatedLabel = blob;
    return create(blob);
  };
});
try {
  await page.request.post(origin + "/qa/availability", {
    data: { online: true },
  });
  await page.goto(origin + "/app/productos?empresa=" + company);
  await page
    .getByLabel("Correo electrónico", { exact: true })
    .fill("admin@nexo.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("Prueba-nexo-2026");
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await page.getByRole("link", { name: /^Productos/ }).click();
  await page.getByRole("heading", { name: "Productos", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Productos", exact: true }).waitFor();
  assert(page.url().includes("empresa=" + company));
  await page
    .getByRole("button", {
      name: "Ver código y etiqueta de Tenis de prueba",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "Código y etiqueta" });
  await dialog.waitFor();
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Descargar etiqueta PNG" }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "TEN-001-etiqueta.png");
  const bytes = await page.evaluate(async () =>
    Array.from(new Uint8Array(await window.__generatedLabel.arrayBuffer())),
  );
  const image = await sharp(Buffer.from(bytes)).metadata();
  assert.equal(image.width, 600);
  assert.equal(image.height, 360);
  const gray = await sharp(Buffer.from(bytes))
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer();
  const decoded = new MultiFormatReader().decode(
    new BinaryBitmap(
      new HybridBinarizer(
        new RGBLuminanceSource(new Uint8ClampedArray(gray), 600, 360),
      ),
    ),
    new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]]]),
  );
  assert.equal(decoded.getText(), "TEN-001");
  await page.screenshot({
    path: "standalone/work/routes-qa/product-label.png",
  });
  await page.emulateMedia({ media: "print" });
  const box = await page.locator(".barcode-label").first().boundingBox();
  assert(Math.abs(box.width - (50 * 96) / 25.4) < 1);
  assert(Math.abs(box.height - (30 * 96) / 25.4) < 1);
  await page.pdf({
    path: "standalone/work/routes-qa/labels.pdf",
    format: "A4",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  await dialog.getByRole("button", { name: "Cerrar" }).click();
  await page.getByRole("link", { name: "Configuración", exact: true }).click();
  await page
    .getByRole("heading", { name: "Configuración", exact: true })
    .waitFor();
  await page.goBack();
  await page.getByRole("heading", { name: "Productos", exact: true }).waitFor();
  await page.goForward();
  await page
    .getByRole("heading", { name: "Configuración", exact: true })
    .waitFor();
  await page.goto(
    origin + "/app/productos?empresa=99999999-9999-4999-8999-999999999999",
  );
  await page
    .getByRole("alert")
    .filter({ hasText: "No tienes acceso a la empresa de esta dirección" })
    .waitFor();
  assert(page.url().includes("/app/empresas"));
  console.log(
    "PASS: routes, reload, back/forward, explicit company isolation, on-demand PNG decoded as TEN-001 and 50x30 mm print layout. Native downloads are blocked in this QA browser (also for a trivial text Blob); physical save/printing remains unverified.",
  );
} catch (e) {
  await page.screenshot({ path: "standalone/work/routes-qa/failure.png" });
  throw e;
} finally {
  await browser.close();
}
