import { describe, expect, it } from "vitest";
import { listStdlibModules } from "./index.js";

describe("stdlib", () => {
  it("exposes core builtins", () => {
    const [core] = listStdlibModules();

    expect(core?.name).toBe("anpl.core");
    expect(Object.keys(core?.builtins ?? {})).toContain("len");
  });
});
