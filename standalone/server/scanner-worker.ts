import {API_HEADERS,apiResponse,boundedJson,HttpError} from "./http-security";
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
      return apiResponse({error:"Origen no permitido."},403);
    if(request.headers.get("Sec-Fetch-Site")==="cross-site")return apiResponse({error:"Origen no permitido."},403);
    // This narrow bridge cannot mutate inventory or expose the upstream server credentials.
    const allowed =
      (request.method === "GET" &&
        ["/api/config", "/api/bootstrap", "/api/inventory"].includes(
          url.pathname,
        )) ||
      (request.method === "POST" &&
        ["/api/scanner/grant", "/api/device"].includes(url.pathname));
    if (!allowed) return apiResponse({error:"Ruta no encontrada."},404);
    let body: Uint8Array<ArrayBuffer> | undefined;
    if(request.method === "POST") {
      try { body=new TextEncoder().encode(JSON.stringify(await boundedJson(request,16384))); }
      catch(e){return apiResponse({error:e instanceof HttpError?e.message:"Revisa los datos enviados."},e instanceof HttpError?e.status:400);}
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
        ...API_HEADERS,
        ...(result.headers.has("Retry-After")?{"Retry-After":result.headers.get("Retry-After")!}:{}),
        "Content-Type":
          result.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
};
