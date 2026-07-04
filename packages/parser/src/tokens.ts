export type TokenType =
  | "identifier"
  | "keyword"
  | "number"
  | "string"
  | "lbrace"
  | "rbrace"
  | "lbracket"
  | "rbracket"
  | "colon"
  | "comma"
  | "newline"
  | "eof";

export type Token = {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  offset: number;
};

export const keywords = [
  "app",
  "entity",
  "api",
  "auth",
  "database",
  "create",
  "list",
  "get",
  "update",
  "delete",
  "by",
  "type",
  "roles",
  "provider",
  "orm",
  "ref",
  "enum",
  "primary",
  "required",
  "optional",
  "auto",
  "default",
  "paginated",
  "soft",
  "unique",
  "jwt",
  "none",
  "postgres",
  "sqlite",
  "mysql",
  "prisma",
  "string",
  "int",
  "uuid",
  "datetime",
  "decimal",
  "boolean"
] as const;

export type Keyword = (typeof keywords)[number];

export const keywordSet: ReadonlySet<string> = new Set(keywords);
