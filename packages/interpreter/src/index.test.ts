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
  return interpretMirProgram(
    lowerHirToMir(lowerProgramToHir(parsed.program, semantic.typedProgram))
  );
}

function buildMir(source: string) {
  const parsed = parseAnpl(source);
  if (!parsed.ok) {
    throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }
  const semantic = analyzeProgram(parsed.program);
  if (!semantic.ok) {
    throw new Error(semantic.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }
  return lowerHirToMir(lowerProgramToHir(parsed.program, semantic.typedProgram));
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
          code: "ANPL_RUNTIME_EFFECT_BLOCKED",
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

  it("requires module-qualified MIR entry names when multiple modules define main", () => {
    const mir = buildMir(`module utility

fn main() -> int {
  return 9
}

module app

fn main() -> int {
  return 5
}`);

    const ambiguous = interpretMirProgram(mir);
    const app = interpretMirProgram(mir, "app.main");
    const utility = interpretMirProgram(mir, "utility.main");

    expect(ambiguous.ok).toBe(false);
    expect(ambiguous.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ANPL_RUNTIME_ENTRY_AMBIGUOUS",
          symbol: "main",
          expected: "single entry function",
          message: expect.stringContaining("ambiguous")
        })
      ])
    );
    expect(app).toMatchObject({
      ok: true,
      value: {
        kind: "int",
        value: 5
      }
    });
    expect(utility).toMatchObject({
      ok: true,
      value: {
        kind: "int",
        value: 9
      }
    });
  });

  it("enforces MIR runtime timeout policy", () => {
    let now = -1;
    const result = interpretMirProgram(
      buildMir(`module app

fn main() -> int {
  return 1
}`),
      "main",
      createRuntimeHost(
        {
          maxExecutionMs: 1
        },
        {
          startedAtMs: 0,
          now: () => {
            now += 1;
            return now;
          }
        }
      )
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ANPL_RUNTIME_LIMIT_EXCEEDED",
          expected: "<= 1ms",
          received: "2ms",
          evidence: ["at app.main"]
        })
      ])
    );
  });

  it("enforces MIR runtime memory policy", () => {
    const result = interpretMirProgram(
      buildMir(`module app

fn main() -> int {
  let value: int = 1
  return value
}`),
      "main",
      createRuntimeHost({
        maxMemoryMb: 0
      })
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ANPL_RUNTIME_LIMIT_EXCEEDED",
          expected: "<= 0MB",
          evidence: ["at app.main"]
        })
      ])
    );
  });

  it("reports missing MIR entrypoints with a specific runtime diagnostic", () => {
    const result = interpretMirProgram({
      functions: []
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "ANPL_RUNTIME_ENTRY_NOT_FOUND",
        symbol: "main",
        expected: "entry function",
        received: "missing"
      })
    ]);
  });

  it("reports missing MIR callees with a specific runtime diagnostic", () => {
    const result = interpretMirProgram(
      {
        functions: [
          {
            id: "app.main" as never,
            params: [],
            returnType: "int" as never,
            blocks: [
              {
                id: "app.main.entry",
                instructions: [
                  {
                    op: "call",
                    target: "%1",
                    callee: "missing.value" as never,
                    args: [],
                    type: "int" as never
                  }
                ],
                terminator: {
                  kind: "return",
                  value: "%1"
                }
              }
            ]
          }
        ]
      },
      "app.main"
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "ANPL_RUNTIME_FUNCTION_NOT_FOUND",
        symbol: "missing.value",
        expected: "runtime function",
        received: "missing",
        evidence: ["at app.main"]
      })
    ]);
  });

  it("reports invalid MIR member access with a specific runtime diagnostic", () => {
    const result = interpretMirProgram(
      {
        functions: [
          {
            id: "app.main" as never,
            params: [],
            returnType: "int" as never,
            blocks: [
              {
                id: "app.main.entry",
                instructions: [
                  {
                    op: "const",
                    target: "%1",
                    value: "Ada",
                    type: "text" as never
                  },
                  {
                    op: "member",
                    target: "%2",
                    object: "%1",
                    field: "length",
                    type: "int" as never
                  }
                ],
                terminator: {
                  kind: "return",
                  value: "%2"
                }
              }
            ]
          }
        ]
      },
      "app.main"
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "ANPL_RUNTIME_INVALID_MEMBER_ACCESS",
        symbol: "length",
        expected: "record",
        received: "text",
        evidence: ["at app.main"]
      })
    ]);
  });
});
