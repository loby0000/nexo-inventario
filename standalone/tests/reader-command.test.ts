import { describe, it, expect, vi } from "vitest";
import { readerCompany } from "../client/reader-company";
import { openScannerOperation } from "../client/scanner-command";
describe("reader authorization", () => {
  it("does not substitute an unauthorized QR company with the saved company", () => {
    expect(readerCompany([{ owner: "mine" }], "another", "mine")).toBe("");
    expect(
      readerCompany([{ owner: "mine" }, { owner: "other" }], "mine", "other"),
    ).toBe("mine");
  });
  it("rejects employee purchases and stale commands before opening any form", async () => {
    const open = vi.fn().mockResolvedValue({ ok: true, message: "opened" });
    expect(
      (
        await openScannerOperation(
          { mode: "purchase", revision: 3 },
          "operator",
          3,
          open,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await openScannerOperation(
          { mode: "sale", revision: 2 },
          "admin",
          3,
          open,
        )
      ).ok,
    ).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(
      (
        await openScannerOperation(
          { mode: "sale", revision: 3 },
          "operator",
          3,
          open,
        )
      ).ok,
    ).toBe(true);
    expect(open).toHaveBeenCalledExactlyOnceWith("sale");
  });
});
