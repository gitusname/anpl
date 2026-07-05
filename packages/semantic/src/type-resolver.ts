import type { FunctionDecl, TypeDecl, TypeRef } from "@anpl/ast";
import type { Span } from "@anpl/core";
import type { SymbolRecord } from "@anpl/symbols";
import type { TypeId } from "@anpl/types";
import { primitiveTypeId } from "@anpl/types";
import {
  addSemanticDiagnostic,
  type ModuleSymbols,
  type SemanticContext
} from "./semantic-context.js";

const primitiveTypeNames = new Set([
  "int",
  "decimal",
  "text",
  "string",
  "bool",
  "uuid",
  "void",
  "null"
]);

const pseudoTypeNames = new Set(["unknown", "function"]);

export function resolveTypeRef(
  context: SemanticContext,
  typeRef: TypeRef,
  symbols: ModuleSymbols
): TypeId {
  const resolved = resolveTypeRefInner(context, typeRef, symbols);
  context.resolvedTypeRefs.set(spanKey(typeRef.span), resolved);
  return resolved;
}

export function internRecordType(
  context: SemanticContext,
  typeDecl: TypeDecl,
  symbols: ModuleSymbols
): TypeId {
  const symbol = symbolForDeclaration(context, typeDecl);
  const qualifiedName = symbol?.qualifiedName ?? typeDecl.name;
  const id = context.types.intern({
    kind: "RecordType",
    name: qualifiedName,
    fields: new Map(
      typeDecl.fields.map((field) => [
        field.name,
        resolveTypeRef(context, field.type, symbols)
      ])
    )
  });

  if (symbol !== undefined) {
    symbol.type = id;
  }

  return id;
}

export function internFunctionType(
  context: SemanticContext,
  fn: FunctionDecl,
  symbols: ModuleSymbols
): TypeId {
  const symbol = symbolForDeclaration(context, fn);
  const id = context.types.intern({
    kind: "FunctionType",
    params: fn.params.map((param) => resolveTypeRef(context, param.type, symbols)),
    returnType: resolveTypeRef(context, fn.returnType, symbols)
  });

  if (symbol !== undefined) {
    symbol.type = id;
  }

  return id;
}

export function typeIdForRecordDecl(
  context: SemanticContext,
  typeDecl: TypeDecl
): TypeId {
  return symbolForDeclaration(context, typeDecl)?.type ?? primitiveTypeId("unknown");
}

export function displayType(context: SemanticContext, id: TypeId): string {
  return context.types.display(id);
}

export function spanKey(span: Span): string {
  return `${span.file ?? "<memory>"}:${span.start.offset}-${span.end.offset}`;
}

function resolveTypeRefInner(
  context: SemanticContext,
  typeRef: TypeRef,
  symbols: ModuleSymbols
): TypeId {
  if (typeRef.name === "enum") {
    const variants = (typeRef.typeArgs ?? []).map((variant) => variant.name);
    if (variants.length === 0) {
      addSemanticDiagnostic(context, {
        code: "ANPL_ENUM_EMPTY",
        message: "Enum type must declare at least one variant.",
        span: typeRef.span,
        symbol: "enum"
      });
    }
    return context.types.intern({
      kind: "EnumType",
      variants
    });
  }

  if (primitiveTypeNames.has(typeRef.name)) {
    return primitiveTypeId(typeRef.name as Parameters<typeof primitiveTypeId>[0]);
  }

  if (pseudoTypeNames.has(typeRef.name)) {
    return primitiveTypeId("unknown");
  }

  const typeDecl = symbols.types.get(typeRef.name);
  if (typeDecl !== undefined) {
    return typeIdForRecordDecl(context, typeDecl);
  }

  addSemanticDiagnostic(context, {
    code: "ANPL_SEMANTIC_UNKNOWN_SYMBOL",
    message: `Type '${typeRef.name}' is not defined.`,
    span: typeRef.span,
    symbol: typeRef.name
  });
  return primitiveTypeId("unknown");
}

function symbolForDeclaration(
  context: SemanticContext,
  decl: TypeDecl | FunctionDecl
): SymbolRecord | undefined {
  for (const symbol of context.symbols.symbols.values()) {
    if (symbol.declarationSpan === decl.span) {
      return symbol;
    }
  }

  return undefined;
}
