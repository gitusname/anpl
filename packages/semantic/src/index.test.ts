import { describe, expect, it } from "vitest";
import { parseAnpl } from "@anpl/parser";
import { primitiveTypeId } from "@anpl/types";
import { analyzeProgram } from "./index.js";

function analyze(source: string) {
  const parsed = parseAnpl(source, "test.anpl");
  if (!parsed.ok) {
    throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }
  return analyzeProgram(parsed.program);
}

describe("semantic analyzer", () => {
  it("accepts a valid math program", () => {
    const result = analyze(`module math

fn add(a: int, b: int) -> int {
  return a + b
}

fn main() -> int {
  let result = add(2, 3)
  return result
}`);

    expect(result.ok).toBe(true);
  });

  it("returns module-aware symbols, type registry, and pass traces", () => {
    const result = analyze(`module math

fn add(a: int, b: int) -> int {
  return a + b
}`);

    expect(result.ok).toBe(true);
    expect(result.symbols.byQualifiedName.get("math.add")).toBe("math.add");
    expect(result.types.display(primitiveTypeId("int"))).toBe("int");
    expect(result.typedProgram.symbols).toBe(result.symbols);
    expect(result.typedProgram.visibleSymbolsByModule.get("math")?.functions.has("add")).toBe(true);
    expect(result.passes.map((pass) => pass.name)).toEqual([
      "collect-modules",
      "collect-declarations",
      "resolve-imports",
      "resolve-symbols",
      "resolve-types",
      "check-records",
      "check-expressions",
      "check-returns"
    ]);
  });

  it("resolves imported module functions", () => {
    const result = analyze(`module math

fn add(a: int, b: int) -> int {
  return a + b
}

module app

import math

fn main() -> int {
  return add(2, 3)
}`);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }
    expect(result.typedProgram.visibleSymbolsByModule.get("app")?.functions.has("add")).toBe(true);
  });

  it("accepts enum variants in record fields", () => {
    const result = analyze(`module crm

type Customer {
  id: uuid
  status: enum[active, archived]
}

fn createCustomer() -> Customer {
  return Customer {
    id: uuid()
    status: active
  }
}`);

    expect(result.ok).toBe(true);
  });

  it("accepts enum variants in typed lets, returns, and calls", () => {
    const result = analyze(`module workflow

fn same(status: enum[active, archived]) -> enum[active, archived] {
  return status
}

fn main() -> enum[active, archived] {
  let status: enum[active, archived] = active
  return same(status)
}`);

    expect(result.ok).toBe(true);
  });

  it("reports return type mismatches", () => {
    const result = analyze(`module math

fn broken() -> int {
  return "hello"
}`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ANPL_RETURN_TYPE_MISMATCH",
          category: "type",
          expected: "int",
          received: "text",
          cause: expect.stringContaining("declared return type"),
          fix: expect.stringContaining("Return a value"),
          evidence: expect.arrayContaining([expect.stringContaining("span")])
        })
      ])
    );
  });

  it("reports missing returns for non-void functions", () => {
    const result = analyze(`module math

fn broken() -> int {
  let value = 1
}`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ANPL_RETURN_MISSING",
          symbol: "broken"
        })
      ])
    );
  });

  it("reports builtin argument count mismatches", () => {
    const result = analyze(`module math

fn main() -> int {
  return len()
}`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ANPL_CALL_ARG_COUNT_MISMATCH",
          symbol: "len"
        })
      ])
    );
  });

  it("reports unknown symbols", () => {
    const result = analyze(`module math

fn main() -> int {
  return missing
}`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ANPL_SEMANTIC_UNKNOWN_SYMBOL",
          symbol: "missing",
          category: "semantic",
          cause: expect.stringContaining("not visible"),
          fix: expect.stringContaining("Declare the symbol"),
          evidence: expect.arrayContaining([expect.stringContaining("span")])
        })
      ])
    );
  });

  it("reports unknown imported modules", () => {
    const result = analyze(`module app

import missing

fn main() -> int {
  return 1
}`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ANPL_SEMANTIC_UNKNOWN_MODULE",
          symbol: "missing"
        })
      ])
    );
  });
});
