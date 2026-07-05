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
    fileExists: async (path) => {
      const normalizedPath = path.replace(/\/$/, "");
      return (
        files[normalizedPath] !== undefined ||
        Object.keys(files).some((filePath) => filePath.startsWith(`${normalizedPath}/`))
      );
    },
    resolvePath: async (from, specifier) =>
      specifier.startsWith("/") ? specifier : `${from.replace(/\/$/, "")}/${specifier}`,
    readDir: async (path) => {
      const normalizedPath = path.replace(/\/$/, "");
      const prefix = `${normalizedPath}/`;
      const children = new Map<string, "file" | "directory">();

      for (const filePath of Object.keys(files)) {
        if (!filePath.startsWith(prefix)) {
          continue;
        }
        const parts = filePath.slice(prefix.length).split("/");
        const name = parts[0];
        if (name === undefined || name.length === 0) {
          continue;
        }
        children.set(name, parts.length > 1 ? "directory" : "file");
      }

      return [...children.entries()].map(([name, kind]) => ({
        name,
        path: `${normalizedPath}/${name}`,
        kind
      }));
    },
    now: () => 0,
    randomUUID: () => "00000000-0000-4000-8000-000000000000"
  };
}

describe("compiler facade", () => {
  it("initializes a project through the compiler host", async () => {
    const files: Record<string, string> = {};
    const result = await compileProject(
      {
        mode: "init",
        projectRoot: "/project",
        init: {
          name: "crm-system"
        }
      },
      memoryHost(files)
    );

    expect(result.ok).toBe(true);
    expect(result.artifacts.map((artifact) => artifact.kind)).toEqual([
      "project",
      "project"
    ]);
    expect(files["/project/anpl.json"]).toContain("\"name\": \"crm-system\"");
    expect(files["/project/src/main.anpl"]).toContain("module crm_system");
  });

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
    expect(result.cache?.cacheKey).toEqual(expect.any(String));
  });

  it("returns project diagnostics for invalid manifests without throwing", async () => {
    const result = await compileProject(
      {
        mode: "check",
        projectRoot: "/project"
      },
      memoryHost({
        "/project/anpl.json": "{"
      })
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "ANPL_PROJECT_INVALID_MANIFEST"
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "ANPL_COMPILER_ERROR"
    );
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

  it("checks a manifest project across multiple source files", async () => {
    const result = await compileProject(
      {
        mode: "run",
        projectRoot: "/project"
      },
      memoryHost({
        "/project/anpl.json": JSON.stringify({
          name: "multi-file",
          entry: "src/app.anpl",
          source: ["src/**/*.anpl"]
        }),
        "/project/src/math.anpl": `module math

fn add(a: int, b: int) -> int {
  return a + b
}`,
        "/project/src/app.anpl": `module app

import math

fn main() -> int {
  return add(2, 3)
}`
      })
    );

    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({
      ok: true,
      value: {
        kind: "int",
        value: 5
      }
    });
  });

  it("builds JavaScript through the MIR backend", async () => {
    const files: Record<string, string> = {
      "/project/main.anpl": `module math

fn add(a: int, b: int) -> int {
  return a + b
}

fn main() -> int {
  return add(2, 3)
}`
    };
    const result = await compileProject(
      {
        mode: "build",
        projectRoot: "/project",
        entry: "main.anpl",
        outDir: "dist"
      },
      memoryHost(files)
    );

    expect(result.ok).toBe(true);
    expect(result.artifacts[0]).toMatchObject({
      kind: "js",
      path: "dist/anpl.js"
    });
    expect(files["/project/dist/anpl.js"]).toContain("switch (__block)");
    expect(files["/project/dist/anpl.js"]).toContain("__anpl_modules[\"math\"].add");
  });
});
