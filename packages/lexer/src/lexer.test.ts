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
});
