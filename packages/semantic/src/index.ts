import type { Program } from "@anpl/ast";
import type { Diagnostic } from "@anpl/core";
import type { SymbolTable } from "@anpl/symbols";
import type { TypeRegistry } from "@anpl/types";
import { checkExpressions } from "./passes/check-expressions.js";
import { checkRecords } from "./passes/check-records.js";
import { checkReturns } from "./passes/check-returns.js";
import { collectDeclarations } from "./passes/collect-declarations.js";
import { collectModules } from "./passes/collect-modules.js";
import { resolveImports } from "./passes/resolve-imports.js";
import { resolveSymbols } from "./passes/resolve-symbols.js";
import { resolveTypes } from "./passes/resolve-types.js";
import {
  createSemanticContext,
  runSemanticPass,
  typedProgramFromContext,
  type SemanticPassTrace,
  type TypedProgram
} from "./semantic-context.js";

export type {
  FunctionSymbol,
  ModuleSymbols,
  SemanticContext,
  SemanticPassName,
  SemanticPassTrace,
  TypedProgram
} from "./semantic-context.js";

export type SemanticResult =
  | {
      ok: true;
      program: Program;
      symbols: SymbolTable;
      types: TypeRegistry;
      typedProgram: TypedProgram;
      diagnostics: [];
      passes: SemanticPassTrace[];
    }
  | {
      ok: false;
      program: Program;
      symbols: SymbolTable;
      types: TypeRegistry;
      typedProgram?: TypedProgram;
      diagnostics: Diagnostic[];
      passes: SemanticPassTrace[];
    };

export function analyzeProgram(program: Program): SemanticResult {
  const context = createSemanticContext(program);

  runSemanticPass(context, "collect-modules", () => collectModules(context));
  runSemanticPass(context, "collect-declarations", () => collectDeclarations(context));
  runSemanticPass(context, "resolve-imports", () => resolveImports(context));
  runSemanticPass(context, "resolve-symbols", () => resolveSymbols(context));
  runSemanticPass(context, "resolve-types", () => resolveTypes(context));
  runSemanticPass(context, "check-records", () => checkRecords(context));
  runSemanticPass(context, "check-expressions", () => checkExpressions(context));
  runSemanticPass(context, "check-returns", () => checkReturns(context));

  if (context.diagnostics.length > 0) {
    return {
      ok: false,
      program,
      symbols: context.symbols,
      types: context.types,
      typedProgram: typedProgramFromContext(context),
      diagnostics: context.diagnostics,
      passes: context.passes
    };
  }

  return {
    ok: true,
    program,
    symbols: context.symbols,
    types: context.types,
    typedProgram: typedProgramFromContext(context),
    diagnostics: [],
    passes: context.passes
  };
}
