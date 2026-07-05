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

  it("keeps nested block indentation stable", () => {
    const parsed = parseAnpl(`module rules

fn main() -> int {
if true {
return 1
} else {
return 0
}
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const formatted = formatProgram(parsed.program);
    const reparsed = parseAnpl(formatted);
    if (!reparsed.ok) {
      throw new Error(reparsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    expect(formatted).toBe(`module rules

fn main() -> int {
  if true {
    return 1
  } else {
    return 0
  }
}
`);
    expect(formatProgram(reparsed.program)).toBe(formatted);
  });

  it("orders imports, types, and functions canonically", () => {
    const parsed = parseAnpl(`module app

fn main() -> int {
  return 1
}

type Customer {
  name: text
}

import shared
`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    expect(formatProgram(parsed.program)).toBe(`module app

import shared

type Customer {
  name: text
}

fn main() -> int {
  return 1
}
`);
  });
});
