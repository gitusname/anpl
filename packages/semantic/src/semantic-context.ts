import type {
  FunctionDecl,
  ModuleDecl,
  Program,
  TypeDecl,
  TypeRef
} from "@anpl/ast";
import type { Diagnostic, Span } from "@anpl/core";
import { createDiagnostic } from "@anpl/core";
import type { SymbolTable } from "@anpl/symbols";
import { createSymbolTable } from "@anpl/symbols";
import type { TypeRegistry } from "@anpl/types";
import { createTypeRegistry } from "@anpl/types";

export type SemanticPassName =
  | "collect-modules"
  | "collect-declarations"
  | "resolve-imports"
  | "resolve-symbols"
  | "resolve-types"
  | "check-expressions"
  | "check-returns"
  | "check-records";

export type SemanticPassTrace = {
  name: SemanticPassName;
  diagnosticsBefore: number;
  diagnosticsAfter: number;
};

export type FunctionSymbol = {
  decl: FunctionDecl;
  params: TypeRef[];
  returnType: TypeRef;
};

export type ModuleSymbols = {
  module: ModuleDecl;
  functions: Map<string, FunctionSymbol>;
  types: Map<string, TypeDecl>;
};

export type TypedProgram = {
  program: Program;
  symbols: SymbolTable;
  types: TypeRegistry;
};

export type SemanticContext = {
  program: Program;
  diagnostics: Diagnostic[];
  moduleSymbols: Map<string, ModuleSymbols>;
  symbols: SymbolTable;
  types: TypeRegistry;
  passes: SemanticPassTrace[];
};

export type SemanticDiagnosticInput = {
  code: string;
  message: string;
  span: Span;
  symbol?: string;
  expected?: string;
  received?: string;
};

export function createSemanticContext(program: Program): SemanticContext {
  return {
    program,
    diagnostics: [],
    moduleSymbols: new Map(),
    symbols: createSymbolTable(),
    types: createTypeRegistry(),
    passes: []
  };
}

export function runSemanticPass(
  context: SemanticContext,
  name: SemanticPassName,
  pass: () => void
): void {
  const diagnosticsBefore = context.diagnostics.length;
  pass();
  context.passes.push({
    name,
    diagnosticsBefore,
    diagnosticsAfter: context.diagnostics.length
  });
}

export function addSemanticDiagnostic(
  context: SemanticContext,
  input: SemanticDiagnosticInput
): void {
  context.diagnostics.push(
    createDiagnostic({
      code: input.code,
      severity: "error",
      message: input.message,
      file: input.span.file,
      line: input.span.start.line,
      column: input.span.start.column,
      span: input.span,
      symbol: input.symbol,
      expected: input.expected,
      received: input.received,
      confidence: "high"
    })
  );
}

export function typedProgramFromContext(context: SemanticContext): TypedProgram {
  return {
    program: context.program,
    symbols: context.symbols,
    types: context.types
  };
}
