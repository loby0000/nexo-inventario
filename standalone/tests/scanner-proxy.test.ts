import { describe, it, expect, vi } from "vitest";
import scanner from "../server/scanner-worker";
import { detectPlatform } from "../client/device-platform";
const origin = "https://nexo-escaner.loby207.workers.dev",
  upstream = "https://nexo-inventario.loby207.workers.dev";
describe("independent reader bridge", () => {
  it("forwards identity through its bound server and rejects stock mutations", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true })),
      env = {
        APP_ORIGIN: origin,
        UPSTREAM_ORIGIN: upstream,
        ASSETS: { fetch },
        NEXO_API: { fetch },
      } as any;
    const response = await scanner.fetch(
      new Request(origin + "/api/scanner/grant?company=x", {
        method: "POST",
        headers: {
          Origin: origin,
          Authorization: "Bearer user-session",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      env,
    );
    expect(response.status).toBe(200);
    const forwarded = fetch.mock.calls[0][0] as Request;
    expect(forwarded.url).toBe(upstream + "/api/scanner/grant?company=x");
    expect(forwarded.headers.get("Origin")).toBe(upstream);
    expect(forwarded.headers.get("Authorization")).toBe("Bearer user-session");
    fetch.mockClear();
    expect(
      (
        await scanner.fetch(
          new Request(origin + "/api/inventory", { method: "POST" }),
          env,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await scanner.fetch(
          new Request(origin + "/api/bootstrap", {
            headers: { Origin: "https://evil.test" },
          }),
          env,
        )
      ).status,
    ).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});
describe("platform guidance", () => {
  it("recognizes touch Windows as PC and Android as phone", () => {
    expect(
      detectPlatform({
        userAgent: "Mozilla Windows",
        platform: "Win32",
        maxTouchPoints: 10,
      }),
    ).toBe("windows");
    expect(
      detectPlatform({
        userAgent: "Mozilla Android",
        platform: "Linux arm",
        maxTouchPoints: 5,
      }),
    ).toBe("android");
  });
});
