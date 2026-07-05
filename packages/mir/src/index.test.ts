import { describe, expect, it } from "vitest";
import { parseAnpl } from "@anpl/parser";
import { lowerProgramToHir } from "@anpl/hir";
import { lowerHirToMir } from "./index.js";

describe("MIR lowering", () => {
  it("creates module-aware MIR function shells", () => {
    const parsed = parseAnpl(`module math

fn main() -> int {
  return 1
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const mir = lowerHirToMir(lowerProgramToHir(parsed.program));

    expect(mir.functions[0]).toMatchObject({
      id: "math.main",
      blocks: [
        {
          id: "math.main.entry"
        }
      ]
    });
  });
});
