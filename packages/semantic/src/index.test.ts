import { describe, expect, it } from "vitest";
import { parseAnpl } from "@anpl/parser";
import { analyzeProgram } from "./index.js";

function analyze(source: string) {
  const parsed = parseAnpl(source, "test.anpl");
  if (!parsed.ok) {
    throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }
  return analyzeProgram(parsed.program);
}

describe("semantic analyzer", () => {
  it("accepts a valid math program", () => {
    const result = analyze(`module math

fn add(a: int, b: int) -> int {
  return a + b
}

fn main() -> int {
  let result = add(2, 3)
  return result
}`);

    expect(result.ok).toBe(true);
  });

  it("reports return type mismatches", () => {
    const result = analyze(`module math

fn broken() -> int {
  return "hello"
}`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ANPL_RETURN_TYPE_MISMATCH"
        })
      ])
    );
  });

  it("reports unknown symbols", () => {
    const result = analyze(`module math

fn main() -> int {
  return missing
}`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ANPL_SEMANTIC_UNKNOWN_SYMBOL",
          symbol: "missing"
        })
      ])
    );
  });
});
