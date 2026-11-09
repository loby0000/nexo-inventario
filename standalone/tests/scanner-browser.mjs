// Isolated QA only: synthetic local auth/database, real connector, desktop Chromium.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  MultiFormatReader,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";
const runtime =
  process.env.NEXO_BROWSER_MODULES ??
  resolve(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json",
  );
const { chromium } = createRequire(runtime)("playwright");
const root = resolve(import.meta.dirname, "../.."),
  screens = resolve(root, "standalone/work/scanner-qa");
await mkdir(screens, { recursive: true });
const reuseConnector = true;
const qaRelay="http://127.0.0.1:47832";
const relayOrigin = "https://nexo-inventario-validacion.loby207.workers.dev";
const ownedSessions = [];
const connector = spawn(
      resolve(root, "standalone/work/connector-release/NexoConnector.exe"),
      ["--headless", "--dev"],
      {
        windowsHide: true,
        stdio: "ignore",
        env: {
          ...process.env,
          NEXO_CONNECTOR_TEST_PORT:"47832",
          DOTNET_BUNDLE_EXTRACT_BASE_DIR: resolve(
            root,
            "standalone/work/extract",
          ),
        },
      },
    );
const browser = await chromium.launch({ channel: "chrome", headless: true });
const contexts = [];
const origin = "http://127.0.0.1:5191";
async function login(mobile = false) {
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  await context.route(origin+"/qa/faults.js",route=>route.fulfill({status:200,contentType:"application/javascript",body:""}));
  if (reuseConnector)
    await context.route(/^http:\/\/[^/]+:47831\//, async (route) => {
      const request = route.request();
      const headers = await request.allHeaders();
      if (request.method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
          },
        });
        return;
      }
      // Dedicated QA sessions only. The already-open connector is not stopped,
      // and no existing production session or document is read or modified.
      const relayUrl = new URL(request.url());
      const response = await fetch(
        qaRelay + relayUrl.pathname + relayUrl.search,
        {
          method: request.method(),
          headers: {
            Origin: relayOrigin,
            ...(headers.authorization
              ? { Authorization: headers.authorization }
              : {}),
            ...(request.postData()
              ? { "Content-Type": "application/json" }
              : {}),
          },
          body: request.postData() ?? undefined,
          signal: AbortSignal.timeout(4000),
        },
      );
      const body = Buffer.from(await response.arrayBuffer());
      if (!response.ok)
        console.log(
          "QA bridge response",
          request.method(),
          relayUrl.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "SESSION"),
          response.status,
        );
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/v1/sessions" &&
        response.ok
      ) {
        const own = JSON.parse(body.toString());
        ownedSessions.push({ id: own.session, token: own.hostToken });
      }
      await route.fulfill({
        status: response.status,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Content-Type": response.headers.get("content-type") ?? "text/plain",
        },
        body,
      });
    });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => {
    throw e;
  });
  await page.goto(origin);
  await page
    .getByLabel("Correo electrónico", { exact: true })
    .fill("admin@nexo.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("Prueba-nexo-2026");
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Registrar venta", exact: true })
    .first()
    .waitFor();
  return page;
}
function decodeQR(pixels, w, h) {
  const reader = new MultiFormatReader();
  const hints = new Map([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]],
  ]);
  const bitmap = new BinaryBitmap(
    new HybridBinarizer(
      new RGBLuminanceSource(new Uint8ClampedArray(pixels), w, h),
    ),
  );
  return reader.decode(bitmap, hints).getText();
}
try {
  for(let i=0;i<100;i++){try{if((await fetch(qaRelay+"/v1/health",{headers:{Origin:relayOrigin}})).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  await fetch(origin+"/qa/availability",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({online:true})});
  const host = await login(),
    phone = await login(true);
  console.log("QA: signed into two isolated contexts");
  async function prepare(page) {
    await page.locator(".workspace-actions>summary").click();
    await page
      .getByRole("button", {
        name: "Habilitar este equipo para trabajar sin internet",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Habilitar y guardar copia local" })
      .click();
    await page
      .getByRole("dialog", { name: "Preparar equipo sin internet" })
      .waitFor({ state: "hidden" });
  }
  await prepare(host);
  await prepare(phone);
  await host.request.post(origin + "/qa/availability", {
    data: { online: false },
  });
  console.log(
    "QA: both devices prepared; central API unavailable before pairing",
  );
  await host
    .getByRole("button", { name: "Conectar celular", exact: true }).last()
    .click();
  await host.getByRole("button", { name: "Comprobar conector" }).click();
  const canvas = host.getByRole("img", {
    name: "QR para conectar el celular a esta operación",
  });
  await canvas.waitFor();
  await host.waitForFunction(
    () =>
      document.querySelector(
        'canvas[aria-label="QR para conectar el celular a esta operación"]',
      )?.dataset.ready === "true",
  );
  // Read the displayed canvas's pixels, avoiding fractional CSS screenshot resampling.
  // Real optical recognition remains a separate Android acceptance test.
  const png = Buffer.from(
    (await canvas.evaluate((c) => c.toDataURL("image/png"))).split(",")[1],
    "base64",
  );
  await writeFile(resolve(screens, "qr.png"), png);
  const image = await sharp(png)
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const qr = decodeQR(image.data, image.info.width, image.info.height);
  console.log("QA: pairing QR decoded");
  await host.screenshot({ path: resolve(screens, "pc-pairing.png") });
  await phone.getByRole("button", { name: "Abrir menú" }).click();
  await phone.getByRole("button", { name: "Escáner y etiquetas" }).click();
  await phone.getByRole("button", { name: "Usar como lector del PC" }).click();
  await phone
    .getByText("Introducir el código de conexión", { exact: true })
    .click();
  await phone.getByLabel("Código NEXO1").fill(qr);
  await phone
    .getByRole("button", { name: "Conectar a este PC", exact: true })
    .click();
  console.log("QA: phone requested pairing");
  await host.getByRole("button", { name: "Permitir este celular" }).click();
  await phone.getByText("Conectado al PC", { exact: true }).waitFor();
  await host.getByRole("button", { name:/Volver a la operación|Continuar en Nexo/ }).click();
  await phone.locator(".phone-scanner").getByRole("button",{name:"Venta",exact:true}).click();
  await host.getByRole("dialog",{name:"Registrar venta",exact:true}).waitFor();
  await phone.locator(".scanner-document").filter({hasText:"Venta"}).waitFor();
  let droppedAck = false;
  const compactQR=new URLSearchParams(new URL(qr).hash.slice(1)).get("vincular");
  const peerSecret = await crypto.subtle.importKey(
    "raw",
    Buffer.from(compactQR.split(":")[4], "hex"),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const peerSession = compactQR.split(":")[1].toLowerCase();
  await host.route(
    "http://127.0.0.1:47831/v1/sessions/*/host",
    async (route) => {
      let isAck = false;
      if (route.request().method() === "POST") {
        const packet = route.request().postDataJSON();
        const plaintext = await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: Buffer.from(packet.iv, "base64url"),
            additionalData: new TextEncoder().encode(peerSession),
          },
          peerSecret,
          Buffer.from(packet.data, "base64url"),
        );
        isAck = JSON.parse(new TextDecoder().decode(plaintext)).type === "ack";
      }
      if (isAck && !droppedAck) {
        droppedAck = true;
        await route.fulfill({
          status: 200,
          headers: { "Access-Control-Allow-Origin": origin },
          body: "",
        });
      } else await route.fallback();
    },
  );
  await phone.getByLabel("SKU o código manual").fill("0001234567890");
  await phone.getByRole("button", { name: "Añadir una unidad" }).click();
  await phone
    .getByText("Añadido al borrador del PC", { exact: true })
    .waitFor();
  assert.equal(
    await host.getByLabel("Cantidad de Tenis de prueba").inputValue(),
    "1",
  );
  assert(droppedAck, "Lost acknowledgement fixture was not exercised");
  await phone.screenshot({ path: resolve(screens, "phone-connected.png") });
  await host.screenshot({ path: resolve(screens, "pc-draft.png") });
  // Unknown codes do not create a product or add a unit.
  await phone.getByLabel("SKU o código manual").fill("UNKNOWN");
  await phone.getByRole("button", { name: "Añadir una unidad" }).click();
  await phone
    .getByText(
      "Código desconocido. Asócialo en el catálogo antes de escanearlo.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await host.getByLabel("Cantidad de Tenis de prueba").inputValue(),
    "1",
  );
  // Closing the document pauses reads without tearing down the paired channel.
  await host
    .getByRole("button", { name: "Guardar y cerrar", exact: true })
    .click();
  await phone
    .getByText("En pausa · Abre una compra o venta en el PC", { exact: true })
    .waitFor();
  assert(await phone.getByText("Conectado al PC", { exact: true }).isVisible());
  await host.screenshot({ path: resolve(screens, "pc-paired-paused.png") });
  await phone.screenshot({ path: resolve(screens, "phone-paired-paused.png") });
  await phone.getByLabel("SKU o código manual").fill("0001234567890");
  assert.equal(
    await phone.getByRole("button", { name: "Añadir una unidad" }).isEnabled(),
    false,
  );
  await host.getByRole("link", { name: /^Productos \d+$/ }).click();
  await host.getByRole("link", { name: "Resumen", exact: true }).click();
  await phone.locator(".phone-scanner").getByRole("button",{name:"Recibir compra",exact:true}).click();
  await phone
    .locator(".scanner-document")
    .filter({ hasText: "Compra" })
    .waitFor();
  await phone.getByRole("button", { name: "Añadir una unidad" }).click();
  await phone
    .getByText("Añadido al borrador del PC", { exact: true })
    .waitFor();
  assert.equal(
    await host.getByLabel("Cantidad de Tenis de prueba").inputValue(),
    "1",
  );
  await host
    .getByRole("button", { name: "Guardar y cerrar", exact: true })
    .click();
  await phone
    .getByText("En pausa · Abre una compra o venta en el PC", { exact: true })
    .waitFor();
  await phone.locator(".phone-scanner").getByRole("button",{name:"Venta",exact:true}).click();
  await phone
    .locator(".scanner-document")
    .filter({ hasText: "Venta" })
    .waitFor();
  await phone.getByLabel("SKU o código manual").fill("0001234567890");
  await phone.getByRole("button", { name: "Añadir una unidad" }).click();
  await host.getByLabel("Cantidad de Tenis de prueba").waitFor();
  await phone
    .getByText("2 unidades en la operación", { exact: true })
    .waitFor();
  assert.equal(
    await host.getByLabel("Cantidad de Tenis de prueba").inputValue(),
    "2",
  );
  // The relay being reachable is not proof that the other browser is present.
  const routePattern = "http://127.0.0.1:47831/v1/sessions/*/host";
  await host.route(routePattern, async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": origin },
        body: "",
      });
    else await route.fallback();
  });
  await phone.getByText("Sin enlace con el PC", { exact: true }).waitFor();
  await host.unroute(routePattern);
  await phone.getByText("Conectado al PC", { exact: true }).waitFor();
  await host.reload();
  await host.getByRole("dialog",{name:"Registrar venta"}).waitFor();
  assert.equal(
    await host.getByLabel("Cantidad de Tenis de prueba").inputValue(),
    "2",
  );
  await host
    .getByRole("button", { name: "Confirmar venta", exact: true })
    .click();
  await host
    .getByRole("dialog", { name: "Registrar venta" })
    .waitFor({ state: "hidden" });
  await host
    .getByText("1 operaciones pendientes de este equipo", { exact: true })
    .waitFor();
  await host.request.post(origin + "/qa/availability", {
    data: { online: true },
  });
  await host.getByRole("button", { name: "Sincronizar", exact: true }).click();
  await host
    .getByText("1 operaciones pendientes de este equipo", { exact: true })
    .waitFor({ state: "hidden" });
  for (const p of [host, phone])
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  await writeFile(
    resolve(screens, "result.json"),
    JSON.stringify(
      {
        passed: [
          "offline preparation then new local pairing with central API unavailable",
          "QR decoded by ZXing",
          "explicit host approval",
          "encrypted scan added durably despite intentionally lost first ACK and phone retry",
          "unknown barcode rejected",
          "reload preserves draft",
          "closing documents pauses the paired phone; purchases and sales resume without another QR",
          "explicit offline sale confirmation and subsequent synchronization",
          "mobile viewport without horizontal overflow",
          "peer heartbeat detects lost browser link while the connector remains reachable",
        ],
        hardwareVerified: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: two isolated Chrome clients + real Windows connector. Screenshots in standalone/work/scanner-qa. Android radio/camera remain unverified.",
  );
} catch (e) {
  console.error("Browser QA failed:", e.message);
  for (let i = 0; i < contexts.length; i++)
    await contexts[i]
      .pages()[0]
      ?.screenshot({ path: resolve(screens, "failure-" + i + ".png") })
      .catch(() => {});
  throw e;
} finally {
  await fetch(origin + "/qa/availability", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ online: true }),
  }).catch(() => {});
  for (const own of ownedSessions)
    await fetch(qaRelay+"/v1/sessions/" + own.id + "/host", {
      method: "DELETE",
      headers: { Origin: relayOrigin, Authorization: "Bearer " + own.token },
    }).catch(() => {});
  connector?.kill();
  await browser.close({ reason: "QA complete" });
}
