import { describe, expect, it } from "vitest";
import { parseAnpl } from "@anpl/parser";
import { analyzeProgram } from "@anpl/semantic";
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
      span: {
        file: undefined,
        start: {
          line: 3
        }
      },
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

    expect(stripInstructionSpans(entry?.instructions ?? [])).toEqual([
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
    expect(stripTerminatorSpan(entry?.terminator)).toEqual({ kind: "return", value: "%4" });
    expect(entry?.span?.start.line).toBe(3);
    expect(entry?.instructions[0]?.span?.start.line).toBe(4);
    expect(entry?.instructions[3]?.span?.start.line).toBe(4);
    expect(entry?.terminator.span?.start.line).toBe(5);
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
    expect(stripTerminatorSpan(fn?.blocks[0]?.terminator)).toEqual({
      kind: "branch",
      condition: "%1",
      thenBlock: "math.main.then1",
      elseBlock: "math.main.else2"
    });
    expect(stripTerminatorSpan(fn?.blocks[1]?.terminator)).toEqual({
      kind: "return",
      value: "%2"
    });
    expect(stripTerminatorSpan(fn?.blocks[2]?.terminator)).toEqual({
      kind: "jump",
      target: "math.main.after3"
    });
    expect(stripTerminatorSpan(fn?.blocks[3]?.terminator)).toEqual({
      kind: "return",
      value: "%3"
    });
    expect(fn?.blocks[0]?.terminator.span?.start.line).toBe(4);
    expect(fn?.blocks[1]?.span?.start.line).toBe(4);
    expect(fn?.blocks[1]?.terminator.span?.start.line).toBe(5);
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

    expect(stripInstructionSpans(appMain?.blocks[0]?.instructions ?? [])).toEqual([
      {
        op: "call",
        target: "%1",
        callee: "math.value",
        args: [],
        type: "int"
      }
    ]);
    expect(stripTerminatorSpan(appMain?.blocks[0]?.terminator)).toEqual({
      kind: "return",
      value: "%1"
    });
  });

  it("carries semantic TypeIds into MIR records and member access", () => {
    const parsed = parseAnpl(`module crm

type Customer {
  name: text
  status: enum[active, archived]
}

fn createCustomer() -> Customer {
  return Customer {
    name: "Ada"
    status: active
  }
}

fn main() -> text {
  let customer = createCustomer()
  return customer.name
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }
    const semantic = analyzeProgram(parsed.program);
    if (!semantic.ok) {
      throw new Error(semantic.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const mir = lowerHirToMir(lowerProgramToHir(parsed.program, semantic.typedProgram));
    const createCustomer = mir.functions.find((fn) => fn.id === "crm.createCustomer");
    const main = mir.functions.find((fn) => fn.id === "crm.main");

    expect(createCustomer?.returnType).toBe("record:crm.Customer");
    expect(createCustomer?.blocks[0]?.instructions).toContainEqual(
      expect.objectContaining({
        op: "record",
        type: "record:crm.Customer"
      })
    );
    expect(main?.blocks[0]?.instructions).toContainEqual(
      expect.objectContaining({
        op: "member",
        field: "name",
        type: "text"
      })
    );
  });

  it("keeps colliding record type names module-qualified in MIR", () => {
    const parsed = parseAnpl(`module crm

type Customer {
  name: text
}

fn createCustomer() -> Customer {
  return Customer {
    name: "Ada"
  }
}

module billing

type Customer {
  total: int
}

fn createCustomer() -> Customer {
  return Customer {
    total: 7
  }
}

module app

import crm

fn main() -> Customer {
  return createCustomer()
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }
    const semantic = analyzeProgram(parsed.program);
    if (!semantic.ok) {
      throw new Error(semantic.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const mir = lowerHirToMir(lowerProgramToHir(parsed.program, semantic.typedProgram));
    const crmCreateCustomer = mir.functions.find((fn) => fn.id === "crm.createCustomer");
    const billingCreateCustomer = mir.functions.find((fn) => fn.id === "billing.createCustomer");
    const appMain = mir.functions.find((fn) => fn.id === "app.main");

    expect(crmCreateCustomer?.returnType).toBe("record:crm.Customer");
    expect(crmCreateCustomer?.blocks[0]?.instructions).toContainEqual(
      expect.objectContaining({
        op: "record",
        type: "record:crm.Customer"
      })
    );
    expect(billingCreateCustomer?.returnType).toBe("record:billing.Customer");
    expect(billingCreateCustomer?.blocks[0]?.instructions).toContainEqual(
      expect.objectContaining({
        op: "record",
        type: "record:billing.Customer"
      })
    );
    expect(appMain?.returnType).toBe("record:crm.Customer");
    expect(appMain?.blocks[0]?.instructions).toContainEqual(
      expect.objectContaining({
        op: "call",
        callee: "crm.createCustomer",
        type: "record:crm.Customer"
      })
    );
  });
});

function stripInstructionSpans(instructions: Array<{ span?: unknown }>): unknown[] {
  return instructions.map((instruction) => {
    const { span: _span, ...rest } = instruction;
    return rest;
  });
}

function stripTerminatorSpan(terminator: ({ span?: unknown } & object) | undefined): unknown {
  if (terminator === undefined) {
    return undefined;
  }
  const { span: _span, ...rest } = terminator;
  return rest;
}
