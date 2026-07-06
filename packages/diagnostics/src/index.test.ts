import { describe, expect, it } from "vitest";
import {
  diagnosticsToJson,
  diagnosticsToYaml,
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
    expect(getDiagnosticDefinition("ANPL_RUNTIME_INVALID_MEMBER_ACCESS")).toMatchObject({
      category: "runtime",
      aiRepairable: true
    });
  });

  it("covers emitted diagnostic codes in the registry", () => {
    const emittedCodes = [
      "ANPL_CALL_ARG_COUNT_MISMATCH",
      "ANPL_COMPILER_ERROR",
      "ANPL_ENUM_EMPTY",
      "ANPL_FIELD_NOT_FOUND",
      "ANPL_LEX_INVALID_CHAR",
      "ANPL_PARSE_EXPECTED_ARROW",
      "ANPL_PARSE_EXPECTED_COLON",
      "ANPL_PARSE_EXPECTED_EQUAL",
      "ANPL_PARSE_EXPECTED_IDENTIFIER",
      "ANPL_PARSE_EXPECTED_LBRACE",
      "ANPL_PARSE_EXPECTED_LPAREN",
      "ANPL_PARSE_EXPECTED_RBRACE",
      "ANPL_PARSE_EXPECTED_RBRACKET",
      "ANPL_PARSE_EXPECTED_RPAREN",
      "ANPL_PARSE_EXPECTED_TYPE",
      "ANPL_PARSE_UNEXPECTED_TOKEN",
      "ANPL_PROJECT_AMBIGUOUS_MODULE_IMPORT",
      "ANPL_PROJECT_DEPENDENCY_NOT_FOUND",
      "ANPL_PROJECT_DUPLICATE_MODULE",
      "ANPL_PROJECT_ENTRY_NOT_FOUND",
      "ANPL_PROJECT_INIT_EXISTS",
      "ANPL_PROJECT_INIT_HOST_READONLY",
      "ANPL_PROJECT_INVALID_MANIFEST",
      "ANPL_PROJECT_NO_SOURCES",
      "ANPL_PROJECT_SOURCE_NOT_FOUND",
      "ANPL_PROJECT_SOURCE_PATTERN_UNREADABLE",
      "ANPL_PROJECT_SOURCE_READ_ERROR",
      "ANPL_PROJECT_UNKNOWN_MODULE",
      "ANPL_RETURN_MISSING",
      "ANPL_RETURN_TYPE_MISMATCH",
      "ANPL_RUNTIME_EFFECT_BLOCKED",
      "ANPL_RUNTIME_ENTRY_AMBIGUOUS",
      "ANPL_RUNTIME_ENTRY_NOT_FOUND",
      "ANPL_RUNTIME_ERROR",
      "ANPL_RUNTIME_FUNCTION_NOT_FOUND",
      "ANPL_RUNTIME_INVALID_CONDITION",
      "ANPL_RUNTIME_INVALID_MEMBER_ACCESS",
      "ANPL_RUNTIME_LIMIT_EXCEEDED",
      "ANPL_RUNTIME_UNDEFINED_VALUE",
      "ANPL_RUNTIME_UNEXPECTED_VALUE",
      "ANPL_SEMANTIC_DUPLICATE_SYMBOL",
      "ANPL_SEMANTIC_IMPORT_CONFLICT",
      "ANPL_SEMANTIC_IMPORT_SELF",
      "ANPL_SEMANTIC_UNKNOWN_MODULE",
      "ANPL_SEMANTIC_UNKNOWN_SYMBOL",
      "ANPL_TYPE_MISMATCH",
      "ANPL_UNSUPPORTED_TARGET"
    ];

    expect(emittedCodes.filter((code) => getDiagnosticDefinition(code) === undefined)).toEqual([]);
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

  it("serializes enriched diagnostics as YAML", () => {
    const yaml = diagnosticsToYaml([
      {
        code: "ANPL_TYPE_MISMATCH",
        severity: "error",
        message: "Expected int but received text.",
        expected: "int",
        received: "text",
        confidence: "high"
      }
    ]);

    expect(yaml).toContain("- code: ANPL_TYPE_MISMATCH");
    expect(yaml).toContain("category: type");
    expect(yaml).toContain("fix:");
  });

  it("explains diagnostic codes", () => {
    expect(explainDiagnosticCode("ANPL_PROJECT_NO_SOURCES")).toMatchObject({
      code: "ANPL_PROJECT_NO_SOURCES",
      category: "project",
      summary: expect.stringContaining("project diagnostic")
    });
    expect(explainDiagnosticCode("ANPL_RETURN_MISSING")).toMatchObject({
      code: "ANPL_RETURN_MISSING",
      category: "semantic",
      aiRepairable: true
    });
    expect(explainDiagnosticCode("ANPL_RUNTIME_ENTRY_NOT_FOUND")).toMatchObject({
      code: "ANPL_RUNTIME_ENTRY_NOT_FOUND",
      category: "runtime",
      summary: expect.stringContaining("runtime diagnostic")
    });
  });
});
