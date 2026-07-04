import { describe, expect, it } from "vitest";
import { formatDiagnostic } from "./index.js";

describe("diagnostics formatting", () => {
  it("formats structured diagnostics", () => {
    expect(
      formatDiagnostic({
        code: "ANPL_TEST",
        severity: "error",
        message: "Something happened.",
        file: "test.anpl",
        line: 1,
        column: 2,
        confidence: "high"
      })
    ).toContain("test.anpl:1:2 ERROR ANPL_TEST");
  });
});
