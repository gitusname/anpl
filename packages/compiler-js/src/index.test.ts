import { describe, expect, it } from "vitest";
import { parseAnpl } from "@anpl/parser";
import { lowerProgram } from "@anpl/ir";
import { compileProgramToJavaScript } from "./index.js";

describe("JavaScript compiler", () => {
  it("emits runnable-looking JavaScript", () => {
    const parsed = parseAnpl(`module math

fn add(a: int, b: int) -> int {
  return a + b
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const js = compileProgramToJavaScript(lowerProgram(parsed.program));

    expect(js).toContain("__anpl_modules[\"math\"]");
    expect(js).toContain("add(a, b)");
    expect(js).toContain("return (a + b);");
    expect(js).toContain("export { __anpl_modules }");
  });

  it("emits module namespaces for functions with the same local name", () => {
    const parsed = parseAnpl(`module math

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
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const js = compileProgramToJavaScript(lowerProgram(parsed.program));

    expect(js).toContain("__anpl_modules[\"math\"]");
    expect(js).toContain("__anpl_modules[\"app\"]");
    expect(js).toContain("return __anpl_modules[\"app\"].add(5, 2);");
    expect(js).not.toContain("function add(");
  });

  it("emits enum record variants as string literals", () => {
    const parsed = parseAnpl(`module crm

type Customer {
  status: enum[active, archived]
}

fn createCustomer() -> Customer {
  return Customer {
    status: active
  }
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const js = compileProgramToJavaScript(lowerProgram(parsed.program));

    expect(js).toContain("status: \"active\"");
  });
});
