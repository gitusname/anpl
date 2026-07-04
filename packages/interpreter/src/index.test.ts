import { describe, expect, it } from "vitest";
import { parseAnpl } from "@anpl/parser";
import { analyzeProgram } from "@anpl/semantic";
import { lowerProgram } from "@anpl/ir";
import { interpretProgram } from "./index.js";

function run(source: string) {
  const parsed = parseAnpl(source);
  if (!parsed.ok) {
    throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }
  const semantic = analyzeProgram(parsed.program);
  if (!semantic.ok) {
    throw new Error(semantic.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }
  return interpretProgram(lowerProgram(parsed.program));
}

describe("interpreter", () => {
  it("runs main", () => {
    const result = run(`module math

fn add(a: int, b: int) -> int {
  return a + b
}

fn main() -> int {
  return add(2, 3)
}`);

    expect(result).toMatchObject({
      ok: true,
      value: 5
    });
  });
});
