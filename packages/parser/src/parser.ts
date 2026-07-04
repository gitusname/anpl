import type {
  BinaryOperator,
  BlockStmt,
  CallExpr,
  Decl,
  Expr,
  FieldDecl,
  FunctionDecl,
  IdentifierExpr,
  IfStmt,
  ImportDecl,
  LetStmt,
  LiteralExpr,
  MemberExpr,
  ModuleDecl,
  Param,
  Program,
  RecordExpr,
  RecordFieldExpr,
  ReturnStmt,
  Stmt,
  TypeDecl,
  TypeRef
} from "@anpl/ast";
import type { Diagnostic, Span } from "@anpl/core";
import { createDiagnostic } from "@anpl/core";
import { lexAnpl } from "@anpl/lexer";
import type { Token, TokenType } from "@anpl/lexer";

export type ParseResult =
  | {
      ok: true;
      program: Program;
      diagnostics: [];
    }
  | {
      ok: false;
      program?: Program;
      diagnostics: Diagnostic[];
    };

const typeKeywords = new Set(["int", "text", "bool", "uuid", "decimal", "string"]);

export function parseAnpl(source: string, file?: string): ParseResult {
  const lexResult = lexAnpl(source, file);
  const parser = new Parser(lexResult.tokens, file, [...lexResult.diagnostics]);
  const program = parser.parseProgram();
  const diagnostics = parser.getDiagnostics();

  if (!lexResult.ok || diagnostics.length > 0) {
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

class Parser {
  private current = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly file: string | undefined,
    private readonly diagnostics: Diagnostic[]
  ) {}

  getDiagnostics(): Diagnostic[] {
    return this.diagnostics;
  }

  parseProgram(): Program {
    this.skipNewlines();
    const start = this.peek();
    const modules: ModuleDecl[] = [];

    while (!this.isAtEnd()) {
      if (this.checkKeyword("module")) {
        modules.push(this.parseModule());
      } else {
        this.addDiagnostic(
          "ANPL_PARSE_UNEXPECTED_TOKEN",
          this.peek(),
          `Expected module declaration, received '${this.peek().value}'.`
        );
        this.advance();
      }
      this.skipNewlines();
    }

    return {
      kind: "Program",
      modules,
      span: this.spanBetween(start, this.previous())
    };
  }

  private parseModule(): ModuleDecl {
    const start = this.expectKeyword("module");
    const name = this.expectIdentifier("ANPL_PARSE_EXPECTED_IDENTIFIER");
    const body: Decl[] = [];
    this.skipNewlines();

    while (!this.isAtEnd() && !this.checkKeyword("module")) {
      if (this.checkKeyword("import")) {
        body.push(this.parseImport());
      } else if (this.checkKeyword("type")) {
        body.push(this.parseTypeDecl());
      } else if (this.checkKeyword("fn")) {
        body.push(this.parseFunctionDecl());
      } else {
        this.addDiagnostic(
          "ANPL_PARSE_UNEXPECTED_TOKEN",
          this.peek(),
          `Unexpected module item '${this.peek().value}'.`
        );
        this.synchronizeToNextDecl();
      }
      this.skipNewlines();
    }

    return {
      kind: "ModuleDecl",
      name: name.value,
      body,
      span: this.spanBetween(start, this.previous())
    };
  }

  private parseImport(): ImportDecl {
    const start = this.expectKeyword("import");
    const module = this.expectIdentifier("ANPL_PARSE_EXPECTED_IDENTIFIER");

    return {
      kind: "ImportDecl",
      module: module.value,
      span: this.spanBetween(start, module)
    };
  }

  private parseTypeDecl(): TypeDecl {
    const start = this.expectKeyword("type");
    const name = this.expectIdentifier("ANPL_PARSE_EXPECTED_IDENTIFIER");
    this.expect("lbrace", "ANPL_PARSE_EXPECTED_LBRACE", "Expected '{' after type name.");
    this.skipNewlines();
    const fields: FieldDecl[] = [];

    while (!this.isAtEnd() && !this.check("rbrace")) {
      fields.push(this.parseFieldDecl());
      this.skipFieldSeparator();
    }

    const end = this.expect("rbrace", "ANPL_PARSE_EXPECTED_RBRACE", "Expected '}' after type.");

    return {
      kind: "TypeDecl",
      name: name.value,
      fields,
      span: this.spanBetween(start, end)
    };
  }

  private parseFieldDecl(): FieldDecl {
    const start = this.expectIdentifier("ANPL_PARSE_EXPECTED_IDENTIFIER");
    const optional = this.match("question");
    this.expect("colon", "ANPL_PARSE_EXPECTED_COLON", "Expected ':' after field name.");
    const type = this.parseTypeRef();

    return {
      kind: "FieldDecl",
      name: start.value,
      optional,
      type,
      span: this.spanBetween(start, this.previous())
    };
  }

  private parseFunctionDecl(): FunctionDecl {
    const start = this.expectKeyword("fn");
    const name = this.expectIdentifier("ANPL_PARSE_EXPECTED_IDENTIFIER");
    this.expect("lparen", "ANPL_PARSE_EXPECTED_LPAREN", "Expected '(' after function name.");
    const params: Param[] = [];

    if (!this.check("rparen")) {
      do {
        params.push(this.parseParam());
      } while (this.match("comma"));
    }

    this.expect("rparen", "ANPL_PARSE_EXPECTED_RPAREN", "Expected ')' after parameters.");
    this.expect("arrow", "ANPL_PARSE_EXPECTED_ARROW", "Expected '->' before return type.");
    const returnType = this.parseTypeRef();
    const body = this.parseBlock();

    return {
      kind: "FunctionDecl",
      name: name.value,
      params,
      returnType,
      body,
      span: this.spanBetweenSpans(start.span, body.span)
    };
  }

  private parseParam(): Param {
    const start = this.expectIdentifier("ANPL_PARSE_EXPECTED_IDENTIFIER");
    this.expect("colon", "ANPL_PARSE_EXPECTED_COLON", "Expected ':' after parameter name.");
    const type = this.parseTypeRef();

    return {
      kind: "Param",
      name: start.value,
      type,
      span: this.spanBetween(start, this.previous())
    };
  }

  private parseTypeRef(): TypeRef {
    const start = this.expectTypeName();
    let typeArgs: TypeRef[] | undefined;

    if (this.match("lbracket")) {
      typeArgs = [];
      if (!this.check("rbracket")) {
        do {
          typeArgs.push(this.parseTypeRef());
        } while (this.match("comma"));
      }
      this.expect("rbracket", "ANPL_PARSE_EXPECTED_RBRACKET", "Expected ']' after type arguments.");
    }

    return {
      kind: "TypeRef",
      name: start.value,
      typeArgs,
      span: this.spanBetween(start, this.previous())
    };
  }

  private parseBlock(): BlockStmt {
    const start = this.expect("lbrace", "ANPL_PARSE_EXPECTED_LBRACE", "Expected '{' before block.");
    this.skipNewlines();
    const statements: Stmt[] = [];

    while (!this.isAtEnd() && !this.check("rbrace")) {
      statements.push(this.parseStatement());
      this.skipStatementSeparator();
    }

    const end = this.expect("rbrace", "ANPL_PARSE_EXPECTED_RBRACE", "Expected '}' after block.");
    const block: BlockStmt = {
      kind: "BlockStmt",
      statements,
      span: this.spanBetween(start, end)
    };

    return block;
  }

  private parseStatement(): Stmt {
    if (this.checkKeyword("let")) {
      return this.parseLetStmt();
    }
    if (this.checkKeyword("return")) {
      return this.parseReturnStmt();
    }
    if (this.checkKeyword("if")) {
      return this.parseIfStmt();
    }

    const expression = this.parseExpression();
    return {
      kind: "ExprStmt",
      expression,
      span: expression.span
    };
  }

  private parseLetStmt(): LetStmt {
    const start = this.expectKeyword("let");
    const name = this.expectIdentifier("ANPL_PARSE_EXPECTED_IDENTIFIER");
    let type: TypeRef | undefined;

    if (this.match("colon")) {
      type = this.parseTypeRef();
    }

    this.expect("equal", "ANPL_PARSE_EXPECTED_EQUAL", "Expected '=' in let statement.");
    const value = this.parseExpression();

    return {
      kind: "LetStmt",
      name: name.value,
      type,
      value,
      span: this.spanBetween(start, this.previous())
    };
  }

  private parseReturnStmt(): ReturnStmt {
    const start = this.expectKeyword("return");
    const value =
      this.check("newline") || this.check("rbrace") || this.isAtEnd()
        ? undefined
        : this.parseExpression();

    return {
      kind: "ReturnStmt",
      value,
      span: this.spanBetween(start, this.previous())
    };
  }

  private parseIfStmt(): IfStmt {
    const start = this.expectKeyword("if");
    const condition = this.parseExpression();
    const thenBranch = this.parseBlock();
    let elseBranch: BlockStmt | IfStmt | undefined;

    this.skipNewlines();
    if (this.matchKeyword("else")) {
      elseBranch = this.checkKeyword("if") ? this.parseIfStmt() : this.parseBlock();
    }

    return {
      kind: "IfStmt",
      condition,
      thenBranch,
      elseBranch,
      span: this.spanBetween(start, this.previous())
    };
  }

  private parseExpression(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let expr = this.parseAnd();

    while (this.matchKeyword("or")) {
      const operator = this.previous();
      const right = this.parseAnd();
      expr = this.binary(expr, operator, right);
    }

    return expr;
  }

  private parseAnd(): Expr {
    let expr = this.parseEquality();

    while (this.matchKeyword("and")) {
      const operator = this.previous();
      const right = this.parseEquality();
      expr = this.binary(expr, operator, right);
    }

    return expr;
  }

  private parseEquality(): Expr {
    let expr = this.parseComparison();

    while (this.match("equalEqual") || this.match("bangEqual")) {
      const operator = this.previous();
      const right = this.parseComparison();
      expr = this.binary(expr, operator, right);
    }

    return expr;
  }

  private parseComparison(): Expr {
    let expr = this.parseTerm();

    while (
      this.match("less") ||
      this.match("lessEqual") ||
      this.match("greater") ||
      this.match("greaterEqual")
    ) {
      const operator = this.previous();
      const right = this.parseTerm();
      expr = this.binary(expr, operator, right);
    }

    return expr;
  }

  private parseTerm(): Expr {
    let expr = this.parseFactor();

    while (this.match("plus") || this.match("minus")) {
      const operator = this.previous();
      const right = this.parseFactor();
      expr = this.binary(expr, operator, right);
    }

    return expr;
  }

  private parseFactor(): Expr {
    let expr = this.parseCall();

    while (this.match("star") || this.match("slash") || this.match("percent")) {
      const operator = this.previous();
      const right = this.parseCall();
      expr = this.binary(expr, operator, right);
    }

    return expr;
  }

  private parseCall(): Expr {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match("lparen")) {
        const args: Expr[] = [];
        if (!this.check("rparen")) {
          do {
            args.push(this.parseExpression());
          } while (this.match("comma"));
        }
        const end = this.expect("rparen", "ANPL_PARSE_EXPECTED_RPAREN", "Expected ')' after call.");
        expr = {
          kind: "CallExpr",
          callee: expr,
          args,
          span: this.spanBetweenExpr(expr, end)
        } satisfies CallExpr;
      } else if (this.match("dot")) {
        const property = this.expectIdentifier("ANPL_PARSE_EXPECTED_IDENTIFIER");
        expr = {
          kind: "MemberExpr",
          object: expr,
          property: property.value,
          span: this.spanBetweenExpr(expr, property)
        } satisfies MemberExpr;
      } else {
        break;
      }
    }

    return expr;
  }

  private parsePrimary(): Expr {
    if (this.match("number")) {
      const token = this.previous();
      return this.literal(Number(token.value), token);
    }

    if (this.match("string")) {
      const token = this.previous();
      return this.literal(token.value, token);
    }

    if (this.matchKeyword("true")) {
      return this.literal(true, this.previous());
    }

    if (this.matchKeyword("false")) {
      return this.literal(false, this.previous());
    }

    if (this.matchKeyword("null")) {
      return this.literal(null, this.previous());
    }

    if (this.check("identifier") || this.check("keyword")) {
      const name = this.advance();
      if (this.check("lbrace")) {
        return this.parseRecordExpr(name);
      }
      return {
        kind: "IdentifierExpr",
        name: name.value,
        span: name.span
      } satisfies IdentifierExpr;
    }

    if (this.match("lparen")) {
      const expr = this.parseExpression();
      this.expect("rparen", "ANPL_PARSE_EXPECTED_RPAREN", "Expected ')' after expression.");
      return expr;
    }

    this.addDiagnostic(
      "ANPL_PARSE_UNEXPECTED_TOKEN",
      this.peek(),
      `Expected expression, received '${this.peek().value}'.`
    );
    const token = this.advance();
    return this.literal(null, token);
  }

  private parseRecordExpr(name: Token): RecordExpr {
    this.expect("lbrace", "ANPL_PARSE_EXPECTED_LBRACE", "Expected '{' after record type.");
    this.skipNewlines();
    const fields: RecordFieldExpr[] = [];

    while (!this.isAtEnd() && !this.check("rbrace")) {
      const fieldName = this.expectIdentifier("ANPL_PARSE_EXPECTED_IDENTIFIER");
      this.expect("colon", "ANPL_PARSE_EXPECTED_COLON", "Expected ':' after record field.");
      const value = this.parseExpression();
      fields.push({
        kind: "RecordFieldExpr",
        name: fieldName.value,
        value,
        span: this.spanBetween(fieldName, this.previous())
      });
      this.skipFieldSeparator();
    }

    const end = this.expect("rbrace", "ANPL_PARSE_EXPECTED_RBRACE", "Expected '}' after record.");

    return {
      kind: "RecordExpr",
      typeName: name.value,
      fields,
      span: this.spanBetween(name, end)
    };
  }

  private binary(left: Expr, operator: Token, right: Expr): Expr {
    return {
      kind: "BinaryExpr",
      operator: operator.value as BinaryOperator,
      left,
      right,
      span: this.spanBetweenSpans(left.span, right.span)
    };
  }

  private literal(value: LiteralExpr["value"], token: Token): LiteralExpr {
    return {
      kind: "LiteralExpr",
      value,
      span: token.span
    };
  }

  private skipStatementSeparator(): void {
    this.skipNewlines();
  }

  private skipFieldSeparator(): void {
    while (this.match("comma") || this.match("newline")) {
      // Fields can be comma-separated or newline-separated.
    }
  }

  private skipNewlines(): void {
    while (this.match("newline")) {
      // Newlines are statement separators.
    }
  }

  private synchronizeToNextDecl(): void {
    while (
      !this.isAtEnd() &&
      !this.checkKeyword("import") &&
      !this.checkKeyword("type") &&
      !this.checkKeyword("fn") &&
      !this.checkKeyword("module")
    ) {
      this.advance();
    }
  }

  private expectTypeName(): Token {
    if (
      this.check("identifier") ||
      (this.check("keyword") && typeKeywords.has(this.peek().value)) ||
      this.checkKeyword("enum")
    ) {
      return this.advance();
    }

    this.addDiagnostic(
      "ANPL_PARSE_EXPECTED_TYPE",
      this.peek(),
      `Expected type name, received '${this.peek().value}'.`
    );
    return this.advance();
  }

  private expectIdentifier(code: string): Token {
    if (this.check("identifier")) {
      return this.advance();
    }

    this.addDiagnostic(code, this.peek(), `Expected identifier, received '${this.peek().value}'.`);
    return this.advance();
  }

  private expectKeyword(value: string): Token {
    if (this.checkKeyword(value)) {
      return this.advance();
    }

    this.addDiagnostic(
      "ANPL_PARSE_UNEXPECTED_TOKEN",
      this.peek(),
      `Expected '${value}', received '${this.peek().value}'.`
    );
    return this.advance();
  }

  private expect(type: TokenType, code: string, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }

    this.addDiagnostic(code, this.peek(), message);
    return this.peek();
  }

  private match(type: TokenType): boolean {
    if (!this.check(type)) {
      return false;
    }
    this.advance();
    return true;
  }

  private matchKeyword(value: string): boolean {
    if (!this.checkKeyword(value)) {
      return false;
    }
    this.advance();
    return true;
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private checkKeyword(value: string): boolean {
    return this.peek().type === "keyword" && this.peek().value === value;
  }

  private isAtEnd(): boolean {
    return this.peek().type === "eof";
  }

  private peek(): Token {
    return this.tokens[this.current] ?? this.tokens[this.tokens.length - 1]!;
  }

  private previous(): Token {
    return this.tokens[this.current - 1] ?? this.peek();
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current += 1;
    }
    return this.previous();
  }

  private addDiagnostic(code: string, token: Token, message: string): void {
    this.diagnostics.push(
      createDiagnostic({
        code,
        severity: "error",
        message,
        file: this.file,
        line: token.line,
        column: token.column,
        span: token.span,
        confidence: "high"
      })
    );
  }

  private spanBetween(start: Token, end: Token): Span {
    return this.spanBetweenSpans(start.span, end.span);
  }

  private spanBetweenExpr(start: Expr, end: Token): Span {
    return this.spanBetweenSpans(start.span, end.span);
  }

  private spanBetweenSpans(start: Span, end: Span): Span {
    return {
      file: start.file ?? end.file,
      start: start.start,
      end: end.end
    };
  }
}
