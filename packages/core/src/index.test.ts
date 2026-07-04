import { describe, expect, expectTypeOf, it } from "vitest";
import type { Diagnostic, GeneratedFile, Result, SourceFile, Span } from "./index.js";
import { createDiagnostic, createSpan } from "./index.js";

const start = {
  offset: 0,
  line: 1,
  column: 1
};

const end = {
  offset: 11,
  line: 1,
  column: 12
};

describe("core primitives", () => {
  it("models source files and spans", () => {
    const source: SourceFile = {
      path: "examples/math.anpl",
      content: "module math"
    };
    const span = createSpan(source.path, start, end);

    expect(span.file).toBe(source.path);
    expect(span.start.line).toBe(1);
    expectTypeOf(span).toMatchTypeOf<Span>();
  });

  it("models structured AI-readable diagnostics", () => {
    const span = createSpan("examples/math.anpl", start, end);
    const diagnostic = createDiagnostic({
      code: "ANPL_TYPE_MISMATCH",
      severity: "error",
      message: "Expected int but received text.",
      expected: "int",
      received: "text",
      fix: "Convert the expression to int or update the function return type.",
      span,
      confidence: "high"
    });

    expect(diagnostic.code).toBe("ANPL_TYPE_MISMATCH");
    expect(diagnostic.confidence).toBe("high");
    expectTypeOf(diagnostic).toMatchTypeOf<Diagnostic>();
  });

  it("models typed pipeline results and generated files", () => {
    const ok: Result<GeneratedFile> = {
      ok: true,
      value: {
        path: "generated/anpl.js",
        content: "export {};"
      }
    };

    const failure: Result<GeneratedFile> = {
      ok: false,
      diagnostics: [
        {
          code: "ANPL_PARSE_UNEXPECTED_TOKEN",
          severity: "error",
          message: "Unexpected token.",
          confidence: "high"
        }
      ]
    };

    expect(ok.ok).toBe(true);
    expect(failure.ok).toBe(false);
    expectTypeOf(ok).toMatchTypeOf<Result<GeneratedFile>>();
  });
});
