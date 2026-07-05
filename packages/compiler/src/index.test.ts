import { describe, expect, it } from "vitest";
import { compileProject, type CompilerHost } from "./index.js";

function memoryHost(files: Record<string, string>): CompilerHost {
  return {
    readFile: async (path) => {
      const content = files[path];
      if (content === undefined) {
        throw new Error(`Missing file ${path}`);
      }
      return content;
    },
    writeFile: async (path, content) => {
      files[path] = content;
    },
    fileExists: async (path) => files[path] !== undefined,
    resolvePath: async (from, specifier) =>
      specifier.startsWith("/") ? specifier : `${from.replace(/\/$/, "")}/${specifier}`,
    now: () => 0,
    randomUUID: () => "00000000-0000-4000-8000-000000000000"
  };
}

describe("compiler facade", () => {
  it("checks a valid program through one entrypoint", async () => {
    const result = await compileProject(
      {
        mode: "check",
        projectRoot: "/project",
        entry: "main.anpl"
      },
      memoryHost({
        "/project/main.anpl": `module math

fn main() -> int {
  return 1
}`
      })
    );

    expect(result.ok).toBe(true);
    expect(result.timings).toHaveProperty("parseMs");
  });

  it("emits HIR and MIR artifacts", async () => {
    const host = memoryHost({
      "/project/main.anpl": `module math

fn main() -> int {
  return 1
}`
    });

    const hir = await compileProject(
      {
        mode: "emit-hir",
        projectRoot: "/project",
        entry: "main.anpl"
      },
      host
    );
    const mir = await compileProject(
      {
        mode: "emit-mir",
        projectRoot: "/project",
        entry: "main.anpl"
      },
      host
    );

    expect(hir.artifacts[0]?.kind).toBe("hir");
    expect(mir.artifacts[0]?.kind).toBe("mir");
  });
});
