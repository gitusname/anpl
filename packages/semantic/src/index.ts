import type {
  BlockStmt,
  Decl,
  Expr,
  FunctionDecl,
  ImportDecl,
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
  module: ModuleDecl;
  functions: Map<string, FunctionSymbol>;
  types: Map<string, TypeDecl>;
};

type BuiltinFunction = {
  params: string[];
  returnType: string;
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

const builtinFunctions: ReadonlyMap<string, BuiltinFunction> = new Map([
  ["uuid", { params: [], returnType: "uuid" }],
  ["now", { params: [], returnType: "text" }],
  ["print", { params: ["any"], returnType: "void" }],
  ["len", { params: ["any"], returnType: "int" }]
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
    const programSymbols = this.collectProgramSymbols();

    for (const moduleDecl of this.program.modules) {
      const localSymbols = programSymbols.get(moduleDecl.name);
      if (localSymbols === undefined) {
        continue;
      }
      const symbols = this.resolveVisibleSymbols(localSymbols, programSymbols);

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

  private collectProgramSymbols(): Map<string, ModuleSymbols> {
    const programSymbols = new Map<string, ModuleSymbols>();

    for (const moduleDecl of this.program.modules) {
      if (programSymbols.has(moduleDecl.name)) {
        this.addDiagnostic({
          code: "ANPL_SEMANTIC_DUPLICATE_SYMBOL",
          message: `Module '${moduleDecl.name}' is already defined.`,
          span: moduleDecl.span,
          symbol: moduleDecl.name
        });
        continue;
      }

      programSymbols.set(moduleDecl.name, this.collectModuleSymbols(moduleDecl));
    }

    return programSymbols;
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
      module: moduleDecl,
      functions,
      types
    };
  }

  private resolveVisibleSymbols(
    localSymbols: ModuleSymbols,
    programSymbols: Map<string, ModuleSymbols>
  ): ModuleSymbols {
    const functions = new Map(localSymbols.functions);
    const types = new Map(localSymbols.types);

    for (const importDecl of this.importsFor(localSymbols.module)) {
      if (importDecl.module === localSymbols.module.name) {
        this.addDiagnostic({
          code: "ANPL_SEMANTIC_IMPORT_SELF",
          message: `Module '${localSymbols.module.name}' cannot import itself.`,
          span: importDecl.span,
          symbol: importDecl.module
        });
        continue;
      }

      const importedSymbols = programSymbols.get(importDecl.module);
      if (importedSymbols === undefined) {
        this.addDiagnostic({
          code: "ANPL_SEMANTIC_UNKNOWN_MODULE",
          message: `Module '${importDecl.module}' is not defined.`,
          span: importDecl.span,
          symbol: importDecl.module
        });
        continue;
      }

      this.mergeImportedSymbols(importDecl, importedSymbols, functions, types);
    }

    return {
      module: localSymbols.module,
      functions,
      types
    };
  }

  private importsFor(moduleDecl: ModuleDecl): ImportDecl[] {
    return moduleDecl.body.filter((decl): decl is ImportDecl => decl.kind === "ImportDecl");
  }

  private mergeImportedSymbols(
    importDecl: ImportDecl,
    importedSymbols: ModuleSymbols,
    functions: Map<string, FunctionSymbol>,
    types: Map<string, TypeDecl>
  ): void {
    const names = importDecl.names ?? [
      ...importedSymbols.functions.keys(),
      ...importedSymbols.types.keys()
    ];

    for (const name of names) {
      const importedFunction = importedSymbols.functions.get(name);
      const importedType = importedSymbols.types.get(name);

      if (importedFunction === undefined && importedType === undefined) {
        this.addDiagnostic({
          code: "ANPL_SEMANTIC_UNKNOWN_SYMBOL",
          message: `Module '${importDecl.module}' does not export '${name}'.`,
          span: importDecl.span,
          symbol: name
        });
        continue;
      }

      if (importedFunction !== undefined) {
        if (functions.has(name)) {
          this.addDiagnostic({
            code: "ANPL_SEMANTIC_IMPORT_CONFLICT",
            message: `Imported function '${name}' conflicts with an existing function.`,
            span: importDecl.span,
            symbol: name
          });
        } else {
          functions.set(name, importedFunction);
        }
      }

      if (importedType !== undefined) {
        if (types.has(name)) {
          this.addDiagnostic({
            code: "ANPL_SEMANTIC_IMPORT_CONFLICT",
            message: `Imported type '${name}' conflicts with an existing type.`,
            span: importDecl.span,
            symbol: name
          });
        } else {
          types.set(name, importedType);
        }
      }
    }
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
        if (scope.has(statement.name)) {
          this.addDiagnostic({
            code: "ANPL_SEMANTIC_DUPLICATE_SYMBOL",
            message: `Variable '${statement.name}' is already defined in this scope.`,
            span: statement.span,
            symbol: statement.name
          });
        }
        if (statement.type !== undefined && this.isEnumType(statement.type)) {
          this.checkTypeRef(statement.type, symbols);
          this.checkEnumValue(
            statement.type,
            statement.value,
            scope,
            symbols,
            statement.span
          );
          scope.set(statement.name, statement.type);
          break;
        }
        const valueType = this.inferExpr(statement.value, scope, symbols);
        if (statement.type !== undefined) {
          this.checkTypeRef(statement.type, symbols);
          this.expectType(statement.type, valueType, statement.span);
        }
        scope.set(statement.name, statement.type ?? valueType);
        break;
      }
      case "ReturnStmt": {
        if (statement.value !== undefined && this.isEnumType(returnType)) {
          this.checkEnumValue(returnType, statement.value, scope, symbols, statement.span);
          break;
        }
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

        const builtin = builtinFunctions.get(expr.callee.name);
        if (builtin !== undefined) {
          this.checkCallArgs(expr.callee.name, builtin, expr.args, scope, symbols, expr.span);
          return this.typeRef(builtin.returnType, expr.span);
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
          if (expected !== undefined) {
            if (this.isEnumType(expected)) {
              this.checkEnumValue(expected, arg, scope, symbols, arg.span);
            } else {
              const received = this.inferExpr(arg, scope, symbols);
              this.expectType(expected, received, arg.span);
            }
          }
        }

        return fn.returnType;
      }

      case "RecordExpr":
        return this.checkRecordExpr(expr, scope, symbols);

      case "MemberExpr": {
        const objectType = this.inferExpr(expr.object, scope, symbols);
        if (objectType.name === "unknown") {
          return objectType;
        }
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
      } else if (this.isEnumType(expected.type)) {
        this.checkEnumValue(expected.type, field.value, scope, symbols, field.span);
      } else {
        const received = this.inferExpr(field.value, scope, symbols);
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
    if (typeRef.name === "enum") {
      const variants = this.enumVariants(typeRef);
      if (variants.length === 0) {
        this.addDiagnostic({
          code: "ANPL_ENUM_EMPTY",
          message: "Enum type must declare at least one variant.",
          span: typeRef.span,
          symbol: "enum"
        });
      }
      return;
    }

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

    for (const typeArg of typeRef.typeArgs ?? []) {
      this.checkTypeRef(typeArg, symbols);
    }
  }

  private checkCallArgs(
    name: string,
    fn: BuiltinFunction,
    args: Expr[],
    scope: Map<string, TypeRef>,
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
        this.expectType(this.typeRef(expected, arg.span), received, arg.span);
      }
    }
  }

  private checkEnumValue(
    expected: TypeRef,
    expr: Expr,
    scope: Map<string, TypeRef>,
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
      if (this.sameType(expected, received) || received.name === "unknown") {
        return;
      }
      receivedName = received.name;
    }

    this.addDiagnostic({
      code: "ANPL_TYPE_MISMATCH",
      message: `Expected enum variant ${variants.map((variant) => `'${variant}'`).join(" | ")}.`,
      span,
      expected: `enum[${variants.join(", ")}]`,
      received: receivedName
    });
  }

  private enumVariants(typeRef: TypeRef): string[] {
    return (typeRef.typeArgs ?? []).map((variant) => variant.name);
  }

  private isEnumType(typeRef: TypeRef): boolean {
    return typeRef.name === "enum";
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
