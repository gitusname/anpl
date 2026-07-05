import { addSymbol, createModuleId, createSymbolId } from "@anpl/symbols";
import {
  addSemanticDiagnostic,
  type SemanticContext
} from "../semantic-context.js";

export function collectModules(context: SemanticContext): void {
  for (const moduleDecl of context.program.modules) {
    if (context.moduleSymbols.has(moduleDecl.name)) {
      addSemanticDiagnostic(context, {
        code: "ANPL_SEMANTIC_DUPLICATE_SYMBOL",
        message: `Module '${moduleDecl.name}' is already defined.`,
        span: moduleDecl.span,
        symbol: moduleDecl.name
      });
      continue;
    }

    const moduleId = createModuleId(moduleDecl.name);
    context.moduleSymbols.set(moduleDecl.name, {
      module: moduleDecl,
      functions: new Map(),
      types: new Map()
    });

    addSymbol(context.symbols, {
      id: createSymbolId(moduleDecl.name, "$module"),
      moduleId,
      name: moduleDecl.name,
      qualifiedName: moduleDecl.name,
      kind: "module",
      declarationSpan: moduleDecl.span,
      exported: true
    });
  }
}
