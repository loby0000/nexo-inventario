import { scannerIssuer, scannerSite } from "./scanner-environment";
import { scannerDB, type Credential } from "./scanner-store";
import { db, localKey } from "./offline";
import {
  verifyGrant,
  publicKeySchema,
  signedGrantSchema,
  type DeviceGrant,
} from "../shared/scanner-protocol";
import { useEffect, useState } from "react";
import { z } from "zod";
type Api = (path: string, body?: unknown) => Promise<unknown>;
type Access = Awaited<ReturnType<typeof scannerCredential>>;
export async function scannerCredential(
  user: string,
  company: string,
  api: Api,
): Promise<{ credential: Credential; grant: DeviceGrant }> {
  const store = await scannerDB(),
    key = localKey(user, company);
  let c = await store.get("credentials", key);
  if (!c) {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    );
    const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
    c = {
      key,
      device: crypto.randomUUID(),
      privateKey: pair.privateKey,
      publicKey: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y },
    };
    await store.put("credentials", c);
  }
  try {
    const result = z
      .object({ grant: signedGrantSchema, verifyKey: publicKeySchema })
      .parse(
        await api("scanner/grant?company=" + company, {
          device: c.device,
          publicKey: c.publicKey,
        }),
      );
    const verified = await verifyGrant(
      result.grant,
      result.verifyKey,
      scannerIssuer(),
    );
    if (
      verified.user !== user ||
      verified.company !== company ||
      verified.device !== c.device ||
      verified.publicKey.x !== c.publicKey.x ||
      verified.publicKey.y !== c.publicKey.y
    )
      throw Error("La autorización no corresponde a este dispositivo.");
    c = {
      ...c,
      grant: result.grant,
      verifyKey: result.verifyKey,
      issuer: scannerIssuer(),
    };
    await store.put("credentials", c);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status !== 0 && status !== 503) throw e;
    const s = await (await db()).get("snapshots", key);
    if (
      !s?.enabled ||
      s.locked ||
      Date.now() < s.validatedAt ||
      Date.now() - s.validatedAt >= 86400000
    )
      throw Error(
        "Prepara este equipo con conexión antes de usar el escáner sin internet.",
      );
  }
  if (!c.grant || !c.verifyKey || c.issuer !== scannerIssuer())
    throw Error("Conéctate para preparar este escáner.");
  const grant = await verifyGrant(c.grant, c.verifyKey, scannerIssuer());
  if (
    grant.user !== user ||
    grant.company !== company ||
    grant.device !== c.device ||
    grant.publicKey.x !== c.publicKey.x ||
    grant.publicKey.y !== c.publicKey.y
  )
    throw Error("La autorización pertenece a otra cuenta o empresa.");
  return { credential: c, grant };
}

// Validate before the user clicks Connect: a network timeout must not consume
// the gesture needed for Chrome's local-network permission prompt.
export function useScannerAccess(user: string, company: string, api: Api) {
  const [access, setAccess] = useState<Access>(),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setAccess(undefined);
    setError("");
    void scannerCredential(user, company, api)
      .then((value) => {
        if (alive) setAccess(value);
      })
      .catch((e) => {
        if (alive) setError((e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [user, company, api, attempt]);
  return {
    access,
    accessError: error,
    retryAccess: () => setAttempt((n) => n + 1),
  };
}
