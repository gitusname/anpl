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

  it("lowers statements and expressions into MIR instructions", () => {
    const parsed = parseAnpl(`module math

fn main() -> int {
  let x: int = 1 + 2
  return x
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const mir = lowerHirToMir(lowerProgramToHir(parsed.program));
    const entry = mir.functions[0]?.blocks[0];

    expect(entry?.instructions).toEqual([
      { op: "const", target: "%1", value: 1, type: "int" },
      { op: "const", target: "%2", value: 2, type: "int" },
      {
        op: "binary",
        target: "%3",
        operator: "+",
        left: "%1",
        right: "%2",
        type: "int"
      },
      { op: "store", symbol: "math.main.x", value: "%3" },
      { op: "load", target: "%4", symbol: "math.main.x", type: "int" }
    ]);
    expect(entry?.terminator).toEqual({ kind: "return", value: "%4" });
  });

  it("lowers if statements into branch, jump, and return blocks", () => {
    const parsed = parseAnpl(`module math

fn main() -> int {
  if true {
    return 1
  }
  return 0
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const mir = lowerHirToMir(lowerProgramToHir(parsed.program));
    const fn = mir.functions[0];

    expect(fn?.blocks.map((block) => block.id)).toEqual([
      "math.main.entry",
      "math.main.then1",
      "math.main.else2",
      "math.main.after3"
    ]);
    expect(fn?.blocks[0]?.terminator).toEqual({
      kind: "branch",
      condition: "%1",
      thenBlock: "math.main.then1",
      elseBlock: "math.main.else2"
    });
    expect(fn?.blocks[1]?.terminator).toEqual({ kind: "return", value: "%2" });
    expect(fn?.blocks[2]?.terminator).toEqual({
      kind: "jump",
      target: "math.main.after3"
    });
    expect(fn?.blocks[3]?.terminator).toEqual({ kind: "return", value: "%3" });
  });

  it("resolves imported callees to module-qualified symbols", () => {
    const parsed = parseAnpl(`module math

fn value() -> int {
  return 1
}

module other

fn value() -> int {
  return 2
}

module app

import math

fn main() -> int {
  return value()
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const mir = lowerHirToMir(lowerProgramToHir(parsed.program));
    const appMain = mir.functions.find((fn) => fn.id === "app.main");

    expect(appMain?.blocks[0]?.instructions).toEqual([
      {
        op: "call",
        target: "%1",
        callee: "math.value",
        args: [],
        type: "int"
      }
    ]);
    expect(appMain?.blocks[0]?.terminator).toEqual({ kind: "return", value: "%1" });
  });
});
