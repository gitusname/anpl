import type {
  BlockStmt,
  Decl,
  Expr,
  FunctionDecl,
  ModuleDecl,
  Program,
  RecordExpr,
  Stmt,
  TypeDecl,
  TypeRef
} from "@anpl/ast";
import type { Diagnostic, Span } from "@anpl/core";
import { createDiagnostic } from "@anpl/core";

export type SemanticResult =
  | {
      ok: true;
      program: Program;
      diagnostics: [];
    }
  | {
      ok: false;
      program: Program;
      diagnostics: Diagnostic[];
    };

type FunctionSymbol = {
  decl: FunctionDecl;
  params: TypeRef[];
  returnType: TypeRef;
};

type ModuleSymbols = {
  functions: Map<string, FunctionSymbol>;
  types: Map<string, TypeDecl>;
};

const builtinTypes = new Set([
  "int",
  "decimal",
  "text",
  "string",
  "bool",
  "uuid",
  "enum"
]);

export function analyzeProgram(program: Program): SemanticResult {
  const analyzer = new SemanticAnalyzer(program);
  const diagnostics = analyzer.analyze();

  if (diagnostics.length > 0) {
    return {
      ok: false,
      program,
      diagnostics
    };
  }

  return {
    ok: true,
    program,
    diagnostics: []
  };
}

class SemanticAnalyzer {
  private readonly diagnostics: Diagnostic[] = [];

  constructor(private readonly program: Program) {}

  analyze(): Diagnostic[] {
    for (const moduleDecl of this.program.modules) {
      const symbols = this.collectModuleSymbols(moduleDecl);

      for (const decl of moduleDecl.body) {
        if (decl.kind === "FunctionDecl") {
          this.checkFunction(decl, symbols);
        } else if (decl.kind === "TypeDecl") {
          this.checkTypeDecl(decl, symbols);
        }
      }
    }

    return this.diagnostics;
  }

  private collectModuleSymbols(moduleDecl: ModuleDecl): ModuleSymbols {
    const functions = new Map<string, FunctionSymbol>();
    const types = new Map<string, TypeDecl>();

    for (const decl of moduleDecl.body) {
      if (decl.kind === "FunctionDecl") {
        if (functions.has(decl.name)) {
          this.addDiagnostic({
            code: "ANPL_SEMANTIC_DUPLICATE_SYMBOL",
            message: `Function '${decl.name}' is already defined.`,
            span: decl.span,
            symbol: decl.name
          });
        }
        functions.set(decl.name, {
          decl,
          params: decl.params.map((param) => param.type),
          returnType: decl.returnType
        });
      }

      if (decl.kind === "TypeDecl") {
        if (types.has(decl.name)) {
          this.addDiagnostic({
            code: "ANPL_SEMANTIC_DUPLICATE_SYMBOL",
            message: `Type '${decl.name}' is already defined.`,
            span: decl.span,
            symbol: decl.name
          });
        }
        types.set(decl.name, decl);
      }
    }

    return {
      functions,
      types
    };
  }

  private checkTypeDecl(typeDecl: TypeDecl, symbols: ModuleSymbols): void {
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
      this.checkTypeRef(field.type, symbols);
    }
  }

  private checkFunction(fn: FunctionDecl, symbols: ModuleSymbols): void {
    this.checkTypeRef(fn.returnType, symbols);
    const scope = new Map<string, TypeRef>();

    for (const param of fn.params) {
      if (scope.has(param.name)) {
        this.addDiagnostic({
          code: "ANPL_SEMANTIC_DUPLICATE_SYMBOL",
          message: `Parameter '${param.name}' is already defined.`,
          span: param.span,
          symbol: param.name
        });
      }
      this.checkTypeRef(param.type, symbols);
      scope.set(param.name, param.type);
    }

    this.checkBlock(fn.body, fn.returnType, scope, symbols);
  }

  private checkBlock(
    block: BlockStmt,
    returnType: TypeRef,
    scope: Map<string, TypeRef>,
    symbols: ModuleSymbols
  ): void {
    for (const statement of block.statements) {
      this.checkStatement(statement, returnType, scope, symbols);
    }
  }

  private checkStatement(
    statement: Stmt,
    returnType: TypeRef,
    scope: Map<string, TypeRef>,
    symbols: ModuleSymbols
  ): void {
    switch (statement.kind) {
      case "LetStmt": {
        const valueType = this.inferExpr(statement.value, scope, symbols);
        if (statement.type !== undefined) {
          this.checkTypeRef(statement.type, symbols);
          this.expectType(statement.type, valueType, statement.span);
        }
        scope.set(statement.name, statement.type ?? valueType);
        break;
      }
      case "ReturnStmt": {
        const valueType = statement.value
          ? this.inferExpr(statement.value, scope, symbols)
          : this.typeRef("void", statement.span);
        this.expectType(returnType, valueType, statement.span, "ANPL_RETURN_TYPE_MISMATCH");
        break;
      }
      case "IfStmt": {
        const conditionType = this.inferExpr(statement.condition, scope, symbols);
        this.expectType(this.typeRef("bool", statement.condition.span), conditionType, statement.condition.span);
        this.checkBlock(statement.thenBranch, returnType, new Map(scope), symbols);
        if (statement.elseBranch !== undefined) {
          if (statement.elseBranch.kind === "BlockStmt") {
            this.checkBlock(statement.elseBranch, returnType, new Map(scope), symbols);
          } else {
            this.checkStatement(statement.elseBranch, returnType, new Map(scope), symbols);
          }
        }
        break;
      }
      case "ExprStmt":
        this.inferExpr(statement.expression, scope, symbols);
        break;
    }
  }

  private inferExpr(
    expr: Expr,
    scope: Map<string, TypeRef>,
    symbols: ModuleSymbols
  ): TypeRef {
    switch (expr.kind) {
      case "LiteralExpr":
        if (typeof expr.value === "number") {
          return this.typeRef(Number.isInteger(expr.value) ? "int" : "decimal", expr.span);
        }
        if (typeof expr.value === "boolean") {
          return this.typeRef("bool", expr.span);
        }
        if (typeof expr.value === "string") {
          return this.typeRef("text", expr.span);
        }
        return this.typeRef("null", expr.span);

      case "IdentifierExpr": {
        const local = scope.get(expr.name);
        if (local !== undefined) {
          return local;
        }
        if (symbols.functions.has(expr.name)) {
          return this.typeRef("function", expr.span);
        }
        this.addDiagnostic({
          code: "ANPL_SEMANTIC_UNKNOWN_SYMBOL",
          message: `Symbol '${expr.name}' is not defined.`,
          span: expr.span,
          symbol: expr.name
        });
        return this.typeRef("unknown", expr.span);
      }

      case "BinaryExpr": {
        const left = this.inferExpr(expr.left, scope, symbols);
        const right = this.inferExpr(expr.right, scope, symbols);

        if (["+", "-", "*", "/", "%"].includes(expr.operator)) {
          if (!this.isNumeric(left) || !this.isNumeric(right)) {
            this.addDiagnostic({
              code: "ANPL_TYPE_MISMATCH",
              message: `Cannot apply '${expr.operator}' to ${left.name} and ${right.name}.`,
              span: expr.span,
              expected: "number",
              received: `${left.name}, ${right.name}`
            });
          }
          return left.name === "decimal" || right.name === "decimal"
            ? this.typeRef("decimal", expr.span)
            : this.typeRef("int", expr.span);
        }

        if (["==", "!=", "<", "<=", ">", ">="].includes(expr.operator)) {
          return this.typeRef("bool", expr.span);
        }

        if (expr.operator === "and" || expr.operator === "or") {
          this.expectType(this.typeRef("bool", expr.left.span), left, expr.left.span);
          this.expectType(this.typeRef("bool", expr.right.span), right, expr.right.span);
          return this.typeRef("bool", expr.span);
        }

        return this.typeRef("unknown", expr.span);
      }

      case "CallExpr": {
        if (expr.callee.kind !== "IdentifierExpr") {
          return this.typeRef("unknown", expr.span);
        }

        const builtin = this.builtinCallType(expr.callee.name, expr.span);
        if (builtin !== undefined) {
          for (const arg of expr.args) {
            this.inferExpr(arg, scope, symbols);
          }
          return builtin;
        }

        const fn = symbols.functions.get(expr.callee.name);
        if (fn === undefined) {
          this.addDiagnostic({
            code: "ANPL_SEMANTIC_UNKNOWN_SYMBOL",
            message: `Function '${expr.callee.name}' is not defined.`,
            span: expr.callee.span,
            symbol: expr.callee.name
          });
          return this.typeRef("unknown", expr.span);
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
          const received = this.inferExpr(arg, scope, symbols);
          if (expected !== undefined) {
            this.expectType(expected, received, arg.span);
          }
        }

        return fn.returnType;
      }

      case "RecordExpr":
        return this.checkRecordExpr(expr, scope, symbols);

      case "MemberExpr": {
        const objectType = this.inferExpr(expr.object, scope, symbols);
        const typeDecl = symbols.types.get(objectType.name);
        const field = typeDecl?.fields.find((candidate) => candidate.name === expr.property);
        if (field === undefined) {
          this.addDiagnostic({
            code: "ANPL_FIELD_NOT_FOUND",
            message: `Field '${expr.property}' does not exist on '${objectType.name}'.`,
            span: expr.span,
            symbol: expr.property
          });
          return this.typeRef("unknown", expr.span);
        }
        return field.type;
      }
    }
  }

  private checkRecordExpr(
    expr: RecordExpr,
    scope: Map<string, TypeRef>,
    symbols: ModuleSymbols
  ): TypeRef {
    const typeDecl = symbols.types.get(expr.typeName);
    if (typeDecl === undefined) {
      this.addDiagnostic({
        code: "ANPL_SEMANTIC_UNKNOWN_SYMBOL",
        message: `Type '${expr.typeName}' is not defined.`,
        span: expr.span,
        symbol: expr.typeName
      });
      return this.typeRef("unknown", expr.span);
    }

    for (const field of expr.fields) {
      const expected = typeDecl.fields.find((candidate) => candidate.name === field.name);
      const received = this.inferExpr(field.value, scope, symbols);
      if (expected === undefined) {
        this.addDiagnostic({
          code: "ANPL_FIELD_NOT_FOUND",
          message: `Field '${field.name}' does not exist on '${expr.typeName}'.`,
          span: field.span,
          symbol: field.name
        });
      } else {
        this.expectType(expected.type, received, field.span);
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

    return this.typeRef(expr.typeName, expr.span);
  }

  private checkTypeRef(typeRef: TypeRef, symbols: ModuleSymbols): void {
    if (
      !builtinTypes.has(typeRef.name) &&
      typeRef.name !== "void" &&
      typeRef.name !== "null" &&
      typeRef.name !== "unknown" &&
      typeRef.name !== "function" &&
      !symbols.types.has(typeRef.name)
    ) {
      this.addDiagnostic({
        code: "ANPL_SEMANTIC_UNKNOWN_SYMBOL",
        message: `Type '${typeRef.name}' is not defined.`,
        span: typeRef.span,
        symbol: typeRef.name
      });
    }
  }

  private expectType(
    expected: TypeRef,
    received: TypeRef,
    span: Span,
    code = "ANPL_TYPE_MISMATCH"
  ): void {
    if (this.sameType(expected, received) || received.name === "unknown") {
      return;
    }

    this.addDiagnostic({
      code,
      message: `Expected ${expected.name} but received ${received.name}.`,
      span,
      expected: expected.name,
      received: received.name
    });
  }

  private sameType(expected: TypeRef, received: TypeRef): boolean {
    if (expected.name === received.name) {
      return true;
    }
    return expected.name === "text" && received.name === "string";
  }

  private isNumeric(type: TypeRef): boolean {
    return type.name === "int" || type.name === "decimal";
  }

  private builtinCallType(name: string, span: Span): TypeRef | undefined {
    switch (name) {
      case "uuid":
        return this.typeRef("uuid", span);
      case "now":
        return this.typeRef("text", span);
      case "print":
        return this.typeRef("void", span);
      case "len":
        return this.typeRef("int", span);
      default:
        return undefined;
    }
  }

  private typeRef(name: string, span: Span): TypeRef {
    return {
      kind: "TypeRef",
      name,
      span
    };
  }

  private addDiagnostic(input: {
    code: string;
    message: string;
    span: Span;
    symbol?: string;
    expected?: string;
    received?: string;
  }): void {
    this.diagnostics.push(
      createDiagnostic({
        code: input.code,
        severity: "error",
        message: input.message,
        file: input.span.file,
        line: input.span.start.line,
        column: input.span.start.column,
        span: input.span,
        symbol: input.symbol,
        expected: input.expected,
        received: input.received,
        confidence: "high"
      })
    );
  }
}
