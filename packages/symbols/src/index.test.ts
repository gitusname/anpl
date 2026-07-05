import { describe, expect, it } from "vitest";
import { parseAnpl } from "@anpl/parser";
import { collectProgramSymbols } from "./index.js";

describe("symbol table", () => {
  it("creates module-aware symbol IDs", () => {
    const parsed = parseAnpl(`module math

fn add(a: int, b: int) -> int {
  return a + b
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const symbols = collectProgramSymbols(parsed.program);

    expect(symbols.byQualifiedName.get("math.add")).toBe("math.add");
    expect(symbols.byModule.get("math")).toContain("math.add");
  });
});
