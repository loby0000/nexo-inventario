import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureOfflineShell } from "../client/offline-shell";
afterEach(() => vi.unstubAllGlobals());
function serviceWorker(ready: boolean,current=true,protocol=2) {
  const register = vi.fn().mockResolvedValue({});
  vi.stubGlobal("navigator", { serviceWorker: {
    register,
    ready: Promise.resolve({ active: {
      scriptURL: "https://nexo.test/sw.js",
      postMessage: (message: {requiredAsset:string}, ports: MessagePort[]) => ports[0].postMessage({type:"NEXO_SHELL_READY",protocol,ready,...(current?{asset:message.requiredAsset}:{})}),
    }}),
  }});
  return register;
}
describe("offline activation requires the application shell", () => {
  it("requires the canonical offline navigation protocol even if the JS asset is unchanged",async()=>{serviceWorker(true,true,1);await expect(ensureOfflineShell()).rejects.toThrow(/actualización/);});
  it("requires service worker support", async () => {
    vi.stubGlobal("navigator", {});
    await expect(ensureOfflineShell()).rejects.toThrow(/archivos/);
  });
  it("accepts an installed worker only after its assets are confirmed", async () => {
    const register = serviceWorker(true);
    await expect(ensureOfflineShell()).resolves.toBeUndefined();
    expect(register).toHaveBeenCalledWith("/sw.js");
  });
  it("rejects an incomplete cache instead of confirming offline readiness", async () => {
    serviceWorker(false);
    await expect(ensureOfflineShell()).rejects.toThrow(/archivos/);
  });
  it("reports registration failure without confirming readiness", async () => {
    serviceWorker(true);
    navigator.serviceWorker.register = vi.fn().mockRejectedValue(Error("blocked"));
    await expect(ensureOfflineShell()).rejects.toThrow(/archivos/);
  });
  it('does not prepare the new scanner using an older application cache',async()=>{
    serviceWorker(true,false);await expect(ensureOfflineShell()).rejects.toThrow(/actualización/);
  });
});
