import { describe, expect, it } from "vitest";
import { compileProject, type CompilerHost } from "./index.js";

function memoryHost(files: Record<string, string>): CompilerHost {
  let now = 0;

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
    now: () => {
      now += 1;
      return now;
    },
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
    expect(result.timings.lexMs).toBeGreaterThan(0);
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

  it("emits semantically typed HIR through the compiler facade", async () => {
    const result = await compileProject(
      {
        mode: "emit-hir",
        projectRoot: "/project",
        entry: "main.anpl"
      },
      memoryHost({
        "/project/main.anpl": `module crm

type Customer {
  status: enum[active, archived]
}

fn createCustomer() -> Customer {
  return Customer {
    status: active
  }
}`
      })
    );

    expect(result.ok).toBe(true);
    expect(result.artifacts[0]?.content).toContain("\"type\": \"record:crm.Customer\"");
    expect(result.artifacts[0]?.content).toContain("\"type\": \"enum:active|archived\"");
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

  it("runs a project that imports an external dependency package", async () => {
    const result = await compileProject(
      {
        mode: "run",
        projectRoot: "/project"
      },
      memoryHost({
        "/project/anpl.json": JSON.stringify({
          name: "app-pkg",
          entry: "src/app.anpl",
          source: ["src/**/*.anpl"],
          dependencies: {
            mathlib: {
              path: "/mathlib",
              source: ["lib/**/*.anpl"]
            }
          }
        }),
        "/project/src/app.anpl": `module app

import math

fn main() -> int {
  return add(2, 3)
}`,
        "/mathlib/lib/math.anpl": `module math

fn add(a: int, b: int) -> int {
  return a + b
}`
      })
    );

    expect(result.ok).toBe(true);
    expect(result.cache?.packageHashes.mathlib).toEqual(expect.any(String));
    expect(result.value).toMatchObject({
      ok: true,
      value: {
        kind: "int",
        value: 5
      }
    });
  });

  it("runs package-qualified dependency imports beside same-named local modules", async () => {
    const result = await compileProject(
      {
        mode: "run",
        projectRoot: "/project"
      },
      memoryHost({
        "/project/anpl.json": JSON.stringify({
          name: "app-pkg",
          entry: "src/app.anpl",
          source: ["src/**/*.anpl"],
          dependencies: {
            mathlib: {
              path: "/mathlib",
              source: ["lib/**/*.anpl"]
            }
          }
        }),
        "/project/src/app.anpl": `module app

import mathlib.math

fn main() -> int {
  return add(2, 3)
}`,
        "/project/src/math.anpl": `module math

fn add(a: int, b: int) -> int {
  return 100
}`,
        "/mathlib/lib/math.anpl": `module math

fn add(a: int, b: int) -> int {
  return a + b
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

  it("runs the manifest entry main when dependency packages also define main", async () => {
    const result = await compileProject(
      {
        mode: "run",
        projectRoot: "/project"
      },
      memoryHost({
        "/project/anpl.json": JSON.stringify({
          name: "app-pkg",
          entry: "src/app.anpl",
          source: ["src/**/*.anpl"],
          dependencies: {
            tools: {
              path: "/tools",
              source: ["lib/**/*.anpl"]
            }
          }
        }),
        "/project/src/app.anpl": `module app

fn main() -> int {
  return 7
}`,
        "/tools/lib/tool.anpl": `module tool

fn main() -> int {
  return 99
}`
      })
    );

    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({
      ok: true,
      value: {
        kind: "int",
        value: 7
      }
    });
  });

  it("builds package-qualified dependency modules through the JavaScript backend", async () => {
    const files: Record<string, string> = {
      "/project/anpl.json": JSON.stringify({
        name: "app-pkg",
        entry: "src/app.anpl",
        source: ["src/**/*.anpl"],
        dependencies: {
          mathlib: {
            path: "/mathlib",
            source: ["lib/**/*.anpl"]
          }
        }
      }),
      "/project/src/app.anpl": `module app

import mathlib.math

fn main() -> int {
  return add(2, 3)
}`,
      "/project/src/math.anpl": `module math

fn add(a: int, b: int) -> int {
  return 100
}`,
      "/mathlib/lib/math.anpl": `module math

fn add(a: int, b: int) -> int {
  return a + b
}`
    };
    const result = await compileProject(
      {
        mode: "build",
        projectRoot: "/project",
        outDir: "dist"
      },
      memoryHost(files)
    );

    expect(result.ok).toBe(true);
    expect(files["/project/dist/anpl.js"]).toContain("__anpl_modules[\"mathlib.math\"]");
    expect(files["/project/dist/anpl.js"]).toContain(
      "__anpl_modules[\"mathlib.math\"].add"
    );
    expect(files["/project/dist/anpl.js"]).toContain("__anpl_modules[\"math\"]");
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
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "map",
          path: "dist/anpl.js.map.json"
        })
      ])
    );
    const sourceMap = JSON.parse(files["/project/dist/anpl.js.map.json"] ?? "{}");
    expect(sourceMap.target).toBe("js");
    expect(sourceMap.mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          generated: expect.objectContaining({
            module: "math"
          }),
          mir: expect.objectContaining({
            function: "math.add"
          })
        })
      ])
    );
  });

  it("builds ESM JavaScript files per module through the MIR backend", async () => {
    const files: Record<string, string> = {
      "/project/anpl.json": JSON.stringify({
        name: "esm-build",
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
    };
    const result = await compileProject(
      {
        mode: "build",
        projectRoot: "/project",
        outDir: "dist",
        moduleFormat: "esm"
      },
      memoryHost(files)
    );

    expect(result.ok).toBe(true);
    expect(files["/project/dist/anpl-runtime.js"]).toContain(
      "export function __anpl_track_value"
    );
    expect(files["/project/dist/math.js"]).toContain("export function add");
    expect(files["/project/dist/math.js"]).toContain(
      "from \"./anpl-runtime.js\";"
    );
    expect(files["/project/dist/math.js"]).not.toContain("const __anpl_runtime_policy");
    expect(files["/project/dist/app.js"]).toContain(
      "import * as __anpl_math from \"./math.js\";"
    );
    expect(files["/project/dist/app.js"]).toContain(
      "from \"./anpl-runtime.js\";"
    );
    expect(files["/project/dist/app.js"]).toContain("__anpl_math.add(");
    expect(files["/project/dist/app.js"]).not.toContain("const __anpl_runtime_policy");
    expect(files["/project/dist/anpl.js"]).toBeUndefined();
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "js",
          path: "dist/anpl-runtime.js"
        }),
        expect.objectContaining({
          kind: "js",
          path: "dist/math.js"
        }),
        expect.objectContaining({
          kind: "js",
          path: "dist/app.js"
        }),
        expect.objectContaining({
          kind: "map",
          path: "dist/app.js.map.json"
        })
      ])
    );
    const sourceMap = JSON.parse(files["/project/dist/app.js.map.json"] ?? "{}");
    expect(sourceMap).toMatchObject({
      target: "js",
      outFile: "dist/app.js",
      mappings: expect.arrayContaining([
        expect.objectContaining({
          generated: expect.objectContaining({
            module: "app",
            symbol: "app.main"
          })
        })
      ])
    });
  });

  it("passes runtime policy into generated JavaScript builds", async () => {
    const files: Record<string, string> = {
      "/project/main.anpl": `module ids

fn main() -> uuid {
  return uuid()
}`
    };
    const result = await compileProject(
      {
        mode: "build",
        projectRoot: "/project",
        entry: "main.anpl",
        outDir: "dist",
        runtimePolicy: {
          allowedEffects: []
        }
      },
      memoryHost(files)
    );

    expect(result.ok).toBe(true);
    expect(files["/project/dist/anpl.js"]).toContain("\"allowedEffects\":[]");
    expect(files["/project/dist/anpl.js"]).toContain("\"maxMemoryMb\":128");
    expect(files["/project/dist/anpl.js"]).toContain("__anpl_track_value");
    expect(files["/project/dist/anpl.js"]).toContain(
      "__anpl_require_effect(\"random.uuid\", \"uuid\")"
    );
  });

  it("builds TypeScript through the MIR backend", async () => {
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
        target: "ts",
        projectRoot: "/project",
        entry: "main.anpl",
        outDir: "dist"
      },
      memoryHost(files)
    );

    expect(result.ok).toBe(true);
    expect(result.artifacts[0]).toMatchObject({
      kind: "ts",
      path: "dist/anpl.ts"
    });
    expect(files["/project/dist/anpl.ts"]).toContain("type __AnplFunction");
    expect(files["/project/dist/anpl.ts"]).toContain("add(a: any, b: any): any");
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "map",
          path: "dist/anpl.ts.map.json"
        })
      ])
    );
    const sourceMap = JSON.parse(files["/project/dist/anpl.ts.map.json"] ?? "{}");
    expect(sourceMap.target).toBe("ts");
    expect(sourceMap.mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          generated: expect.objectContaining({
            module: "math"
          })
        })
      ])
    );
  });
});
