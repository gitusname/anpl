import { SemanticChecker } from "../semantic-checker.js";
import type { SemanticContext } from "../semantic-context.js";

export function checkRecords(context: SemanticContext): void {
  const checker = new SemanticChecker(context);

  for (const moduleDecl of context.program.modules) {
    for (const decl of moduleDecl.body) {
      if (decl.kind === "TypeDecl") {
        checker.checkRecordDecl(decl);
      }
    }
  }
}
