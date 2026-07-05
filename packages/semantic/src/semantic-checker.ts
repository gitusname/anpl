import type {
  BlockStmt,
  Expr,
  FunctionDecl,
  RecordExpr,
  Stmt,
  TypeDecl
} from "@anpl/ast";
import type { Span } from "@anpl/core";
import type { TypeId } from "@anpl/types";
import { primitiveTypeId } from "@anpl/types";
import { createScope, type Scope } from "./scopes/scope.js";
import {
  addSemanticDiagnostic,
  type ModuleSymbols,
  type SemanticContext
} from "./semantic-context.js";
import {
  displayType,
  internFunctionType,
  internRecordType,
  resolveTypeRef,
  spanKey,
  typeIdForRecordDecl
} from "./type-resolver.js";

type BuiltinFunction = {
  params: string[];
  returnType: string;
};

const builtinFunctions: ReadonlyMap<string, BuiltinFunction> = new Map([
  ["uuid", { params: [], returnType: "uuid" }],
  ["now", { params: [], returnType: "text" }],
  ["print", { params: ["any"], returnType: "void" }],
  ["len", { params: ["any"], returnType: "int" }]
]);

export class SemanticChecker {
  constructor(private readonly context: SemanticContext) {}

  resolveTypeDecl(typeDecl: TypeDecl, symbols: ModuleSymbols): void {
    internRecordType(this.context, typeDecl, symbols);
  }

  resolveFunctionTypes(fn: FunctionDecl, symbols: ModuleSymbols): void {
    internFunctionType(this.context, fn, symbols);
  }

  checkRecordDecl(typeDecl: TypeDecl): void {
    const seenFields = new Set<string>();

    for (const field of typeDecl.fields) {
      if (seenFields.has(field.name)) {
        this.addDiagnostic({
          code: "ANPL_SEMANTIC_DUPLICATE_SYMBOL",
          message: `Field '${field.name}' is already defined on type '${typeDecl.name}'.`,
          span: field.span,
          symbol: field.name
        });
      }
      seenFields.add(field.name);
    }
  }

  checkFunctionExpressions(fn: FunctionDecl, symbols: ModuleSymbols): void {
    const scope = createScope();

    for (const param of fn.params) {
      if (scope.has(param.name)) {
        this.addDiagnostic({
          code: "ANPL_SEMANTIC_DUPLICATE_SYMBOL",
          message: `Parameter '${param.name}' is already defined.`,
          span: param.span,
          symbol: param.name
        });
      }
      scope.set(param.name, resolveTypeRef(this.context, param.type, symbols));
    }

    this.checkBlock(fn.body, resolveTypeRef(this.context, fn.returnType, symbols), scope, symbols);
  }

  checkFunctionReturns(fn: FunctionDecl): void {
    if (fn.returnType.name !== "void" && !this.blockAlwaysReturns(fn.body)) {
      this.addDiagnostic({
        code: "ANPL_RETURN_MISSING",
        message: `Function '${fn.name}' must return ${fn.returnType.name}.`,
        span: fn.span,
        symbol: fn.name,
        expected: fn.returnType.name,
        received: "void"
      });
    }
  }

  private checkBlock(
    block: BlockStmt,
    returnType: TypeId,
    scope: Scope,
    symbols: ModuleSymbols
  ): void {
    for (const statement of block.statements) {
      this.checkStatement(statement, returnType, scope, symbols);
    }
  }

  private checkStatement(
    statement: Stmt,
    returnType: TypeId,
    scope: Scope,
    symbols: ModuleSymbols
  ): void {
    switch (statement.kind) {
      case "LetStmt": {
        if (scope.has(statement.name)) {
          this.addDiagnostic({
            code: "ANPL_SEMANTIC_DUPLICATE_SYMBOL",
            message: `Variable '${statement.name}' is already defined in this scope.`,
            span: statement.span,
            symbol: statement.name
          });
        }
        const explicitType =
          statement.type === undefined
            ? undefined
            : resolveTypeRef(this.context, statement.type, symbols);
        if (explicitType !== undefined && this.isEnumType(explicitType)) {
          this.checkEnumValue(explicitType, statement.value, scope, symbols, statement.span);
          scope.set(statement.name, explicitType);
          break;
        }
        const valueType = this.inferExpr(statement.value, scope, symbols);
        if (explicitType !== undefined) {
          this.expectType(explicitType, valueType, statement.span);
        }
        scope.set(statement.name, explicitType ?? valueType);
        break;
      }
      case "ReturnStmt": {
        if (statement.value !== undefined && this.isEnumType(returnType)) {
          this.checkEnumValue(returnType, statement.value, scope, symbols, statement.span);
          break;
        }
        const valueType = statement.value
          ? this.inferExpr(statement.value, scope, symbols)
          : primitiveTypeId("void");
        this.expectType(returnType, valueType, statement.span, "ANPL_RETURN_TYPE_MISMATCH");
        break;
      }
      case "IfStmt": {
        const conditionType = this.inferExpr(statement.condition, scope, symbols);
        this.expectType(primitiveTypeId("bool"), conditionType, statement.condition.span);
        this.checkBlock(statement.thenBranch, returnType, createScope(scope), symbols);
        if (statement.elseBranch !== undefined) {
          if (statement.elseBranch.kind === "BlockStmt") {
            this.checkBlock(statement.elseBranch, returnType, createScope(scope), symbols);
          } else {
            this.checkStatement(statement.elseBranch, returnType, createScope(scope), symbols);
          }
        }
        break;
      }
      case "ExprStmt":
        this.inferExpr(statement.expression, scope, symbols);
        break;
    }
  }

  private inferExpr(expr: Expr, scope: Scope, symbols: ModuleSymbols): TypeId {
    const type = this.inferExprInner(expr, scope, symbols);
    this.context.expressionTypes.set(spanKey(expr.span), type);
    return type;
  }

  private inferExprInner(expr: Expr, scope: Scope, symbols: ModuleSymbols): TypeId {
    switch (expr.kind) {
      case "LiteralExpr":
        if (typeof expr.value === "number") {
          return primitiveTypeId(Number.isInteger(expr.value) ? "int" : "decimal");
        }
        if (typeof expr.value === "boolean") {
          return primitiveTypeId("bool");
        }
        if (typeof expr.value === "string") {
          return primitiveTypeId("text");
        }
        return primitiveTypeId("null");

      case "IdentifierExpr": {
        const local = scope.get(expr.name);
        if (local !== undefined) {
          return local;
        }
        if (symbols.functions.has(expr.name)) {
          return primitiveTypeId("unknown");
        }
        this.addDiagnostic({
          code: "ANPL_SEMANTIC_UNKNOWN_SYMBOL",
          message: `Symbol '${expr.name}' is not defined.`,
          span: expr.span,
          symbol: expr.name
        });
        return primitiveTypeId("unknown");
      }

      case "BinaryExpr": {
        const left = this.inferExpr(expr.left, scope, symbols);
        const right = this.inferExpr(expr.right, scope, symbols);

        if (["+", "-", "*", "/", "%"].includes(expr.operator)) {
          if (!this.isNumeric(left) || !this.isNumeric(right)) {
            this.addDiagnostic({
              code: "ANPL_TYPE_MISMATCH",
              message: `Cannot apply '${expr.operator}' to ${displayType(this.context, left)} and ${displayType(this.context, right)}.`,
              span: expr.span,
              expected: "number",
              received: `${displayType(this.context, left)}, ${displayType(this.context, right)}`
            });
          }
          return left === primitiveTypeId("decimal") || right === primitiveTypeId("decimal")
            ? primitiveTypeId("decimal")
            : primitiveTypeId("int");
        }

        if (["==", "!=", "<", "<=", ">", ">="].includes(expr.operator)) {
          return primitiveTypeId("bool");
        }

        if (expr.operator === "and" || expr.operator === "or") {
          this.expectType(primitiveTypeId("bool"), left, expr.left.span);
          this.expectType(primitiveTypeId("bool"), right, expr.right.span);
          return primitiveTypeId("bool");
        }

        return primitiveTypeId("unknown");
      }

      case "CallExpr": {
        if (expr.callee.kind !== "IdentifierExpr") {
          return primitiveTypeId("unknown");
        }

        const builtin = builtinFunctions.get(expr.callee.name);
        if (builtin !== undefined) {
          this.checkCallArgs(expr.callee.name, builtin, expr.args, scope, symbols, expr.span);
          return primitiveTypeId(builtin.returnType as Parameters<typeof primitiveTypeId>[0]);
        }

        const fn = symbols.functions.get(expr.callee.name);
        if (fn === undefined) {
          this.addDiagnostic({
            code: "ANPL_SEMANTIC_UNKNOWN_SYMBOL",
            message: `Function '${expr.callee.name}' is not defined.`,
            span: expr.callee.span,
            symbol: expr.callee.name
          });
          return primitiveTypeId("unknown");
        }

        if (fn.params.length !== expr.args.length) {
          this.addDiagnostic({
            code: "ANPL_CALL_ARG_COUNT_MISMATCH",
            message: `Function '${expr.callee.name}' expects ${fn.params.length} arguments but received ${expr.args.length}.`,
            span: expr.span,
            symbol: expr.callee.name,
            expected: String(fn.params.length),
            received: String(expr.args.length)
          });
        }

        for (const [index, arg] of expr.args.entries()) {
          const expected = fn.params[index];
          if (expected !== undefined) {
            const expectedType = resolveTypeRef(this.context, expected, symbols);
            if (this.isEnumType(expectedType)) {
              this.checkEnumValue(expectedType, arg, scope, symbols, arg.span);
            } else {
              const received = this.inferExpr(arg, scope, symbols);
              this.expectType(expectedType, received, arg.span);
            }
          }
        }

        return resolveTypeRef(this.context, fn.returnType, symbols);
      }

      case "RecordExpr":
        return this.checkRecordExpr(expr, scope, symbols);

      case "MemberExpr": {
        const objectType = this.inferExpr(expr.object, scope, symbols);
        if (this.context.types.get(objectType).kind === "UnknownType") {
          return objectType;
        }
        const objectTypeRecord = this.context.types.get(objectType);
        const fieldType =
          objectTypeRecord.kind === "RecordType"
            ? objectTypeRecord.fields.get(expr.property)
            : undefined;
        if (fieldType === undefined) {
          this.addDiagnostic({
            code: "ANPL_FIELD_NOT_FOUND",
            message: `Field '${expr.property}' does not exist on '${displayType(this.context, objectType)}'.`,
            span: expr.span,
            symbol: expr.property
          });
          return primitiveTypeId("unknown");
        }
        return fieldType;
      }
    }
  }

  private checkRecordExpr(expr: RecordExpr, scope: Scope, symbols: ModuleSymbols): TypeId {
    const typeDecl = symbols.types.get(expr.typeName);
    if (typeDecl === undefined) {
      this.addDiagnostic({
        code: "ANPL_SEMANTIC_UNKNOWN_SYMBOL",
        message: `Type '${expr.typeName}' is not defined.`,
        span: expr.span,
        symbol: expr.typeName
      });
      return primitiveTypeId("unknown");
    }

    const seenFields = new Set<string>();
    for (const field of expr.fields) {
      if (seenFields.has(field.name)) {
        this.addDiagnostic({
          code: "ANPL_SEMANTIC_DUPLICATE_SYMBOL",
          message: `Field '${field.name}' is already assigned in '${expr.typeName}'.`,
          span: field.span,
          symbol: field.name
        });
      }
      seenFields.add(field.name);

      const expected = typeDecl.fields.find((candidate) => candidate.name === field.name);
      if (expected === undefined) {
        this.addDiagnostic({
          code: "ANPL_FIELD_NOT_FOUND",
          message: `Field '${field.name}' does not exist on '${expr.typeName}'.`,
          span: field.span,
          symbol: field.name
        });
      } else {
        const expectedType = resolveTypeRef(this.context, expected.type, symbols);
        if (this.isEnumType(expectedType)) {
          this.checkEnumValue(expectedType, field.value, scope, symbols, field.span);
        } else {
          const received = this.inferExpr(field.value, scope, symbols);
          this.expectType(expectedType, received, field.span);
        }
      }
    }

    for (const field of typeDecl.fields) {
      if (!field.optional && !expr.fields.some((candidate) => candidate.name === field.name)) {
        this.addDiagnostic({
          code: "ANPL_FIELD_NOT_FOUND",
          message: `Required field '${field.name}' is missing from '${expr.typeName}'.`,
          span: expr.span,
          symbol: field.name
        });
      }
    }

    return typeIdForRecordDecl(this.context, typeDecl);
  }

  private checkCallArgs(
    name: string,
    fn: BuiltinFunction,
    args: Expr[],
    scope: Scope,
    symbols: ModuleSymbols,
    span: Span
  ): void {
    if (fn.params.length !== args.length) {
      this.addDiagnostic({
        code: "ANPL_CALL_ARG_COUNT_MISMATCH",
        message: `Function '${name}' expects ${fn.params.length} arguments but received ${args.length}.`,
        span,
        symbol: name,
        expected: String(fn.params.length),
        received: String(args.length)
      });
    }

    for (const [index, arg] of args.entries()) {
      const received = this.inferExpr(arg, scope, symbols);
      const expected = fn.params[index];
      if (expected !== undefined && expected !== "any") {
        this.expectType(
          primitiveTypeId(expected as Parameters<typeof primitiveTypeId>[0]),
          received,
          arg.span
        );
      }
    }
  }

  private checkEnumValue(
    expected: TypeId,
    expr: Expr,
    scope: Scope,
    symbols: ModuleSymbols,
    span: Span
  ): void {
    const variants = this.enumVariants(expected);
    if (expr.kind === "IdentifierExpr" && variants.includes(expr.name)) {
      return;
    }
    let receivedName = expr.kind === "IdentifierExpr" ? expr.name : expr.kind;

    if (expr.kind === "IdentifierExpr") {
      const local = scope.get(expr.name);
      if (local !== undefined) {
        this.expectType(expected, local, span);
        return;
      }

      if (symbols.functions.has(expr.name)) {
        this.addDiagnostic({
          code: "ANPL_TYPE_MISMATCH",
          message: `Expected enum variant ${variants.map((variant) => `'${variant}'`).join(" | ")}.`,
          span,
          expected: `enum[${variants.join(", ")}]`,
          received: "function"
        });
        return;
      }
    }

    if (expr.kind !== "IdentifierExpr") {
      const received = this.inferExpr(expr, scope, symbols);
      if (this.context.types.isAssignable(received, expected)) {
        return;
      }
      receivedName = displayType(this.context, received);
    }

    this.addDiagnostic({
      code: "ANPL_TYPE_MISMATCH",
      message: `Expected enum variant ${variants.map((variant) => `'${variant}'`).join(" | ")}.`,
      span,
      expected: `enum[${variants.join(", ")}]`,
      received: receivedName
    });
  }

  private enumVariants(type: TypeId): string[] {
    const resolved = this.context.types.get(type);
    return resolved.kind === "EnumType" ? resolved.variants : [];
  }

  private expectType(
    expected: TypeId,
    received: TypeId,
    span: Span,
    code = "ANPL_TYPE_MISMATCH"
  ): void {
    if (this.context.types.isAssignable(received, expected)) {
      return;
    }

    this.addDiagnostic({
      code,
      message: `Expected ${displayType(this.context, expected)} but received ${displayType(this.context, received)}.`,
      span,
      expected: displayType(this.context, expected),
      received: displayType(this.context, received)
    });
  }

  private isEnumType(type: TypeId): boolean {
    return this.context.types.get(type).kind === "EnumType";
  }

  private isNumeric(type: TypeId): boolean {
    const resolved = this.context.types.get(type);
    return (
      resolved.kind === "PrimitiveType" &&
      (resolved.name === "int" || resolved.name === "decimal")
    );
  }

  private blockAlwaysReturns(block: BlockStmt): boolean {
    for (const statement of block.statements) {
      if (this.statementAlwaysReturns(statement)) {
        return true;
      }
    }
    return false;
  }

  private statementAlwaysReturns(statement: Stmt): boolean {
    if (statement.kind === "ReturnStmt") {
      return true;
    }

    if (statement.kind !== "IfStmt" || statement.elseBranch === undefined) {
      return false;
    }

    const thenReturns = this.blockAlwaysReturns(statement.thenBranch);
    const elseReturns =
      statement.elseBranch.kind === "BlockStmt"
        ? this.blockAlwaysReturns(statement.elseBranch)
        : this.statementAlwaysReturns(statement.elseBranch);

    return thenReturns && elseReturns;
  }

  private addDiagnostic(input: {
    code: string;
    message: string;
    span: Span;
    symbol?: string;
    expected?: string;
    received?: string;
  }): void {
    addSemanticDiagnostic(this.context, input);
  }
}
