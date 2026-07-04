import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lex } from "./lexer.js";
import type { TokenType } from "./tokens.js";

function tokenPairs(source: string): Array<[TokenType, string]> {
  return lex(source).map((token) => [token.type, token.value]);
}

describe("lexer", () => {
  it("tokenizes app declaration", () => {
    const tokens = lex("app CRM");

    expect(tokens).toEqual([
      { type: "keyword", value: "app", line: 1, column: 1, offset: 0 },
      { type: "identifier", value: "CRM", line: 1, column: 5, offset: 4 },
      { type: "eof", value: "", line: 1, column: 8, offset: 7 }
    ]);
  });

  it("tokenizes entity block", () => {
    expect(tokenPairs("entity Customer {\n  id: uuid primary\n}")).toEqual([
      ["keyword", "entity"],
      ["identifier", "Customer"],
      ["lbrace", "{"],
      ["newline", "\n"],
      ["identifier", "id"],
      ["colon", ":"],
      ["keyword", "uuid"],
      ["keyword", "primary"],
      ["newline", "\n"],
      ["rbrace", "}"],
      ["eof", ""]
    ]);
  });

  it("tokenizes enum field", () => {
    expect(
      tokenPairs("status: enum[pending, paid, cancelled] default pending")
    ).toEqual([
      ["identifier", "status"],
      ["colon", ":"],
      ["keyword", "enum"],
      ["lbracket", "["],
      ["identifier", "pending"],
      ["comma", ","],
      ["identifier", "paid"],
      ["comma", ","],
      ["identifier", "cancelled"],
      ["rbracket", "]"],
      ["keyword", "default"],
      ["identifier", "pending"],
      ["eof", ""]
    ]);
  });

  it("ignores comments", () => {
    expect(tokenPairs("app CRM # this is ignored\n# full line\nentity User")).toEqual([
      ["keyword", "app"],
      ["identifier", "CRM"],
      ["newline", "\n"],
      ["newline", "\n"],
      ["keyword", "entity"],
      ["identifier", "User"],
      ["eof", ""]
    ]);
  });

  it("tokenizes examples/crm.anpl without throwing", () => {
    const source = readFileSync(join(process.cwd(), "examples", "crm.anpl"), "utf8");

    expect(() => lex(source)).not.toThrow();
    expect(lex(source).some((token) => token.value === "CustomerAPI")).toBe(true);
  });

  it("checks that eof token exists", () => {
    const tokens = lex("app CRM");

    expect(tokens.at(-1)).toMatchObject({
      type: "eof",
      value: ""
    });
  });
});
