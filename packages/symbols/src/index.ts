import type { FunctionDecl, Program, TypeDecl } from "@anpl/ast";
import type { Span } from "@anpl/core";
import type { TypeId } from "@anpl/types";

export type ModuleId = string & { readonly __brand: "ModuleId" };
export type SymbolId = string & { readonly __brand: "SymbolId" };

export type SymbolKind =
  | "module"
  | "function"
  | "type"
  | "field"
  | "parameter"
  | "local"
  | "builtin";

export type SymbolRecord = {
  id: SymbolId;
  moduleId: ModuleId;
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  type?: TypeId;
  declarationSpan: Span;
  exported: boolean;
};

export type SymbolTable = {
  modules: Map<ModuleId, SymbolRecord>;
  symbols: Map<SymbolId, SymbolRecord>;
  byQualifiedName: Map<string, SymbolId>;
  byModule: Map<ModuleId, SymbolId[]>;
};

export function createModuleId(name: string): ModuleId {
  return name as ModuleId;
}

export function createSymbolId(moduleName: string, name: string): SymbolId {
  return `${moduleName}.${name}` as SymbolId;
}

export function createSymbolTable(): SymbolTable {
  return {
    modules: new Map(),
    symbols: new Map(),
    byQualifiedName: new Map(),
    byModule: new Map()
  };
}

export function addSymbol(table: SymbolTable, symbol: SymbolRecord): void {
  table.symbols.set(symbol.id, symbol);
  table.byQualifiedName.set(symbol.qualifiedName, symbol.id);

  const moduleSymbols = table.byModule.get(symbol.moduleId) ?? [];
  moduleSymbols.push(symbol.id);
  table.byModule.set(symbol.moduleId, moduleSymbols);

  if (symbol.kind === "module") {
    table.modules.set(symbol.moduleId, symbol);
  }
}

export function collectProgramSymbols(program: Program): SymbolTable {
  const table = createSymbolTable();

  for (const moduleDecl of program.modules) {
    const moduleId = createModuleId(moduleDecl.name);
    addSymbol(table, {
      id: createSymbolId(moduleDecl.name, "$module"),
      moduleId,
      name: moduleDecl.name,
      qualifiedName: moduleDecl.name,
      kind: "module",
      declarationSpan: moduleDecl.span,
      exported: true
    });

    for (const decl of moduleDecl.body) {
      if (decl.kind === "FunctionDecl") {
        addDeclarationSymbol(table, moduleId, moduleDecl.name, decl, "function");
      }
      if (decl.kind === "TypeDecl") {
        addDeclarationSymbol(table, moduleId, moduleDecl.name, decl, "type");
      }
    }
  }

  return table;
}

function addDeclarationSymbol(
  table: SymbolTable,
  moduleId: ModuleId,
  moduleName: string,
  decl: FunctionDecl | TypeDecl,
  kind: "function" | "type"
): void {
  const qualifiedName = `${moduleName}.${decl.name}`;
  addSymbol(table, {
    id: qualifiedName as SymbolId,
    moduleId,
    name: decl.name,
    qualifiedName,
    kind,
    declarationSpan: decl.span,
    exported: true
  });
}
