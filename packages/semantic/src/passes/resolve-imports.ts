import type { ImportDecl, TypeDecl } from "@anpl/ast";
import {
  addSemanticDiagnostic,
  type FunctionSymbol,
  type ModuleSymbols,
  type SemanticContext
} from "../semantic-context.js";

export function importsFor(moduleSymbols: ModuleSymbols): ImportDecl[] {
  return moduleSymbols.module.body.filter((decl): decl is ImportDecl => decl.kind === "ImportDecl");
}

export function resolveVisibleSymbols(
  context: SemanticContext,
  localSymbols: ModuleSymbols
): ModuleSymbols {
  const functions = new Map(localSymbols.functions);
  const types = new Map(localSymbols.types);

  for (const importDecl of importsFor(localSymbols)) {
    if (importDecl.module === localSymbols.module.name) {
      addSemanticDiagnostic(context, {
        code: "ANPL_SEMANTIC_IMPORT_SELF",
        message: `Module '${localSymbols.module.name}' cannot import itself.`,
        span: importDecl.span,
        symbol: importDecl.module
      });
      continue;
    }

    const importedSymbols = context.moduleSymbols.get(importDecl.module);
    if (importedSymbols === undefined) {
      addSemanticDiagnostic(context, {
        code: "ANPL_SEMANTIC_UNKNOWN_MODULE",
        message: `Module '${importDecl.module}' is not defined.`,
        span: importDecl.span,
        symbol: importDecl.module
      });
      continue;
    }

    mergeImportedSymbols(context, importDecl, importedSymbols, functions, types);
  }

  return {
    module: localSymbols.module,
    functions,
    types
  };
}

function mergeImportedSymbols(
  context: SemanticContext,
  importDecl: ImportDecl,
  importedSymbols: ModuleSymbols,
  functions: Map<string, FunctionSymbol>,
  types: Map<string, TypeDecl>
): void {
  const names = importDecl.names ?? [
    ...importedSymbols.functions.keys(),
    ...importedSymbols.types.keys()
  ];

  for (const name of names) {
    const importedFunction = importedSymbols.functions.get(name);
    const importedType = importedSymbols.types.get(name);

    if (importedFunction === undefined && importedType === undefined) {
      addSemanticDiagnostic(context, {
        code: "ANPL_SEMANTIC_UNKNOWN_SYMBOL",
        message: `Module '${importDecl.module}' does not export '${name}'.`,
        span: importDecl.span,
        symbol: name
      });
      continue;
    }

    if (importedFunction !== undefined) {
      if (functions.has(name)) {
        addSemanticDiagnostic(context, {
          code: "ANPL_SEMANTIC_IMPORT_CONFLICT",
          message: `Imported function '${name}' conflicts with an existing function.`,
          span: importDecl.span,
          symbol: name
        });
      } else {
        functions.set(name, importedFunction);
      }
    }

    if (importedType !== undefined) {
      if (types.has(name)) {
        addSemanticDiagnostic(context, {
          code: "ANPL_SEMANTIC_IMPORT_CONFLICT",
          message: `Imported type '${name}' conflicts with an existing type.`,
          span: importDecl.span,
          symbol: name
        });
      } else {
        types.set(name, importedType);
      }
    }
  }
}
