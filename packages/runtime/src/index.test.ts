import { describe, expect, it } from "vitest";
import {
  createRuntimeHost,
  isEffectAllowed,
  runtimeInt,
  runtimeRecord,
  runtimeText,
  runtimeValueToDisplay,
  runtimeValueToJs
} from "./index.js";

describe("runtime values", () => {
  it("models tagged runtime values and display conversion", () => {
    const record = runtimeRecord(
      "Customer",
      new Map([
        ["name", runtimeText("Ada")],
        ["orders", runtimeInt(2)]
      ])
    );

    expect(runtimeValueToDisplay(record)).toBe("{ name: Ada, orders: 2 }");
    expect(runtimeValueToJs(record)).toEqual({
      name: "Ada",
      orders: 2
    });
  });

  it("checks sandbox effects", () => {
    const host = createRuntimeHost({
      allowedEffects: ["console.print"]
    });

    expect(isEffectAllowed(host.sandbox, "console.print")).toBe(true);
    expect(isEffectAllowed(host.sandbox, "random.uuid")).toBe(false);
  });
});
