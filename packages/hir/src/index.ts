import type {
  BlockStmt,
  Expr,
  FunctionDecl,
  ImportDecl,
  Program,
  Stmt,
  TypeRef,
  TypeDecl
} from "@anpl/ast";
import type { Span } from "@anpl/core";
import type { ModuleId, SymbolId, SymbolTable } from "@anpl/symbols";
import { createModuleId, createSymbolId } from "@anpl/symbols";
import type { TypeId } from "@anpl/types";
import { primitiveTypeId } from "@anpl/types";

export type HirProgram = {
  modules: HirModule[];
  typeFacts?: HirTypeFacts;
};

export type HirTypeFacts = {
  resolvedTypeRefs: Record<string, TypeId>;
  expressionTypes: Record<string, TypeId>;
};

export type HirLoweringOptions = {
  resolvedTypeRefs?: ReadonlyMap<string, TypeId>;
  expressionTypes?: ReadonlyMap<string, TypeId>;
  symbols?: Pick<SymbolTable, "byQualifiedName" | "symbols">;
};

export type HirModule = {
  id: ModuleId;
  name: string;
  imports: HirImport[];
  functions: HirFunction[];
  types: HirTypeDecl[];
};

export type HirImport = {
  module: string;
  names?: string[];
  span: Span;
};

export type HirTypeDecl = {
  id: SymbolId;
  type: TypeId;
  name: string;
  fields: Array<{
    name: string;
    type: TypeId;
    optional: boolean;
  }>;
  span: Span;
};

export type HirFunction = {
  id: SymbolId;
  name: string;
  params: HirParam[];
  returnType: TypeId;
  body: HirBlock;
  span: Span;
};

export type HirParam = {
  name: string;
  type: TypeId;
  span: Span;
};

export type HirBlock = {
  statements: Stmt[];
  span: Span;
};

export type HirExpression = Expr;

export function lowerProgramToHir(
  program: Program,
  options: HirLoweringOptions = {}
): HirProgram {
  return {
    modules: program.modules.map((moduleDecl) => {
      const moduleId = createModuleId(moduleDecl.name);

      return {
        id: moduleId,
        name: moduleDecl.name,
        imports: moduleDecl.body
          .filter((decl): decl is ImportDecl => decl.kind === "ImportDecl")
          .map((importDecl) => ({
            module: importDecl.module,
            names: importDecl.names,
            span: importDecl.span
          })),
        types: moduleDecl.body
          .filter((decl): decl is TypeDecl => decl.kind === "TypeDecl")
          .map((typeDecl) => lowerType(moduleDecl.name, typeDecl, options)),
        functions: moduleDecl.body
          .filter((decl): decl is FunctionDecl => decl.kind === "FunctionDecl")
          .map((fn) => lowerFunction(moduleDecl.name, fn, options))
      };
    }),
    typeFacts: typeFactsFromOptions(options)
  };
}

function lowerType(
  moduleName: string,
  typeDecl: TypeDecl,
  options: HirLoweringOptions
): HirTypeDecl {
  const symbolId = createSymbolId(moduleName, typeDecl.name);
  const qualifiedName = `${moduleName}.${typeDecl.name}`;

  return {
    id: symbolId,
    type: symbolType(qualifiedName, options) ?? (qualifiedName as TypeId),
    name: typeDecl.name,
    fields: typeDecl.fields.map((field) => ({
      name: field.name,
      type: typeRefToTypeId(field.type, options),
      optional: field.optional
    })),
    span: typeDecl.span
  };
}

function lowerFunction(
  moduleName: string,
  fn: FunctionDecl,
  options: HirLoweringOptions
): HirFunction {
  return {
    id: createSymbolId(moduleName, fn.name),
    name: fn.name,
    params: fn.params.map((param) => ({
      name: param.name,
      type: typeRefToTypeId(param.type, options),
      span: param.span
    })),
    returnType: typeRefToTypeId(fn.returnType, options),
    body: lowerBlock(fn.body),
    span: fn.span
  };
}

function lowerBlock(block: BlockStmt): HirBlock {
  return {
    statements: block.statements,
    span: block.span
  };
}

function typeRefToTypeId(typeRef: TypeRef, options: HirLoweringOptions): TypeId {
  return options.resolvedTypeRefs?.get(spanKey(typeRef.span)) ?? typeNameToTypeId(typeRef.name);
}

function symbolType(
  qualifiedName: string,
  options: HirLoweringOptions
): TypeId | undefined {
  const symbolId = options.symbols?.byQualifiedName.get(qualifiedName);
  if (symbolId === undefined) {
    return undefined;
  }

  return options.symbols?.symbols.get(symbolId)?.type;
}

function typeFactsFromOptions(options: HirLoweringOptions): HirTypeFacts | undefined {
  if (options.resolvedTypeRefs === undefined && options.expressionTypes === undefined) {
    return undefined;
  }

  return {
    resolvedTypeRefs: mapToRecord(options.resolvedTypeRefs),
    expressionTypes: mapToRecord(options.expressionTypes)
  };
}

function mapToRecord(map: ReadonlyMap<string, TypeId> | undefined): Record<string, TypeId> {
  return Object.fromEntries(map ?? []) as Record<string, TypeId>;
}

function spanKey(span: Span): string {
  return `${span.file ?? "<memory>"}:${span.start.offset}-${span.end.offset}`;
}

function typeNameToTypeId(name: string): TypeId {
  switch (name) {
    case "int":
    case "decimal":
    case "text":
    case "string":
    case "bool":
    case "uuid":
    case "void":
    case "null":
      return primitiveTypeId(name);
    default:
      return name as TypeId;
  }
}
