import { describe, expect, it } from "vitest";
import { lexAnpl } from "@anpl/lexer";
import { createCstNode, createSpannedCstNode } from "./index.js";

describe("CST helpers", () => {
  it("creates a source-spanned CST node", () => {
    const lexed = lexAnpl("module math");
    const node = createCstNode("Program", lexed.tokens.slice(0, 2));

    expect(node.kind).toBe("Program");
    expect(node.span.start.offset).toBe(0);
    expect(node.span.end.offset).toBe(11);
  });

  it("stores diagnostics and recovery data on CST nodes", () => {
    const lexed = lexAnpl("module math bad");
    const skippedTokens = lexed.tokens.filter((token) => token.value === "bad");
    const node = createCstNode("Program", lexed.tokens, [], [
      {
        recovered: true,
        skippedTokens,
        reason: "test-recovery"
      }
    ]);

    expect(node.recoveryData).toMatchObject([
      {
        recovered: true,
        reason: "test-recovery"
      }
    ]);
  });

  it("creates an explicitly spanned CST node", () => {
    const lexed = lexAnpl("module math");
    const node = createSpannedCstNode("ModuleDecl", lexed.tokens[0]!.span, [
      lexed.tokens[0]!
    ]);

    expect(node.kind).toBe("ModuleDecl");
    expect(node.span).toEqual(lexed.tokens[0]!.span);
    expect(node.children[0]).toBe(lexed.tokens[0]);
  });
});
