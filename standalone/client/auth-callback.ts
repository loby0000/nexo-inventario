// Admin-issued invitation links contain an implicit session; ordinary signup and
// recovery keep PKCE. The SDK validates the session, and the API rechecks identity.
export function callbackFlow(url: URL): "implicit" | "pkce" {
  const hash = new URLSearchParams(url.hash.slice(1));
  return url.pathname === "/auth/callback" &&
    hash.get("type") === "invite" &&
    !!hash.get("access_token") && !!hash.get("refresh_token")
    ? "implicit" : "pkce";
}
