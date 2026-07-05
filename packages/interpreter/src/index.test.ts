import { describe, expect, it } from "vitest";
import { parseAnpl } from "@anpl/parser";
import { analyzeProgram } from "@anpl/semantic";
import { lowerProgramToHir } from "@anpl/hir";
import { lowerProgram } from "@anpl/ir";
import { lowerHirToMir } from "@anpl/mir";
import { createRuntimeHost } from "@anpl/runtime";
import { interpretMirProgram, interpretProgram } from "./index.js";

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

function runMir(source: string) {
  const parsed = parseAnpl(source);
  if (!parsed.ok) {
    throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }
  const semantic = analyzeProgram(parsed.program);
  if (!semantic.ok) {
    throw new Error(semantic.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }
  return interpretMirProgram(lowerHirToMir(lowerProgramToHir(parsed.program)));
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
      value: {
        kind: "int",
        value: 5
      }
    });
  });

  it("runs record and enum field access", () => {
    const result = run(`module crm

type Customer {
  name: text
  status: enum[active, archived]
}

fn createCustomer(name: text) -> Customer {
  return Customer {
    name: name
    status: active
  }
}

fn main() -> int {
  let customer = createCustomer("Ada")
  return len(customer.status)
}`);

    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: "int",
        value: 6
      }
    });
  });

  it("runs enum variants through typed lets and return values", () => {
    const result = run(`module workflow

fn selectStatus() -> enum[active, archived] {
  return active
}

fn main() -> int {
  return len(selectStatus())
}`);

    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: "int",
        value: 6
      }
    });
  });

  it("runs enum variants passed as function arguments", () => {
    const result = run(`module workflow

fn score(status: enum[active, archived]) -> int {
  return len(status)
}

fn main() -> int {
  return score(active)
}`);

    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: "int",
        value: 6
      }
    });
  });

  it("runs module-qualified calls without global function collisions", () => {
    const result = run(`module math

fn add(a: int, b: int) -> int {
  return a + b
}

module app

fn add(a: int, b: int) -> int {
  return a - b
}

fn main() -> int {
  return add(5, 2)
}`);

    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: "int",
        value: 3
      }
    });
  });

  it("reports blocked builtin effects with runtime stack evidence", () => {
    const parsed = parseAnpl(`module app

fn main() -> uuid {
  return uuid()
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }
    const semantic = analyzeProgram(parsed.program);
    if (!semantic.ok) {
      throw new Error(semantic.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const result = interpretProgram(
      lowerProgram(parsed.program),
      "main",
      createRuntimeHost({
        allowedEffects: []
      })
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ANPL_RUNTIME_ERROR",
          expected: "random.uuid",
          evidence: ["at app.main"]
        })
      ])
    );
  });

  it("runs programs through MIR execution", () => {
    const result = runMir(`module math

fn add(a: int, b: int) -> int {
  return a + b
}

fn main() -> int {
  let result: int = add(2, 3)
  if result > 4 {
    return result
  }
  return 0
}`);

    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: "int",
        value: 5
      }
    });
  });

  it("runs enum variants through MIR execution", () => {
    const result = runMir(`module workflow

fn selectStatus() -> enum[active, archived] {
  return active
}

fn main() -> int {
  return len(selectStatus())
}`);

    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: "int",
        value: 6
      }
    });
  });
});
