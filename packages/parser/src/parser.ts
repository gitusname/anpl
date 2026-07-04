import type {
  ApiAction,
  ApiNode,
  ApiOperationNode,
  AppNode,
  AuthNode,
  DatabaseNode,
  Diagnostic,
  EntityNode,
  FieldModifier,
  FieldNode,
  FieldTypeNode,
  ProgramNode,
  ScalarFieldName,
  Span
} from "@anpl/core";
import { lex, LexerError } from "./lexer.js";
import type { Token, TokenType } from "./tokens.js";

export type ParseResult =
  | {
      ok: true;
      program: ProgramNode;
      diagnostics: [];
    }
  | {
      ok: false;
      program?: ProgramNode;
      diagnostics: Diagnostic[];
    };

const scalarFieldNames = new Set<string>([
  "string",
  "int",
  "uuid",
  "datetime",
  "decimal",
  "boolean"
]);

const apiActions = new Set<string>([
  "create",
  "list",
  "get",
  "update",
  "delete"
]);
const fieldModifiers = new Set<string>([
  "primary",
  "required",
  "optional",
  "auto",
  "unique",
  "default"
]);

export function parseAnpl(source: string, file?: string): ParseResult {
  try {
    const parser = new Parser(lex(source), file);
    const program = parser.parseProgram();

    if (parser.diagnostics.length > 0) {
      return {
        ok: false,
        program,
        diagnostics: parser.diagnostics
      };
    }

    return {
      ok: true,
      program,
      diagnostics: []
    };
  } catch (error) {
    if (error instanceof LexerError) {
      return {
        ok: false,
        diagnostics: [
          {
            code: "ANPL_PARSE_UNEXPECTED_TOKEN",
            severity: "error",
            message: error.message,
            file,
            line: error.line,
            column: error.column,
            confidence: "high"
          }
        ]
      };
    }

    throw error;
  }
}

class Parser {
  readonly diagnostics: Diagnostic[] = [];
  private current = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly file?: string
  ) {}

  parseProgram(): ProgramNode {
    this.skipNewlines();

    const start = this.peek();
    let app: AppNode | undefined;
    const entities: EntityNode[] = [];
    const apis: ApiNode[] = [];
    let auth: AuthNode | undefined;
    let database: DatabaseNode | undefined;

    while (!this.isAtEnd()) {
      this.skipNewlines();

      if (this.isAtEnd()) {
        break;
      }

      if (this.checkKeyword("app")) {
        app = this.parseApp();
      } else if (this.checkKeyword("entity")) {
        const entity = this.parseEntity();
        if (entity !== undefined) {
          entities.push(entity);
        }
      } else if (this.checkKeyword("api")) {
        const api = this.parseApi();
        if (api !== undefined) {
          apis.push(api);
        }
      } else if (this.checkKeyword("auth")) {
        auth = this.parseAuth();
      } else if (this.checkKeyword("database")) {
        database = this.parseDatabase();
      } else {
        this.addDiagnostic(
          "ANPL_PARSE_UNEXPECTED_TOKEN",
          this.peek(),
          `Unexpected token '${this.peek().value}'.`
        );
        this.advance();
      }
    }

    return {
      kind: "Program",
      app,
      entities,
      apis,
      auth,
      database,
      span: this.spanBetween(start, this.previous())
    };
  }

  private parseApp(): AppNode | undefined {
    const start = this.expectKeyword("app", "ANPL_PARSE_UNEXPECTED_TOKEN");
    if (start === undefined) {
      return undefined;
    }

    const name = this.expectIdentifier();
    if (name === undefined) {
      this.synchronizeToLineEnd();
      return undefined;
    }

    return {
      kind: "App",
      name: name.value,
      span: this.spanBetween(start, name)
    };
  }

  private parseEntity(): EntityNode | undefined {
    const start = this.expectKeyword("entity", "ANPL_PARSE_UNEXPECTED_TOKEN");
    if (start === undefined) {
      return undefined;
    }

    const name = this.expectIdentifier();
    if (name === undefined) {
      this.synchronizeToBlockEnd();
      return undefined;
    }

    const lbrace = this.expectType(
      "lbrace",
      "ANPL_PARSE_EXPECTED_LBRACE",
      "Expected '{' after entity name."
    );
    if (lbrace === undefined) {
      this.synchronizeToBlockEnd();
      return undefined;
    }

    const fields: FieldNode[] = [];
    this.skipNewlines();

    while (!this.isAtEnd() && !this.check("rbrace")) {
      const field = this.parseField();
      if (field !== undefined) {
        fields.push(field);
      }
      this.skipNewlines();
    }

    const rbrace = this.expectType(
      "rbrace",
      "ANPL_PARSE_EXPECTED_RBRACE",
      "Expected '}' after entity block."
    );

    return {
      kind: "Entity",
      name: name.value,
      fields,
      span: this.spanBetween(start, rbrace ?? this.previous())
    };
  }

  private parseField(): FieldNode | undefined {
    const name = this.expectIdentifier();
    if (name === undefined) {
      this.synchronizeToLineEnd();
      return undefined;
    }

    const colon = this.expectType(
      "colon",
      "ANPL_PARSE_EXPECTED_COLON",
      "Expected ':' after field name."
    );
    if (colon === undefined) {
      this.synchronizeToLineEnd();
      return undefined;
    }

    const type = this.parseFieldType();
    if (type === undefined) {
      this.synchronizeToLineEnd();
      return undefined;
    }

    const modifiers: FieldModifier[] = [];
    while (!this.isAtEnd() && !this.check("newline") && !this.check("rbrace")) {
      const modifier = this.parseFieldModifier();
      if (modifier === undefined) {
        this.synchronizeToLineEnd();
        break;
      }
      modifiers.push(modifier);
    }

    return {
      kind: "Field",
      name: name.value,
      type,
      modifiers,
      span: this.spanBetween(name, this.previous())
    };
  }

  private parseFieldType(): FieldTypeNode | undefined {
    const token = this.peek();

    if (this.checkKeyword("ref")) {
      const start = this.advance();
      const entity = this.expectIdentifier();
      if (entity === undefined) {
        return undefined;
      }

      return {
        kind: "ReferenceFieldType",
        entityName: entity.value,
        span: this.spanBetween(start, entity)
      };
    }

    if (this.checkKeyword("enum")) {
      const start = this.advance();
      this.expectType(
        "lbracket",
        "ANPL_PARSE_UNEXPECTED_TOKEN",
        "Expected '[' after enum."
      );
      const values: string[] = [];

      while (!this.isAtEnd() && !this.check("rbracket")) {
        const value = this.expectValue("ANPL_PARSE_EXPECTED_IDENTIFIER");
        if (value === undefined) {
          return undefined;
        }
        values.push(value.value);

        if (!this.match("comma")) {
          break;
        }
      }

      const rbracket = this.expectType(
        "rbracket",
        "ANPL_PARSE_UNEXPECTED_TOKEN",
        "Expected ']' after enum values."
      );

      return {
        kind: "EnumFieldType",
        values,
        span: this.spanBetween(start, rbracket ?? this.previous())
      };
    }

    if (this.check("keyword") && scalarFieldNames.has(token.value)) {
      const scalar = this.advance();
      return {
        kind: "ScalarFieldType",
        name: scalar.value as ScalarFieldName,
        span: this.spanFromToken(scalar)
      };
    }

    this.addDiagnostic(
      "ANPL_PARSE_INVALID_FIELD_TYPE",
      token,
      `Invalid field type '${token.value}'.`
    );
    return undefined;
  }

  private parseFieldModifier(): FieldModifier | undefined {
    const token = this.peek();

    if (!this.check("keyword") || !fieldModifiers.has(token.value)) {
      this.addDiagnostic(
        "ANPL_PARSE_UNEXPECTED_TOKEN",
        token,
        `Unexpected field modifier '${token.value}'.`
      );
      return undefined;
    }

    const modifier = this.advance();

    switch (modifier.value) {
      case "primary":
        return {
          kind: "PrimaryModifier",
          span: this.spanFromToken(modifier)
        };
      case "required":
        return {
          kind: "RequiredModifier",
          span: this.spanFromToken(modifier)
        };
      case "optional":
        return {
          kind: "OptionalModifier",
          span: this.spanFromToken(modifier)
        };
      case "auto":
        return {
          kind: "AutoModifier",
          span: this.spanFromToken(modifier)
        };
      case "unique":
        return {
          kind: "UniqueModifier",
          span: this.spanFromToken(modifier)
        };
      case "default": {
        const value = this.expectValue("ANPL_PARSE_EXPECTED_IDENTIFIER");
        if (value === undefined) {
          return undefined;
        }
        return {
          kind: "DefaultModifier",
          value: value.value,
          span: this.spanBetween(modifier, value)
        };
      }
      default:
        return undefined;
    }
  }

  private parseApi(): ApiNode | undefined {
    const start = this.expectKeyword("api", "ANPL_PARSE_UNEXPECTED_TOKEN");
    if (start === undefined) {
      return undefined;
    }

    const name = this.expectIdentifier();
    if (name === undefined) {
      this.synchronizeToBlockEnd();
      return undefined;
    }

    const lbrace = this.expectType(
      "lbrace",
      "ANPL_PARSE_EXPECTED_LBRACE",
      "Expected '{' after api name."
    );
    if (lbrace === undefined) {
      this.synchronizeToBlockEnd();
      return undefined;
    }

    const operations: ApiOperationNode[] = [];
    this.skipNewlines();

    while (!this.isAtEnd() && !this.check("rbrace")) {
      const operation = this.parseApiOperation();
      if (operation !== undefined) {
        operations.push(operation);
      }
      this.skipNewlines();
    }

    const rbrace = this.expectType(
      "rbrace",
      "ANPL_PARSE_EXPECTED_RBRACE",
      "Expected '}' after api block."
    );

    return {
      kind: "Api",
      name: name.value,
      operations,
      span: this.spanBetween(start, rbrace ?? this.previous())
    };
  }

  private parseApiOperation(): ApiOperationNode | undefined {
    const action = this.peek();
    if (!this.check("keyword") || !apiActions.has(action.value)) {
      this.addDiagnostic(
        "ANPL_PARSE_UNEXPECTED_TOKEN",
        action,
        `Expected API operation, received '${action.value}'.`
      );
      this.synchronizeToLineEnd();
      return undefined;
    }
    this.advance();

    const entity = this.expectIdentifier();
    if (entity === undefined) {
      this.synchronizeToLineEnd();
      return undefined;
    }

    const flags: string[] = [];
    while (!this.isAtEnd() && !this.check("newline") && !this.check("rbrace")) {
      if (this.matchKeyword("paginated")) {
        flags.push("paginated");
      } else if (this.matchKeyword("soft")) {
        flags.push("soft");
      } else if (this.matchKeyword("by")) {
        flags.push("by");
        const field = this.expectIdentifier();
        if (field === undefined) {
          this.synchronizeToLineEnd();
          break;
        }
        flags.push(field.value);
      } else {
        this.addDiagnostic(
          "ANPL_PARSE_UNEXPECTED_TOKEN",
          this.peek(),
          `Unexpected API flag '${this.peek().value}'.`
        );
        this.synchronizeToLineEnd();
        break;
      }
    }

    return {
      kind: "ApiOperation",
      action: action.value as ApiAction,
      entityName: entity.value,
      flags,
      span: this.spanBetween(action, this.previous())
    };
  }

  private parseAuth(): AuthNode | undefined {
    const start = this.expectKeyword("auth", "ANPL_PARSE_UNEXPECTED_TOKEN");
    if (start === undefined) {
      return undefined;
    }

    const lbrace = this.expectType(
      "lbrace",
      "ANPL_PARSE_EXPECTED_LBRACE",
      "Expected '{' after auth."
    );
    if (lbrace === undefined) {
      this.synchronizeToBlockEnd();
      return undefined;
    }

    let type: string | undefined;
    const roles: string[] = [];
    this.skipNewlines();

    while (!this.isAtEnd() && !this.check("rbrace")) {
      if (this.matchKeyword("type")) {
        if (
          this.expectType(
            "colon",
            "ANPL_PARSE_EXPECTED_COLON",
            "Expected ':' after type."
          ) === undefined
        ) {
          this.synchronizeToLineEnd();
        } else {
          const value = this.expectValue("ANPL_PARSE_EXPECTED_IDENTIFIER");
          if (value !== undefined) {
            type = value.value;
          }
        }
      } else if (this.matchKeyword("roles")) {
        if (
          this.expectType(
            "colon",
            "ANPL_PARSE_EXPECTED_COLON",
            "Expected ':' after roles."
          ) === undefined
        ) {
          this.synchronizeToLineEnd();
        } else {
          roles.push(...this.parseValueList());
        }
      } else {
        this.addDiagnostic(
          "ANPL_PARSE_UNEXPECTED_TOKEN",
          this.peek(),
          `Unexpected auth field '${this.peek().value}'.`
        );
        this.synchronizeToLineEnd();
      }

      this.skipNewlines();
    }

    const rbrace = this.expectType(
      "rbrace",
      "ANPL_PARSE_EXPECTED_RBRACE",
      "Expected '}' after auth block."
    );

    return {
      kind: "Auth",
      type,
      roles,
      span: this.spanBetween(start, rbrace ?? this.previous())
    };
  }

  private parseDatabase(): DatabaseNode | undefined {
    const start = this.expectKeyword("database", "ANPL_PARSE_UNEXPECTED_TOKEN");
    if (start === undefined) {
      return undefined;
    }

    const lbrace = this.expectType(
      "lbrace",
      "ANPL_PARSE_EXPECTED_LBRACE",
      "Expected '{' after database."
    );
    if (lbrace === undefined) {
      this.synchronizeToBlockEnd();
      return undefined;
    }

    let provider: string | undefined;
    let orm: string | undefined;
    this.skipNewlines();

    while (!this.isAtEnd() && !this.check("rbrace")) {
      if (this.matchKeyword("provider")) {
        if (
          this.expectType(
            "colon",
            "ANPL_PARSE_EXPECTED_COLON",
            "Expected ':' after provider."
          ) === undefined
        ) {
          this.synchronizeToLineEnd();
        } else {
          const value = this.expectValue("ANPL_PARSE_EXPECTED_IDENTIFIER");
          if (value !== undefined) {
            provider = value.value;
          }
        }
      } else if (this.matchKeyword("orm")) {
        if (
          this.expectType(
            "colon",
            "ANPL_PARSE_EXPECTED_COLON",
            "Expected ':' after orm."
          ) === undefined
        ) {
          this.synchronizeToLineEnd();
        } else {
          const value = this.expectValue("ANPL_PARSE_EXPECTED_IDENTIFIER");
          if (value !== undefined) {
            orm = value.value;
          }
        }
      } else {
        this.addDiagnostic(
          "ANPL_PARSE_UNEXPECTED_TOKEN",
          this.peek(),
          `Unexpected database field '${this.peek().value}'.`
        );
        this.synchronizeToLineEnd();
      }

      this.skipNewlines();
    }

    const rbrace = this.expectType(
      "rbrace",
      "ANPL_PARSE_EXPECTED_RBRACE",
      "Expected '}' after database block."
    );

    return {
      kind: "Database",
      provider,
      orm,
      span: this.spanBetween(start, rbrace ?? this.previous())
    };
  }

  private parseValueList(): string[] {
    const values: string[] = [];

    while (!this.isAtEnd() && !this.check("newline") && !this.check("rbrace")) {
      const value = this.expectValue("ANPL_PARSE_EXPECTED_IDENTIFIER");
      if (value === undefined) {
        this.synchronizeToLineEnd();
        break;
      }
      values.push(value.value);

      if (!this.match("comma")) {
        break;
      }
    }

    return values;
  }

  private expectIdentifier(): Token | undefined {
    if (this.check("identifier")) {
      return this.advance();
    }

    this.addDiagnostic(
      "ANPL_PARSE_EXPECTED_IDENTIFIER",
      this.peek(),
      `Expected identifier, received '${this.peek().value}'.`
    );
    return undefined;
  }

  private expectValue(code: string): Token | undefined {
    if (
      this.check("identifier") ||
      this.check("keyword") ||
      this.check("string") ||
      this.check("number")
    ) {
      return this.advance();
    }

    this.addDiagnostic(
      code,
      this.peek(),
      `Expected value, received '${this.peek().value}'.`
    );
    return undefined;
  }

  private expectKeyword(value: string, code: string): Token | undefined {
    if (this.checkKeyword(value)) {
      return this.advance();
    }

    this.addDiagnostic(
      code,
      this.peek(),
      `Expected '${value}', received '${this.peek().value}'.`
    );
    return undefined;
  }

  private expectType(type: TokenType, code: string, message: string): Token | undefined {
    if (this.check(type)) {
      return this.advance();
    }

    this.addDiagnostic(code, this.peek(), message);
    return undefined;
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

  private skipNewlines(): void {
    while (this.match("newline")) {
      // Keep newlines in the token stream, but they are separators for the parser.
    }
  }

  private synchronizeToLineEnd(): void {
    while (!this.isAtEnd() && !this.check("newline") && !this.check("rbrace")) {
      this.advance();
    }
  }

  private synchronizeToBlockEnd(): void {
    while (!this.isAtEnd() && !this.check("rbrace")) {
      this.advance();
    }

    if (this.check("rbrace")) {
      this.advance();
    }
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
    this.diagnostics.push({
      code,
      severity: "error",
      message,
      file: this.file,
      line: token.line,
      column: token.column,
      span: this.spanFromToken(token),
      confidence: "high"
    });
  }

  private spanFromToken(token: Token): Span {
    return this.spanBetween(token, token);
  }

  private spanBetween(start: Token, end: Token): Span {
    return {
      file: this.file,
      start: {
        offset: start.offset,
        line: start.line,
        column: start.column
      },
      end: this.endPosition(end)
    };
  }

  private endPosition(token: Token): Span["end"] {
    const width =
      token.type === "eof"
        ? 0
        : token.type === "string"
          ? token.value.length + 2
          : token.value.length;

    if (token.type === "newline") {
      return {
        offset: token.offset + 1,
        line: token.line + 1,
        column: 1
      };
    }

    return {
      offset: token.offset + width,
      line: token.line,
      column: token.column + width
    };
  }
}
