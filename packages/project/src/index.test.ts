import { describe, expect, it } from "vitest";
import { parseAnpl } from "@anpl/parser";
import { buildModuleGraph, parseManifest } from "./index.js";

describe("project system", () => {
  it("parses manifests with defaults", () => {
    const manifest = parseManifest(
      JSON.stringify({
        name: "crm",
        entry: "main.anpl"
      })
    );

    expect(manifest.name).toBe("crm");
    expect(manifest.entry).toBe("main.anpl");
    expect(manifest.target.outDir).toBe("dist");
  });

  it("builds a module graph from parsed modules", () => {
    const parsed = parseAnpl(`module math

fn add(a: int, b: int) -> int {
  return a + b
}

module app

import math

fn main() -> int {
  return add(2, 3)
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const graph = buildModuleGraph(parsed.program, "main.anpl");

    expect(graph.modules.size).toBe(2);
    expect(graph.edges).toEqual([
      {
        from: "app",
        to: "math",
        kind: "import"
      }
    ]);
    expect(graph.diagnostics).toEqual([]);
  });
});
