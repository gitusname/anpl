import { SemanticChecker } from "../semantic-checker.js";
import type { SemanticContext } from "../semantic-context.js";
import { visibleSymbolsForModule } from "./resolve-symbols.js";

export function resolveTypes(context: SemanticContext): void {
  const checker = new SemanticChecker(context);

  for (const moduleDecl of context.program.modules) {
    const symbols = visibleSymbolsForModule(context, moduleDecl.name);
    if (symbols === undefined) {
      continue;
    }

    for (const decl of moduleDecl.body) {
      if (decl.kind === "TypeDecl") {
        checker.resolveTypeDecl(decl, symbols);
      }
      if (decl.kind === "FunctionDecl") {
        checker.resolveFunctionTypes(decl, symbols);
      }
    }
  }
}
