import type { Diagnostic, SourceFile, Span } from "@anpl/core";
import { createDiagnostic } from "@anpl/core";
import { keywordSet, type Token, type TokenType } from "./tokens.js";

export type LexResult =
  | {
      ok: true;
      tokens: Token[];
      diagnostics: [];
    }
  | {
      ok: false;
      tokens: Token[];
      diagnostics: Diagnostic[];
    };

const singleCharacterTokens: Partial<Record<string, TokenType>> = {
  "{": "lbrace",
  "}": "rbrace",
  "(": "lparen",
  ")": "rparen",
  "[": "lbracket",
  "]": "rbracket",
  ":": "colon",
  ",": "comma",
  ".": "dot",
  "?": "question",
  "+": "plus",
  "*": "star",
  "/": "slash",
  "%": "percent"
};

export function lexAnpl(source: string | SourceFile, file?: string): LexResult {
  const input =
    typeof source === "string"
      ? {
          content: source,
          path: file
        }
      : source;
  const lexer = new Lexer(input.content, input.path);

  return lexer.lex();
}

export const lex = lexAnpl;

class Lexer {
  private readonly tokens: Token[] = [];
  private readonly diagnostics: Diagnostic[] = [];
  private offset = 0;
  private line = 1;
  private column = 1;

  constructor(
    private readonly source: string,
    private readonly file?: string
  ) {}

  lex(): LexResult {
    while (!this.isAtEnd()) {
      const char = this.current();

      if (char === " " || char === "\t") {
        this.advance();
        continue;
      }

      if (char === "#") {
        this.skipComment();
        continue;
      }

      if (char === "\n" || char === "\r") {
        this.addNewlineToken();
        continue;
      }

      if (char === "-" && this.peek() === ">") {
        this.addToken("arrow", "->", 2);
        continue;
      }

      if (char === "=" && this.peek() === "=") {
        this.addToken("equalEqual", "==", 2);
        continue;
      }

      if (char === "!" && this.peek() === "=") {
        this.addToken("bangEqual", "!=", 2);
        continue;
      }

      if (char === "<" && this.peek() === "=") {
        this.addToken("lessEqual", "<=", 2);
        continue;
      }

      if (char === ">" && this.peek() === "=") {
        this.addToken("greaterEqual", ">=", 2);
        continue;
      }

      if (char === "-") {
        this.addToken("minus", char);
        continue;
      }

      if (char === "=") {
        this.addToken("equal", char);
        continue;
      }

      if (char === "<") {
        this.addToken("less", char);
        continue;
      }

      if (char === ">") {
        this.addToken("greater", char);
        continue;
      }

      const tokenType = singleCharacterTokens[char];
      if (tokenType !== undefined) {
        this.addToken(tokenType, char);
        continue;
      }

      if (char === "\"") {
        this.addStringToken();
        continue;
      }

      if (isDigit(char)) {
        this.addNumberToken();
        continue;
      }

      if (isIdentifierStart(char)) {
        this.addIdentifierOrKeywordToken();
        continue;
      }

      this.addDiagnostic(
        "ANPL_LEX_INVALID_CHAR",
        `Unexpected character '${char}'.`,
        this.spanFor(this.offset, this.line, this.column, 1)
      );
      this.advance();
    }

    this.tokens.push(this.makeToken("eof", "", 0));

    if (this.diagnostics.length > 0) {
      return {
        ok: false,
        tokens: this.tokens,
        diagnostics: this.diagnostics
      };
    }

    return {
      ok: true,
      tokens: this.tokens,
      diagnostics: []
    };
  }

  private current(): string {
    return this.source[this.offset] ?? "";
  }

  private peek(distance = 1): string {
    return this.source[this.offset + distance] ?? "";
  }

  private isAtEnd(): boolean {
    return this.offset >= this.source.length;
  }

  private advance(): string {
    const char = this.current();
    this.offset += 1;
    this.column += 1;
    return char;
  }

  private addToken(type: TokenType, value: string, width = 1): void {
    const token = this.makeToken(type, value, width);
    this.offset += width;
    this.column += width;
    this.tokens.push(token);
  }

  private makeToken(type: TokenType, value: string, width: number): Token {
    return {
      type,
      value,
      line: this.line,
      column: this.column,
      offset: this.offset,
      span: this.spanFor(this.offset, this.line, this.column, width)
    };
  }

  private addNewlineToken(): void {
    const width = this.current() === "\r" && this.peek() === "\n" ? 2 : 1;
    const token = this.makeToken("newline", "\n", width);
    this.offset += width;
    this.line += 1;
    this.column = 1;
    this.tokens.push(token);
  }

  private skipComment(): void {
    while (!this.isAtEnd()) {
      const char = this.current();
      if (char === "\n" || char === "\r") {
        return;
      }
      this.advance();
    }
  }

  private addStringToken(): void {
    const startOffset = this.offset;
    const startLine = this.line;
    const startColumn = this.column;
    this.advance();
    let value = "";

    while (!this.isAtEnd()) {
      const char = this.current();

      if (char === "\"") {
        this.advance();
        this.tokens.push({
          type: "string",
          value,
          line: startLine,
          column: startColumn,
          offset: startOffset,
          span: this.spanFor(
            startOffset,
            startLine,
            startColumn,
            this.offset - startOffset
          )
        });
        return;
      }

      if (char === "\n" || char === "\r") {
        this.addDiagnostic(
          "ANPL_LEX_UNTERMINATED_STRING",
          "Unterminated string literal.",
          this.spanFor(startOffset, startLine, startColumn, 1)
        );
        return;
      }

      if (char === "\\") {
        value += this.readEscapeSequence();
        continue;
      }

      value += char;
      this.advance();
    }

    this.addDiagnostic(
      "ANPL_LEX_UNTERMINATED_STRING",
      "Unterminated string literal.",
      this.spanFor(startOffset, startLine, startColumn, 1)
    );
  }

  private readEscapeSequence(): string {
    this.advance();

    if (this.isAtEnd()) {
      return "";
    }

    const escaped = this.current();
    this.advance();

    switch (escaped) {
      case "\"":
        return "\"";
      case "\\":
        return "\\";
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      default:
        return escaped;
    }
  }

  private addNumberToken(): void {
    const startOffset = this.offset;
    const startLine = this.line;
    const startColumn = this.column;
    let value = "";

    while (!this.isAtEnd() && isDigit(this.current())) {
      value += this.advance();
    }

    if (this.current() === "." && isDigit(this.peek())) {
      value += this.advance();
      while (!this.isAtEnd() && isDigit(this.current())) {
        value += this.advance();
      }
    }

    this.tokens.push({
      type: "number",
      value,
      line: startLine,
      column: startColumn,
      offset: startOffset,
      span: this.spanFor(
        startOffset,
        startLine,
        startColumn,
        this.offset - startOffset
      )
    });
  }

  private addIdentifierOrKeywordToken(): void {
    const startOffset = this.offset;
    const startLine = this.line;
    const startColumn = this.column;
    let value = "";

    while (!this.isAtEnd() && isIdentifierPart(this.current())) {
      value += this.advance();
    }

    this.tokens.push({
      type: keywordSet.has(value) ? "keyword" : "identifier",
      value,
      line: startLine,
      column: startColumn,
      offset: startOffset,
      span: this.spanFor(
        startOffset,
        startLine,
        startColumn,
        this.offset - startOffset
      )
    });
  }

  private spanFor(
    offset: number,
    line: number,
    column: number,
    width: number
  ): Span {
    return {
      file: this.file,
      start: {
        offset,
        line,
        column
      },
      end: {
        offset: offset + width,
        line,
        column: column + width
      }
    };
  }

  private addDiagnostic(code: string, message: string, span: Span): void {
    this.diagnostics.push(
      createDiagnostic({
        code,
        severity: "error",
        message,
        file: this.file,
        line: span.start.line,
        column: span.start.column,
        span,
        confidence: "high"
      })
    );
  }
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isIdentifierStart(char: string): boolean {
  return (
    (char >= "A" && char <= "Z") ||
    (char >= "a" && char <= "z") ||
    char === "_"
  );
}

function isIdentifierPart(char: string): boolean {
  return isIdentifierStart(char) || isDigit(char);
}
