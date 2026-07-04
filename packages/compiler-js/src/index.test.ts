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

    expect(js).toContain("function add(a, b)");
    expect(js).toContain("return (a + b);");
    expect(js).toContain("export { add }");
  });
});
