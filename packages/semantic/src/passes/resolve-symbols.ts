import type { ModuleSymbols, SemanticContext } from "../semantic-context.js";

export function resolveSymbols(context: SemanticContext): void {
  for (const moduleDecl of context.program.modules) {
    if (context.visibleSymbolsByModule.has(moduleDecl.name)) {
      continue;
    }

    const localSymbols = context.moduleSymbols.get(moduleDecl.name);
    if (localSymbols !== undefined) {
      context.visibleSymbolsByModule.set(moduleDecl.name, localSymbols);
    }
  }
}

export function visibleSymbolsForModule(
  context: SemanticContext,
  moduleName: string
): ModuleSymbols | undefined {
  return context.visibleSymbolsByModule.get(moduleName);
}
