import { describe, expect, it } from "vitest";
import { parseAnpl } from "@anpl/parser";
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
          code: "ANPL_RETURN_TYPE_MISMATCH"
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
          symbol: "missing"
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
