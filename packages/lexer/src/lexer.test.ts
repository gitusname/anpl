import { describe, expect, it } from "vitest";
import { lexAnpl } from "./lexer.js";

function values(source: string): string[] {
  const result = lexAnpl(source);
  return result.tokens.map((token) => token.value);
}

describe("real language lexer", () => {
  it("tokenizes a function signature and body", () => {
    const result = lexAnpl(`fn add(a: int, b: int) -> int {
  return a + b
}`);

    expect(result.ok).toBe(true);
    expect(result.source).toMatchObject({
      path: "<memory>",
      lineStarts: [0, 32, 47]
    });
    expect(values("fn add(a: int) -> int")).toEqual([
      "fn",
      "add",
      "(",
      "a",
      ":",
      "int",
      ")",
      "->",
      "int",
      ""
    ]);
    expect(result.tokens.some((token) => token.type === "arrow")).toBe(true);
    expect(result.tokens.at(-1)?.type).toBe("eof");
  });

  it("ignores comments and preserves newline tokens", () => {
    const result = lexAnpl("module math # comment\nfn main() -> int");

    expect(result.ok).toBe(true);
    expect(result.tokens.map((token) => token.type)).toContain("newline");
    expect(result.tokens.some((token) => token.value === "comment")).toBe(false);
  });

  it("preserves whitespace and comments as token trivia", () => {
    const result = lexAnpl("module math # comment\n  fn main() -> int");
    const math = result.tokens.find((token) => token.value === "math");
    const fn = result.tokens.find((token) => token.value === "fn");

    expect(result.ok).toBe(true);
    expect(math?.trailingTrivia).toMatchObject([
      {
        kind: "Whitespace",
        text: " "
      },
      {
        kind: "Comment",
        text: "# comment"
      }
    ]);
    expect(fn?.leadingTrivia).toMatchObject([
      {
        kind: "Whitespace",
        text: "  "
      }
    ]);
  });

  it("exposes production token metadata without dropping legacy fields", () => {
    const result = lexAnpl("let count = 42\nreturn true", "main.anpl");
    const count = result.tokens.find((token) => token.value === "count");
    const number = result.tokens.find((token) => token.value === "42");
    const bool = result.tokens.find((token) => token.value === "true");

    expect(result.source.path).toBe("main.anpl");
    expect(count).toMatchObject({
      kind: "identifier",
      type: "identifier",
      lexeme: "count",
      value: "count"
    });
    expect(number).toMatchObject({
      kind: "number",
      lexeme: "42",
      literal: 42
    });
    expect(bool).toMatchObject({
      kind: "keyword",
      lexeme: "true",
      literal: true
    });
  });
});
