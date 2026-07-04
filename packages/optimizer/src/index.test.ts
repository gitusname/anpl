import { describe, expect, it } from "vitest";
import type { IRProgram } from "@anpl/ir";
import { optimizeProgram } from "./index.js";

describe("optimizer", () => {
  it("folds numeric constants", () => {
    const program: IRProgram = {
      modules: [
        {
          name: "math",
          types: [],
          functions: [
            {
              name: "main",
              params: [],
              returnType: "int",
              body: [
                {
                  op: "return",
                  value: {
                    op: "binary",
                    operator: "+",
                    left: { op: "literal", value: 2 },
                    right: { op: "literal", value: 3 }
                  }
                }
              ]
            }
          ]
        }
      ]
    };

    expect(optimizeProgram(program).modules[0]?.functions[0]?.body[0]).toMatchObject({
      op: "return",
      value: {
        op: "literal",
        value: 5
      }
    });
  });
});
