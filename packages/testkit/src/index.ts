import type { Program } from "@anpl/ast";
import type { Diagnostic } from "@anpl/core";
import { parseAnpl } from "@anpl/parser";
import { analyzeProgram } from "@anpl/semantic";

export type TestProgramResult =
  | {
      ok: true;
      program: Program;
      diagnostics: [];
    }
  | {
      ok: false;
      diagnostics: Diagnostic[];
    };

export function parseAndAnalyze(source: string, file = "test.anpl"): TestProgramResult {
  const parsed = parseAnpl(source, file);
  if (!parsed.ok) {
    return {
      ok: false,
      diagnostics: parsed.diagnostics
    };
  }

  const semantic = analyzeProgram(parsed.program);
  if (!semantic.ok) {
    return {
      ok: false,
      diagnostics: semantic.diagnostics
    };
  }

  return {
    ok: true,
    program: parsed.program,
    diagnostics: []
  };
}

export function diagnosticCodes(diagnostics: Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}
