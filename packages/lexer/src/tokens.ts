import type { Span } from "@anpl/core";

export type TokenType =
  | "identifier"
  | "keyword"
  | "number"
  | "string"
  | "lbrace"
  | "rbrace"
  | "lparen"
  | "rparen"
  | "lbracket"
  | "rbracket"
  | "colon"
  | "comma"
  | "dot"
  | "question"
  | "arrow"
  | "plus"
  | "minus"
  | "star"
  | "slash"
  | "percent"
  | "equal"
  | "equalEqual"
  | "bangEqual"
  | "less"
  | "lessEqual"
  | "greater"
  | "greaterEqual"
  | "newline"
  | "eof";

export type Token = {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  offset: number;
  span: Span;
};

export const keywords = [
  "module",
  "import",
  "type",
  "fn",
  "let",
  "return",
  "if",
  "else",
  "true",
  "false",
  "null",
  "and",
  "or",
  "enum",
  "int",
  "text",
  "bool",
  "uuid",
  "decimal",
  "string"
] as const;

export type Keyword = (typeof keywords)[number];

export const keywordSet: ReadonlySet<string> = new Set(keywords);
