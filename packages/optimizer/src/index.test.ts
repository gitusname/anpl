import { describe, expect, it } from "vitest";
import type { IRProgram } from "@anpl/ir";
import type { MirProgram } from "@anpl/mir";
import { optimizeMir, optimizeProgram } from "./index.js";

describe("optimizer", () => {
  it("folds numeric constants", () => {
    const program: IRProgram = {
      modules: [
        {
          name: "math",
          types: [],
          functions: [
            {
              moduleName: "math",
              name: "main",
              qualifiedName: "math.main",
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

  it("runs MIR optimization passes with changed metadata", () => {
    const program: MirProgram = {
      functions: [
        {
          id: "math.main" as never,
          params: [],
          returnType: "int" as never,
          blocks: [
            {
              id: "math.main.entry",
              instructions: [
                { op: "const", target: "%a", value: 2, type: "int" as never },
                { op: "const", target: "%b", value: 3, type: "int" as never },
                {
                  op: "binary",
                  target: "%sum",
                  operator: "+",
                  left: "%a",
                  right: "%b",
                  type: "int" as never
                },
                {
                  op: "const",
                  target: "%unused",
                  value: 99,
                  type: "int" as never
                }
              ],
              terminator: {
                kind: "return",
                value: "%sum"
              }
            }
          ]
        }
      ]
    };

    const result = optimizeMir(program);
    const instructions = result.program.functions[0]?.blocks[0]?.instructions;

    expect(result.changed).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.passes.map((pass) => pass.name)).toEqual([
      "constant-folding",
      "copy-propagation",
      "dead-branch-removal",
      "unused-local-elimination"
    ]);
    expect(instructions).toEqual([
      {
        op: "const",
        target: "%sum",
        value: 5,
        type: "int"
      }
    ]);
  });

  it("removes MIR branches with constant conditions", () => {
    const program: MirProgram = {
      functions: [
        {
          id: "math.main" as never,
          params: [],
          returnType: "void" as never,
          blocks: [
            {
              id: "entry",
              instructions: [
                { op: "const", target: "%condition", value: false, type: "bool" as never }
              ],
              terminator: {
                kind: "branch",
                condition: "%condition",
                thenBlock: "then",
                elseBlock: "else"
              }
            }
          ]
        }
      ]
    };

    expect(optimizeMir(program).program.functions[0]?.blocks[0]?.terminator).toEqual({
      kind: "jump",
      target: "else"
    });
  });
});
