// Only the isolated validation Worker. Private signing material never enters assets.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
const root = resolve(import.meta.dirname, "../.."),
  file = resolve(root, ".sites-runtime/nexo-scanner-validation-signing.json");
let key;
try {
  key = JSON.parse(await readFile(file, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT")
    throw Error("No se pudo leer la clave local del escáner.");
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  key = await crypto.subtle.exportKey("jwk", pair.privateKey);
  await writeFile(file, JSON.stringify(key), "utf8");
}
const child = spawn(
  process.execPath,
  [
    resolve(root, "standalone/cloudflare.mjs"),
    "secret",
    "put",
    "SCANNER_SIGNING_KEY",
    "--config",
    "standalone/wrangler.validation.jsonc",
  ],
  { cwd: root, windowsHide: true, stdio: ["pipe", "inherit", "inherit"] },
);
child.stdin.end(JSON.stringify(key));
await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("exit", (code) =>
    code === 0
      ? resolve()
      : reject(Error("No se configuró la firma en validación.")),
  );
});
