interface Env {
  ASSETS: Fetcher;
  NEXO_API: Fetcher;
  APP_ORIGIN: string;
  UPSTREAM_ORIGIN: string;
}
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (
      request.headers.get("Origin") &&
      request.headers.get("Origin") !== env.APP_ORIGIN
    )
      return new Response(null, { status: 403 });
    // This narrow bridge cannot mutate inventory or expose the upstream server credentials.
    const allowed =
      (request.method === "GET" &&
        ["/api/config", "/api/bootstrap", "/api/inventory"].includes(
          url.pathname,
        )) ||
      (request.method === "POST" &&
        ["/api/scanner/grant", "/api/device"].includes(url.pathname));
    if (!allowed) return new Response(null, { status: 404 });
    if (Number(request.headers.get("Content-Length") ?? 0) > 16384)
      return new Response(null, { status: 413 });
    let body: Uint8Array<ArrayBuffer> | undefined;
    if (request.body) {
      const reader = request.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 16384) {
          await reader.cancel();
          return new Response(null, { status: 413 });
        }
        chunks.push(value);
      }
      body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
    }
    const headers = new Headers();
    for (const name of ["Authorization", "Content-Type"])
      if (request.headers.has(name))
        headers.set(name, request.headers.get(name)!);
    headers.set("Origin", env.UPSTREAM_ORIGIN);
    const upstream = new URL(url.pathname + url.search, env.UPSTREAM_ORIGIN);
    const result = await env.NEXO_API.fetch(
      new Request(upstream, {
        method: request.method,
        headers,
        body: body?.buffer,
        redirect: "manual",
      }),
    );
    return new Response(result.body, {
      status: result.status,
      headers: {
        "Content-Type":
          result.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
};
