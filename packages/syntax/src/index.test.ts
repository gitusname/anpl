import { describe, expect, it } from "vitest";
import { lexAnpl } from "@anpl/lexer";
import { createCstNode } from "./index.js";

describe("CST helpers", () => {
  it("creates a source-spanned CST node", () => {
    const lexed = lexAnpl("module math");
    const node = createCstNode("Program", lexed.tokens.slice(0, 2));

    expect(node.kind).toBe("Program");
    expect(node.span.start.offset).toBe(0);
    expect(node.span.end.offset).toBe(11);
  });
});
