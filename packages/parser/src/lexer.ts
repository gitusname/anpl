import { keywordSet, type Token, type TokenType } from "./tokens.js";

const symbolTokenTypes: Partial<Record<string, TokenType>> = {
  "{": "lbrace",
  "}": "rbrace",
  "[": "lbracket",
  "]": "rbracket",
  ":": "colon",
  ",": "comma"
};

export class LexerError extends Error {
  readonly line: number;
  readonly column: number;
  readonly offset: number;

  constructor(message: string, line: number, column: number, offset: number) {
    super(message);
    this.name = "LexerError";
    this.line = line;
    this.column = column;
    this.offset = offset;
  }
}

export function lex(source: string): Token[] {
  const lexer = new Lexer(source);

  return lexer.lex();
}

export const tokenize = lex;

class Lexer {
  private readonly tokens: Token[] = [];
  private offset = 0;
  private line = 1;
  private column = 1;

  constructor(private readonly source: string) {}

  lex(): Token[] {
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

      const symbolType = symbolTokenTypes[char];
      if (symbolType !== undefined) {
        this.addToken(symbolType, char);
        this.advance();
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

      throw new LexerError(
        `Unexpected character '${char}'.`,
        this.line,
        this.column,
        this.offset
      );
    }

    this.tokens.push({
      type: "eof",
      value: "",
      line: this.line,
      column: this.column,
      offset: this.offset
    });

    return this.tokens;
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

  private advanceNewline(): void {
    const start = this.current();

    if (start === "\r" && this.peek() === "\n") {
      this.offset += 2;
    } else {
      this.offset += 1;
    }

    this.line += 1;
    this.column = 1;

  }

  private addToken(type: TokenType, value: string): void {
    this.tokens.push({
      type,
      value,
      line: this.line,
      column: this.column,
      offset: this.offset
    });
  }

  private addNewlineToken(): void {
    const token: Token = {
      type: "newline",
      value: "\n",
      line: this.line,
      column: this.column,
      offset: this.offset
    };

    this.advanceNewline();
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
    const startLine = this.line;
    const startColumn = this.column;
    const startOffset = this.offset;

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
          offset: startOffset
        });
        return;
      }

      if (char === "\n" || char === "\r") {
        throw new LexerError(
          "Unterminated string literal.",
          startLine,
          startColumn,
          startOffset
        );
      }

      if (char === "\\") {
        value += this.readEscapeSequence(startLine, startColumn, startOffset);
        continue;
      }

      value += char;
      this.advance();
    }

    throw new LexerError(
      "Unterminated string literal.",
      startLine,
      startColumn,
      startOffset
    );
  }

  private readEscapeSequence(
    startLine: number,
    startColumn: number,
    startOffset: number
  ): string {
    this.advance();

    if (this.isAtEnd()) {
      throw new LexerError(
        "Unterminated string literal.",
        startLine,
        startColumn,
        startOffset
      );
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
    const startLine = this.line;
    const startColumn = this.column;
    const startOffset = this.offset;
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
      offset: startOffset
    });
  }

  private addIdentifierOrKeywordToken(): void {
    const startLine = this.line;
    const startColumn = this.column;
    const startOffset = this.offset;
    let value = "";

    while (!this.isAtEnd() && isIdentifierPart(this.current())) {
      value += this.advance();
    }

    this.tokens.push({
      type: keywordSet.has(value) ? "keyword" : "identifier",
      value,
      line: startLine,
      column: startColumn,
      offset: startOffset
    });
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
