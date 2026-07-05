import { describe, expect, it } from "vitest";
import {
  checkRuntimeLimits,
  createRuntimeHost,
  isEffectAllowed,
  runtimeInt,
  runtimeRecord,
  runtimeText,
  trackRuntimeValue,
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

  it("tracks timeout and memory sandbox limits", () => {
    const timeoutHost = createRuntimeHost(
      {
        maxExecutionMs: 1
      },
      {
        startedAtMs: 0,
        now: () => 2
      }
    );
    const memoryHost = createRuntimeHost({
      maxMemoryMb: 0
    });

    expect(checkRuntimeLimits(timeoutHost)).toMatchObject({
      kind: "timeout",
      expected: "<= 1ms",
      received: "2ms"
    });
    expect(trackRuntimeValue(memoryHost, runtimeText("Ada"))).toMatchObject({
      kind: "memory",
      expected: "<= 0MB"
    });
  });
});
