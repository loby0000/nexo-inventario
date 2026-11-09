// Own isolated QA profiles and a validation fixture; never attaches to user Chrome.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  MultiFormatReader,
  BinaryBitmap,
  RGBLuminanceSource,
  HybridBinarizer,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";
const hostOrigin = "https://nexo-inventario-validacion.loby207.workers.dev",
  readerOrigin = "https://nexo-escaner-validacion.loby207.workers.dev",
  relay = "http://127.0.0.1:47832",
  config = await (await fetch(hostOrigin + "/api/config")).json();
assert.equal(config.url, "https://ddxosemcisemyhywmfkj.supabase.co");
const cachePath = ".sites-runtime/nexo-qa-auth-sessions.json",
  cache = JSON.parse(await readFile(cachePath, "utf8"));
const r = await fetch(config.url + "/auth/v1/token?grant_type=refresh_token", {
  method: "POST",
  headers: { apikey: config.key, "Content-Type": "application/json" },
  body: JSON.stringify({ refresh_token: cache.adminA.refresh_token }),
});
assert(r.ok);
const session = await r.json();
session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
cache.adminA = { refresh_token: session.refresh_token };
await writeFile(cachePath, JSON.stringify(cache));
const api = async (path) => {
    const r = await fetch(hostOrigin + "/api/" + path, {
      headers: { Authorization: "Bearer " + session.access_token },
    });
    assert(r.ok);
    return r.json();
  },
  boot = await api("bootstrap"),
  company = boot.workspaces.find((w) => w.role === "admin").owner,
  data = await api("inventory?company=" + company),
  product = data.products.find((p) => !p.archived);
assert(product, "Need an existing catalog product for local-draft-only test");
const { chromium } = createRequire(
  resolve(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json",
  ),
)("playwright");
const child = spawn(
    resolve("standalone/work/connector-release/NexoConnector.exe"),
    ["--headless", "--dev"],
    {
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        NEXO_CONNECTOR_TEST_PORT: "47832",
        DOTNET_BUNDLE_EXTRACT_BASE_DIR: resolve("standalone/work/extract"),
      },
    },
  ),
  browser = await chromium.launch({ channel: "chrome", headless: true });
const contexts = [];
await mkdir("standalone/work/reader-qa", { recursive: true });
async function page(origin, mobile) {
  const c = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  contexts.push(c);
  await c.addInitScript(
    ({ origin, session }) => {
      if (
        location.origin === origin &&
        !localStorage.getItem("qa-session-seeded")
      ) {
        localStorage.setItem(
          "sb-ddxosemcisemyhywmfkj-auth-token",
          JSON.stringify(session),
        );
        localStorage.setItem("qa-session-seeded", "1");
      }
    },
    { origin, session },
  );
  await c.route(/^http:\/\/[^/]+:47831\//, async (route) => {
    const q = route.request(),
      headers = await q.allHeaders();
    if (q.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Authorization,Content-Type",
        },
      });
      return;
    }
    const u = new URL(q.url()),
      response = await fetch(relay + u.pathname + u.search, {
        method: q.method(),
        headers: {
          Origin: origin,
          ...(headers.authorization
            ? { Authorization: headers.authorization }
            : {}),
          ...(q.postData() ? { "Content-Type": "application/json" } : {}),
        },
        body: q.postData() ?? undefined,
      });
    await route.fulfill({
      status: response.status,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Content-Type":
          response.headers.get("content-type") ?? "application/octet-stream",
      },
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  const p = await c.newPage();
  await p.goto(origin + (mobile ? "/" : "/app/resumen?empresa=" + company));
  return p;
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if (
        (await fetch(relay + "/v1/health", { headers: { Origin: hostOrigin } }))
          .ok
      )
        break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const host = await page(hostOrigin, false),
    phone = await page(readerOrigin, true);
  await host
    .getByRole("button", { name: "Conectar celular", exact: true })
    .waitFor();
  await phone.getByLabel("Empresa", { exact: true }).selectOption(company);
  await phone
    .getByText("Preparar para cortes de internet", { exact: true })
    .click();
  await phone
    .getByRole("button", { name: "Habilitar lector sin internet", exact: true })
    .click();
  await phone
    .getByRole("button", { name: "Renovar acceso sin internet", exact: true })
    .waitFor();
  await host
    .getByRole("button", { name: "Conectar celular", exact: true })
    .click();
  await host
    .getByRole("button", { name: "Comprobar conector", exact: true })
    .click();
  const canvas = host.locator('canvas[data-ready="true"]');
  await canvas.waitFor();
  const png = Buffer.from(
      (await canvas.evaluate((c) => c.toDataURL())).split(",")[1],
      "base64",
    ),
    pixels = await sharp(png)
      .removeAlpha()
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
  const qr = new MultiFormatReader()
    .decode(
      new BinaryBitmap(
        new HybridBinarizer(
          new RGBLuminanceSource(
            new Uint8ClampedArray(pixels.data),
            pixels.info.width,
            pixels.info.height,
          ),
        ),
      ),
      new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]]]),
    )
    .getText();
  assert.equal(new URL(qr).origin, readerOrigin);
  await phone.goto(qr);
  await phone
    .getByRole("button", { name: "Conectar a este PC", exact: true })
    .click();
  assert.equal(new URL(phone.url()).hash, "");
  await host
    .getByRole("button", { name: "Permitir este celular", exact: true })
    .click();
  await phone.getByText("Conectado al PC", { exact: true }).waitFor();
  await host
    .getByRole("button", { name: /Volver a la operación|Continuar en Nexo/ })
    .click();
  await phone
    .getByRole("button", { name: "Recibir compra", exact: true })
    .click();
  await host
    .getByRole("dialog", { name: "Recibir compra", exact: true })
    .waitFor();
  await phone
    .locator(".scanner-document")
    .filter({ hasText: "Compra" })
    .waitFor();
  await phone.getByLabel("SKU o código manual").fill(product.sku);
  await phone
    .getByRole("button", { name: "Añadir una unidad", exact: true })
    .click();
  await phone
    .getByText("Añadido al borrador del PC", { exact: true })
    .waitFor();
  assert.equal(
    await host.getByLabel("Cantidad de " + product.name).inputValue(),
    "1",
  );
  await host
    .getByRole("button", { name: "Guardar y cerrar", exact: true })
    .click();
  await phone
    .getByText("En pausa · Abre una compra o venta en el PC", { exact: true })
    .waitFor();
  await phone.screenshot({
    path: "standalone/work/reader-qa/independent-reader.png",
  });
  await host.screenshot({ path: "standalone/work/reader-qa/pc-paired.png" });
  await contexts[1].setOffline(true);
  await phone.reload();
  await phone.getByText("Escáner Nexo", { exact: true }).waitFor();
  await phone
    .getByRole("button", { name: "Activar cámara", exact: true })
    .waitFor();
  assert.equal(await phone.locator('a[download$=".exe"]').count(), 0);
  await phone.screenshot({
    path: "standalone/work/reader-qa/offline-reopened.png",
  });
  console.log(
    "PASS: independent reader origin, canonical production-of-validation issuer, real Supabase fixture session, cross-origin native pairing, remote purchase, durable local-only scan, paused link and offline shell reopening. No inventory confirmed; Android hardware and first login remain separate tests.",
  );
} catch (e) {
  for (let i = 0; i < contexts.length; i++)
    await contexts[i]
      .pages()[0]
      ?.screenshot({ path: `standalone/work/reader-qa/failure-${i}.png` })
      .catch(() => {});
  throw e;
} finally {
  await browser.close();
  child.kill();
}
