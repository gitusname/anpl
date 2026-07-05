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
      value: 6
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
      value: 6
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
      value: 6
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
      value: 3
    });
  });
});
