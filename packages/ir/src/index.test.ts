import { describe, expect, it } from "vitest";
import { parseAnpl } from "@anpl/parser";
import { lowerProgram } from "./index.js";

describe("IR lowering", () => {
  it("lowers a math program", () => {
    const parsed = parseAnpl(`module math

fn add(a: int, b: int) -> int {
  return a + b
}`);

    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const ir = lowerProgram(parsed.program);

    expect(ir.modules[0]?.functions[0]).toMatchObject({
      name: "add",
      body: [
        {
          op: "return",
          value: {
            op: "binary",
            operator: "+"
          }
        }
      ]
    });
  });
});
