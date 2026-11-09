import { spawnSync } from "node:child_process";
import { mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const base = resolve(import.meta.dirname, ".."),
  work = resolve(base, "work"),
  sdk = process.env.NEXO_DOTNET ?? resolve(work, "dotnet/dotnet.exe");
const production=process.argv.includes('--production');
const env = {
  ...process.env,
  DOTNET_CLI_HOME: resolve(work, "dotnet-home"),
  NUGET_PACKAGES: resolve(
    process.env.USERPROFILE,
    "Documents/Codex/nexo-tools/nuget",
  ),
  DOTNET_CLI_TELEMETRY_OPTOUT: "1",
  DOTNET_NOLOGO: "1",
  APPDATA: resolve(work, "dotnet-home/roaming"),
};
env.NUGET_HTTP_CACHE_PATH = resolve(work, "nuget-http-cache");
env.NUGET_PLUGINS_CACHE_PATH = resolve(work, "nuget-plugins-cache");
await mkdir(env.APPDATA, { recursive: true });
const project = resolve(import.meta.dirname, "NexoConnector.csproj"),
  out = resolve(work, "connector-release");
function run(args) {
  const r = spawnSync(sdk, args, { env, stdio: "inherit" });
  if (r.status !== 0) throw Error("No se pudo compilar Conector Nexo.");
}
run([
  "restore",
  project,
  "--configfile",
  resolve(import.meta.dirname, "NuGet.Config"),
  "-r",
  "win-x64",
]);
run([
  "publish",
  project,
  "-c",
  "Release",
  "-r",
  "win-x64",
  "--self-contained",
  "true",
  "--no-restore",
  "-o",
  out,
  '-p:NexoProduction='+(production?'true':'false'),
]);
const dest = resolve(base, "public/downloads");
await mkdir(dest, { recursive: true });
for (const name of await readdir(dest))
  if (name.startsWith("NexoConnector.")) await rm(resolve(dest, name));
const binary = await readFile(resolve(out, "NexoConnector.exe")),
  hash = createHash("sha256").update(binary).digest("hex"),
  parts = [];
for (let offset = 0; offset < binary.length; offset += 8 * 1024 * 1024) {
  const chunk = binary.subarray(offset, offset + 8 * 1024 * 1024),
    name = `NexoConnector.${hash.slice(0, 12)}.${parts.length}.bin`;
  await writeFile(resolve(dest, name), chunk);
  parts.push({
    file: name,
    bytes: chunk.length,
    sha256: createHash("sha256").update(chunk).digest("hex"),
  });
}
await writeFile(
  resolve(dest, "connector.json"),
  JSON.stringify(
    {
      version: "2.0.0",
      platform: "windows-x64",
      environment:production?'production':'validation',
      file: "NexoConnector.exe",
      bytes: binary.length,
      sha256: hash,
      parts,
    },
    null,
    2,
  ) + "\n",
);
console.log("Conector compilado. SHA-256:", hash);
