import { describe, expect, it } from "vitest";
import {
  diagnosticsToJson,
  enrichDiagnostic,
  explainDiagnosticCode,
  formatDiagnostic,
  getDiagnosticDefinition
} from "./index.js";

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

  it("exposes a diagnostic registry", () => {
    expect(getDiagnosticDefinition("ANPL_TYPE_MISMATCH")).toMatchObject({
      category: "type",
      causeTemplate: "A value was used where a different ANPL type is required.",
      aiRepairable: true
    });
  });

  it("enriches diagnostics with registry metadata for AI repair loops", () => {
    const diagnostic = enrichDiagnostic({
      code: "ANPL_TYPE_MISMATCH",
      severity: "error",
      message: "Expected int but received text.",
      expected: "int",
      received: "text",
      confidence: "high"
    });

    expect(diagnostic).toMatchObject({
      category: "type",
      cause: "A value was used where a different ANPL type is required.",
      fix: "Change the expression type or update the declaration/signature."
    });
    expect(diagnosticsToJson([diagnostic])).toContain('"category": "type"');
  });

  it("explains diagnostic codes", () => {
    expect(explainDiagnosticCode("ANPL_PROJECT_NO_SOURCES")).toMatchObject({
      code: "ANPL_PROJECT_NO_SOURCES",
      category: "project",
      summary: expect.stringContaining("project diagnostic")
    });
  });
});
