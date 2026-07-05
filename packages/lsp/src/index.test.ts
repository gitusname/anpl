import { describe, expect, it } from "vitest";
import { lspStatus } from "./index.js";

describe("lsp package status", () => {
  it("declares planned language-server capabilities", () => {
    expect(lspStatus.implemented).toBe(false);
    expect(lspStatus.plannedCapabilities).toContain("diagnostics");
  });
});
