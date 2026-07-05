import { describe, expect, it } from "vitest";
import { parseAnpl } from "@anpl/parser";
import { formatProgram } from "./index.js";

describe("formatter", () => {
  it("produces canonical output that parses again", () => {
    const parsed = parseAnpl(`module math
fn add(a:int,b:int)->int {
return a+b
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const formatted = formatProgram(parsed.program);
    const reparsed = parseAnpl(formatted);

    expect(formatted).toContain("fn add(a: int, b: int) -> int");
    expect(reparsed.ok).toBe(true);
  });
});
