import { describe, it, expect } from "vitest";
import { inventoryDestination } from "../client/auth-destination";
describe("return after login", () => {
  it("preserves only known internal routes and an explicit company", () => {
    const value = "/app/productos?empresa=20000000-0000-4000-8000-000000000001";
    expect(inventoryDestination(value)).toBe(value);
    expect(
      inventoryDestination("https://evil.test/app/productos"),
    ).toBeUndefined();
    expect(inventoryDestination("//evil.test/app/productos")).toBeUndefined();
    expect(
      inventoryDestination("/app/productos?empresa=invalid"),
    ).toBeUndefined();
    expect(inventoryDestination("/arbitrary")).toBeUndefined();
  });
});
