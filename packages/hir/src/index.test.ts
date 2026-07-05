import { describe, expect, it } from "vitest";
import { parseAnpl } from "@anpl/parser";
import { lowerProgramToHir } from "./index.js";

describe("HIR lowering", () => {
  it("preserves module-aware function IDs", () => {
    const parsed = parseAnpl(`module math

fn add(a: int, b: int) -> int {
  return a + b
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const hir = lowerProgramToHir(parsed.program);

    expect(hir.modules[0]?.functions[0]?.id).toBe("math.add");
    expect(hir.modules[0]?.functions[0]?.returnType).toBe("int");
  });
});
