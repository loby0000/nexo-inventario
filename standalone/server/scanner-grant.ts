import {
  grantSchema,
  signText,
  type DeviceGrant,
  type SignedGrant,
} from "../shared/scanner-protocol";
export async function issueScannerGrant(
  privateJwk: string,
  grant: DeviceGrant,
): Promise<SignedGrant> {
  const payload = JSON.stringify(grantSchema.parse(grant));
  const key = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(privateJwk),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return { payload, signature: await signText(key, payload) };
}
