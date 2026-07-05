import type {
  FunctionDecl,
  ModuleDecl,
  Program,
  TypeDecl,
  TypeRef
} from "@anpl/ast";
import type { Diagnostic, DiagnosticCategory, DiagnosticRepair, Span } from "@anpl/core";
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
  cause?: string;
  fix?: string;
  evidence?: string[];
  repair?: DiagnosticRepair;
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
  const detail = semanticDiagnosticDetail(input);
  context.diagnostics.push(
    createDiagnostic({
      code: input.code,
      severity: "error",
      category: detail.category,
      message: input.message,
      file: input.span.file,
      line: input.span.start.line,
      column: input.span.start.column,
      span: input.span,
      symbol: input.symbol,
      expected: input.expected,
      received: input.received,
      cause: input.cause ?? detail.cause,
      fix: input.fix ?? detail.fix,
      evidence: input.evidence ?? detail.evidence,
      repair: input.repair,
      confidence: "high"
    })
  );
}

function semanticDiagnosticDetail(input: SemanticDiagnosticInput): {
  category: DiagnosticCategory;
  cause: string;
  fix: string;
  evidence: string[];
} {
  const symbol = input.symbol ?? "<unknown>";
  const evidence = [
    `span ${input.span.start.line}:${input.span.start.column}-${input.span.end.line}:${input.span.end.column}`
  ];

  switch (input.code) {
    case "ANPL_TYPE_MISMATCH":
      return {
        category: "type",
        cause: `Semantic analysis inferred ${input.received ?? "unknown"} where ${input.expected ?? "another type"} is required.`,
        fix: "Change the expression type, add a conversion, or update the declaration to match the inferred type.",
        evidence
      };
    case "ANPL_RETURN_TYPE_MISMATCH":
      return {
        category: "type",
        cause: `The returned expression type ${input.received ?? "unknown"} does not match the declared return type ${input.expected ?? "unknown"}.`,
        fix: "Return a value of the declared type or change the function return type.",
        evidence
      };
    case "ANPL_RETURN_MISSING":
      return {
        category: "semantic",
        cause: `Function '${symbol}' can reach the end without returning ${input.expected ?? "a value"}.`,
        fix: "Add a return statement on every control-flow path or change the return type to void.",
        evidence
      };
    case "ANPL_CALL_ARG_COUNT_MISMATCH":
      return {
        category: "semantic",
        cause: `Call to '${symbol}' uses ${input.received ?? "an unexpected number of"} arguments instead of ${input.expected ?? "the declared number"}.`,
        fix: "Add missing arguments, remove extra arguments, or update the function signature.",
        evidence
      };
    case "ANPL_SEMANTIC_UNKNOWN_SYMBOL":
      return {
        category: "semantic",
        cause: `Symbol '${symbol}' is not visible in the current module scope.`,
        fix: "Declare the symbol, import its module, or correct the symbol name.",
        evidence
      };
    case "ANPL_SEMANTIC_UNKNOWN_MODULE":
      return {
        category: "semantic",
        cause: `Imported module '${symbol}' is not present in the semantic module table.`,
        fix: "Add the missing module source file or correct the import name.",
        evidence
      };
    case "ANPL_SEMANTIC_DUPLICATE_SYMBOL":
      return {
        category: "semantic",
        cause: `Symbol '${symbol}' is declared more than once in a scope that requires unique names.`,
        fix: "Rename one declaration or remove the duplicate declaration.",
        evidence
      };
    case "ANPL_SEMANTIC_IMPORT_SELF":
      return {
        category: "semantic",
        cause: `Module '${symbol}' imports itself.`,
        fix: "Remove the self-import from the module.",
        evidence
      };
    case "ANPL_SEMANTIC_IMPORT_CONFLICT":
      return {
        category: "semantic",
        cause: `Imported symbol '${symbol}' conflicts with a local or previously imported symbol.`,
        fix: "Rename one symbol or import a narrower symbol set.",
        evidence
      };
    case "ANPL_FIELD_NOT_FOUND":
      return {
        category: "semantic",
        cause: `Field '${symbol}' is not declared on the target record type.`,
        fix: "Use an existing field name or add the field to the record type.",
        evidence
      };
    case "ANPL_ENUM_EMPTY":
      return {
        category: "type",
        cause: "Enum type references must include at least one variant.",
        fix: "Add one or more enum variants, for example enum[active, archived].",
        evidence
      };
    default:
      return {
        category: "semantic",
        cause: "Semantic analysis found a program invariant violation.",
        fix: "Inspect the semantic diagnostic and update the relevant declaration or expression.",
        evidence
      };
  }
}

export function typedProgramFromContext(context: SemanticContext): TypedProgram {
  return {
    program: context.program,
    symbols: context.symbols,
    types: context.types
  };
}
