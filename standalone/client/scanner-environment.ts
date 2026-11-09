let issuer: string | undefined;
let scannerOrigin = (globalThis.location?.hostname ?? "").includes("validacion")
  ? "https://nexo-escaner-validacion.loby207.workers.dev"
  : "https://nexo-escaner.loby207.workers.dev";
export function configureScanner(config: {
  issuer?: string;
  scannerOrigin?: string;
}) {
  if (config.issuer) issuer = new URL(config.issuer).origin;
  if (config.scannerOrigin)
    scannerOrigin = new URL(config.scannerOrigin).origin;
}
export const scannerIssuer = () =>
  issuer ?? globalThis.location?.origin ?? "http://localhost";
export const scannerSite = () => scannerOrigin;
