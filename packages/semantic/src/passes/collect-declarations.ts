import type { TypeDecl, TypeRef } from "@anpl/ast";
import { addSymbol, createModuleId, createSymbolId } from "@anpl/symbols";
import type { TypeId } from "@anpl/types";
import { primitiveTypeId } from "@anpl/types";
import {
  addSemanticDiagnostic,
  type SemanticContext
} from "../semantic-context.js";

export function collectDeclarations(context: SemanticContext): void {
  for (const moduleDecl of context.program.modules) {
    const moduleSymbols = context.moduleSymbols.get(moduleDecl.name);
    if (moduleSymbols === undefined) {
      continue;
    }

    const moduleId = createModuleId(moduleDecl.name);

    for (const decl of moduleDecl.body) {
      if (decl.kind === "FunctionDecl") {
        if (moduleSymbols.functions.has(decl.name)) {
          addSemanticDiagnostic(context, {
            code: "ANPL_SEMANTIC_DUPLICATE_SYMBOL",
            message: `Function '${decl.name}' is already defined.`,
            span: decl.span,
            symbol: decl.name
          });
        }

        moduleSymbols.functions.set(decl.name, {
          decl,
          params: decl.params.map((param) => param.type),
          returnType: decl.returnType
        });

        const qualifiedName = `${moduleDecl.name}.${decl.name}`;
        const type = context.types.intern({
          kind: "FunctionType",
          params: decl.params.map((param) => typeRefToTypeId(param.type)),
          returnType: typeRefToTypeId(decl.returnType)
        });

        addSymbol(context.symbols, {
          id: createSymbolId(moduleDecl.name, decl.name),
          moduleId,
          name: decl.name,
          qualifiedName,
          kind: "function",
          type,
          declarationSpan: decl.span,
          exported: true
        });
      }

      if (decl.kind === "TypeDecl") {
        if (moduleSymbols.types.has(decl.name)) {
          addSemanticDiagnostic(context, {
            code: "ANPL_SEMANTIC_DUPLICATE_SYMBOL",
            message: `Type '${decl.name}' is already defined.`,
            span: decl.span,
            symbol: decl.name
          });
        }

        moduleSymbols.types.set(decl.name, decl);

        const qualifiedName = `${moduleDecl.name}.${decl.name}`;
        const type = context.types.intern(typeDeclToTypeInput(decl, qualifiedName));

        addSymbol(context.symbols, {
          id: createSymbolId(moduleDecl.name, decl.name),
          moduleId,
          name: decl.name,
          qualifiedName,
          kind: "type",
          type,
          declarationSpan: decl.span,
          exported: true
        });
      }
    }
  }
}

function typeDeclToTypeInput(typeDecl: TypeDecl, qualifiedName: string) {
  return {
    kind: "RecordType" as const,
    name: qualifiedName,
    fields: new Map(typeDecl.fields.map((field) => [field.name, typeRefToTypeId(field.type)]))
  };
}

function typeRefToTypeId(typeRef: TypeRef): TypeId {
  if (typeRef.name === "enum") {
    return `enum:${(typeRef.typeArgs ?? []).map((variant) => variant.name).join("|")}` as TypeId;
  }

  switch (typeRef.name) {
    case "int":
    case "decimal":
    case "text":
    case "string":
    case "bool":
    case "uuid":
    case "void":
    case "null":
      return primitiveTypeId(typeRef.name);
    default:
      return typeRef.name as TypeId;
  }
}
