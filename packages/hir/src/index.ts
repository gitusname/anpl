import type {
  BlockStmt,
  Expr,
  FunctionDecl,
  ImportDecl,
  Program,
  Stmt,
  TypeDecl
} from "@anpl/ast";
import type { Span } from "@anpl/core";
import type { ModuleId, SymbolId } from "@anpl/symbols";
import { createModuleId, createSymbolId } from "@anpl/symbols";
import type { TypeId } from "@anpl/types";
import { primitiveTypeId } from "@anpl/types";

export type HirProgram = {
  modules: HirModule[];
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

export function lowerProgramToHir(program: Program): HirProgram {
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
          .map((typeDecl) => lowerType(moduleDecl.name, typeDecl)),
        functions: moduleDecl.body
          .filter((decl): decl is FunctionDecl => decl.kind === "FunctionDecl")
          .map((fn) => lowerFunction(moduleDecl.name, fn))
      };
    })
  };
}

function lowerType(moduleName: string, typeDecl: TypeDecl): HirTypeDecl {
  return {
    id: createSymbolId(moduleName, typeDecl.name),
    name: typeDecl.name,
    fields: typeDecl.fields.map((field) => ({
      name: field.name,
      type: typeNameToTypeId(field.type.name),
      optional: field.optional
    })),
    span: typeDecl.span
  };
}

function lowerFunction(moduleName: string, fn: FunctionDecl): HirFunction {
  return {
    id: createSymbolId(moduleName, fn.name),
    name: fn.name,
    params: fn.params.map((param) => ({
      name: param.name,
      type: typeNameToTypeId(param.type.name),
      span: param.span
    })),
    returnType: typeNameToTypeId(fn.returnType.name),
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
