// Real Windows executable + two simulated clients. Not evidence of Android compatibility.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const origin = "https://nexo-inventario-validacion.loby207.workers.dev",
  endpoint = "http://127.0.0.1:47832";
const child = spawn(
  resolve(import.meta.dirname, "../work/connector-release/NexoConnector.exe"),
  ["--headless", "--dev"],
  {
    windowsHide: true,
    stdio: "pipe",
    env: {
      ...process.env,
      NEXO_CONNECTOR_TEST_PORT:"47832",
      DOTNET_BUNDLE_EXTRACT_BASE_DIR: resolve(
        import.meta.dirname,
        "../work/extract",
      ),
      DOTNET_ENVIRONMENT: "Production",
    },
  },
);
const call = async (path, method = "GET", token, body, customOrigin = /\/(claim|phone)(?:\?|$)/.test(path)?"https://nexo-escaner-validacion.loby207.workers.dev":origin) =>
  fetch(endpoint + path, {
    method,
    headers: {
      Origin: customOrigin,
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
try {
  let ready = false;
  for (let i = 0; i < 200; i++) {
    try {
      if ((await call("/v1/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert(ready, "Connector did not start");
  assert.equal((await (await call("/v1/health")).json()).protocol,2);
  assert.equal(
    (await call("/v1/health", "GET", undefined, undefined, "https://evil.test"))
      .status,
    403,
  );
  assert.equal((await fetch(endpoint + "/v1/health")).status, 403);
  const options = await call("/v1/sessions", "OPTIONS");
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("Access-Control-Allow-Origin"), origin);
  const s = await (await call("/v1/sessions", "POST", undefined, {})).json();
  assert(s.session && s.hostToken && s.joinToken);
  assert.equal((await call(`/v1/sessions/${s.session}/claim`,"POST",s.joinToken,{},"https://nexo-escaner.loby207.workers.dev")).status,410);
  assert.equal((await call("/v1/sessions","POST",undefined,{},"https://nexo-escaner-validacion.loby207.workers.dev")).status,403);
  assert.equal(
    (await call(`/v1/sessions/${s.session}/claim`, "POST", "wrong", {})).status,
    403,
  );
  const p = await (
    await call(`/v1/sessions/${s.session}/claim`, "POST", s.joinToken, {})
  ).json();
  assert(p.token);
  assert.equal(
    (await call(`/v1/sessions/${s.session}/claim`, "POST", s.joinToken, {}))
      .status,
    403,
  );
  assert.equal(
    (await call(`/v1/sessions/${s.session}/host`, "GET", p.token)).status,
    403,
  );
  const packet = { v: 1, iv: "a".repeat(16), data: "opaque-ciphertext" };
  assert(
    (await call(`/v1/sessions/${s.session}/phone`, "POST", p.token, packet)).ok,
  );
  const messages = await (
    await call(`/v1/sessions/${s.session}/host?after=0`, "GET", s.hostToken)
  ).json();
  assert.equal(messages.packets.length, 1);
  assert.deepEqual(messages.packets[0].packet, packet);
  assert.equal(
    (
      await (
        await call(
          `/v1/sessions/${s.session}/host?after=${messages.packets[0].sequence}`,
          "GET",
          s.hostToken,
        )
      ).json()
    ).packets.length,
    0,
  );
  assert.equal(
    (
      await call(`/v1/sessions/${s.session}/host`, "POST", s.hostToken, {
        v: 1,
        iv: "a",
        data: "x".repeat(30000),
      })
    ).status,
    400,
  );
  assert(
    (await call(`/v1/sessions/${s.session}/host`, "DELETE", s.hostToken)).ok,
  );
  assert.equal(
    (await call(`/v1/sessions/${s.session}/phone`, "GET", p.token)).status,
    410,
  );
  console.log(
    "PASS: real Windows connector, origin boundary, CORS, one-use pairing, role capabilities, bounded packets, polling receipts and closure. Android/LAN hardware remains unverified.",
  );
} finally {
  child.kill();
}
