import { describe, expect, it } from "vitest";
import {
  checkRuntimeLimits,
  createRuntimeHost,
  effectCapability,
  isEffectAllowed,
  isKnownEffect,
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
    expect(isKnownEffect("process.spawn")).toBe(true);
    expect(isKnownEffect("unknown.effect")).toBe(false);
    expect(effectCapability("process.spawn")).toBe("process");
  });

  it("requires both effect allow-list and capability gates", () => {
    const defaultHost = createRuntimeHost({
      allowedEffects: ["io.read", "net.request", "process.spawn"]
    });
    const processHost = createRuntimeHost({
      allowProcess: true,
      allowedEffects: ["process.spawn"]
    });
    const filesystemHost = createRuntimeHost({
      allowFileSystem: true,
      allowedEffects: ["io.read"]
    });
    const networkHost = createRuntimeHost({
      allowNetwork: true,
      allowedEffects: ["net.request"]
    });

    expect(isEffectAllowed(defaultHost.sandbox, "io.read")).toBe(false);
    expect(isEffectAllowed(defaultHost.sandbox, "net.request")).toBe(false);
    expect(isEffectAllowed(defaultHost.sandbox, "process.spawn")).toBe(false);
    expect(isEffectAllowed(processHost.sandbox, "process.spawn")).toBe(true);
    expect(isEffectAllowed(filesystemHost.sandbox, "io.read")).toBe(true);
    expect(isEffectAllowed(networkHost.sandbox, "net.request")).toBe(true);
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
