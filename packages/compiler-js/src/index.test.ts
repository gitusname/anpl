import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import * as ts from "typescript";
import { parseAnpl } from "@anpl/parser";
import { lowerProgramToHir } from "@anpl/hir";
import { lowerProgram } from "@anpl/ir";
import { lowerHirToMir } from "@anpl/mir";
import {
  createMirBackendSourceMap,
  compileMirProgramToJavaScript,
  compileMirProgramToTypeScript,
  compileProgramToJavaScript,
  javascriptBackend,
  typescriptBackend
} from "./index.js";

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

  it("emits runnable JavaScript from MIR", async () => {
    const parsed = parseAnpl(`module math

fn add(a: int, b: int) -> int {
  return a + b
}

fn main() -> int {
  let result: int = add(2, 3)
  if result > 4 {
    return result
  }
  return 0
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const js = compileMirProgramToJavaScript(
      lowerHirToMir(lowerProgramToHir(parsed.program))
    );
    const module = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(js)}`
    )) as {
      __anpl_modules: Record<string, Record<string, (...args: unknown[]) => unknown>>;
    };

    expect(js).toContain("__anpl_modules[\"math\"]");
    expect(js).toContain("switch (__block)");
    expect(module.__anpl_modules.math?.main()).toBe(5);
  });

  it("emits imported MIR calls as module-qualified JavaScript calls", () => {
    const parsed = parseAnpl(`module math

fn value() -> int {
  return 1
}

module other

fn value() -> int {
  return 2
}

module app

import math

fn main() -> int {
  return value()
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const js = compileMirProgramToJavaScript(
      lowerHirToMir(lowerProgramToHir(parsed.program))
    );

    expect(js).toContain("__anpl_modules[\"math\"].value()");
    expect(js).toContain("__anpl_modules[\"app\"]");
  });

  it("emits runtime policy guards for generated JavaScript built-ins", async () => {
    const parsed = parseAnpl(`module ids

fn main() -> uuid {
  return uuid()
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const js = compileMirProgramToJavaScript(lowerHirToMir(lowerProgramToHir(parsed.program)), {
      runtimePolicy: {
        allowedEffects: []
      }
    });
    const module = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(js)}`
    )) as {
      __anpl_modules: Record<string, Record<string, (...args: unknown[]) => unknown>>;
    };

    expect(js).toContain("__anpl_runtime_policy");
    expect(js).toContain("__anpl_require_effect(\"random.uuid\", \"uuid\")");
    expect(() => module.__anpl_modules.ids?.main()).toThrow(
      "ANPL runtime policy blocked builtin 'uuid' effect 'random.uuid'."
    );
  });

  it("enforces emitted JavaScript memory limits", async () => {
    const parsed = parseAnpl(`module memory

fn main() -> text {
  return "allocated"
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const js = compileMirProgramToJavaScript(lowerHirToMir(lowerProgramToHir(parsed.program)), {
      runtimePolicy: {
        maxMemoryMb: 0
      }
    });
    const module = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(js)}`
    )) as {
      __anpl_modules: Record<string, Record<string, (...args: unknown[]) => unknown>>;
    };

    expect(js).toContain("__anpl_runtime_memory_bytes");
    expect(js).toContain("__anpl_track_value(\"allocated\")");
    expect(() => module.__anpl_modules.memory?.main()).toThrow(
      "ANPL runtime policy exceeded maxMemoryMb 0."
    );
  });

  it("exposes a backend interface for MIR JavaScript emission", () => {
    const parsed = parseAnpl(`module math

fn main() -> int {
  return 1
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const result = javascriptBackend.emit(lowerHirToMir(lowerProgramToHir(parsed.program)), {
      outFile: "dist/app.js"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
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
    expect(result.artifacts[0]?.content).toContain("__anpl_modules[\"math\"]");
  });

  it("emits ESM JavaScript files per MIR module", () => {
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

    const result = javascriptBackend.emit(lowerHirToMir(lowerProgramToHir(parsed.program)), {
      outDir: "dist",
      moduleFormat: "esm"
    });
    const math = result.artifacts.find((artifact) => artifact.path === "dist/math.js");
    const app = result.artifacts.find((artifact) => artifact.path === "dist/app.js");
    const runtime = result.artifacts.find((artifact) => artifact.path === "dist/anpl-runtime.js");
    const appMap = result.artifacts.find((artifact) => artifact.path === "dist/app.js.map.json");

    expect(result.diagnostics).toEqual([]);
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "js",
          path: "dist/math.js"
        }),
        expect.objectContaining({
          kind: "js",
          path: "dist/app.js"
        }),
        expect.objectContaining({
          kind: "js",
          path: "dist/anpl-runtime.js"
        }),
        expect.objectContaining({
          kind: "map",
          path: "dist/math.js.map.json"
        }),
        expect.objectContaining({
          kind: "map",
          path: "dist/app.js.map.json"
        })
      ])
    );
    expect(runtime?.content).toContain("export function __anpl_track_value");
    expect(runtime?.content).toContain("export function __anpl_check_runtime_limits");
    expect(math?.content).toContain("export function add(a, b)");
    expect(math?.content).toContain(
      "import { __anpl_check_runtime_limits, __anpl_track_value, len, now, print, uuid } from \"./anpl-runtime.js\";"
    );
    expect(math?.content).not.toContain("function __anpl_track_value");
    expect(math?.content).not.toContain("const __anpl_runtime_policy");
    expect(app?.content).toContain("import * as __anpl_math from \"./math.js\";");
    expect(app?.content).toContain(
      "import { __anpl_check_runtime_limits, __anpl_track_value, len, now, print, uuid } from \"./anpl-runtime.js\";"
    );
    expect(app?.content).toContain("export function main()");
    expect(app?.content).toContain("__anpl_math.add(");
    expect(app?.content).not.toContain("__anpl_modules");
    expect(app?.content).not.toContain("function __anpl_track_value");
    expect(app?.content).not.toContain("const __anpl_runtime_policy");
    expect(JSON.parse(appMap?.content ?? "{}")).toMatchObject({
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

  it("executes ESM JavaScript modules with a shared runtime artifact", async () => {
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

    const result = javascriptBackend.emit(lowerHirToMir(lowerProgramToHir(parsed.program)), {
      outDir: ".",
      moduleFormat: "esm"
    });
    const tempDir = await mkdtemp(join(tmpdir(), "anpl-esm-"));

    try {
      await writeFile(join(tempDir, "package.json"), "{\"type\":\"module\"}", "utf8");
      for (const artifact of result.artifacts) {
        if (artifact.kind === "js" && artifact.path !== undefined) {
          await writeFile(join(tempDir, artifact.path), artifact.content, "utf8");
        }
      }

      const app = (await import(`${pathToFileURL(join(tempDir, "app.js")).href}?t=${Date.now()}`)) as {
        main(): unknown;
      };
      expect(app.main()).toBe(5);
    } finally {
      await rm(tempDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("emits a block and instruction source map for MIR JavaScript", () => {
    const parsed = parseAnpl(`module math

fn main() -> int {
  return 1
}`, "src/main.anpl");
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const mir = lowerHirToMir(lowerProgramToHir(parsed.program));
    const source = compileMirProgramToJavaScript(mir);
    const map = createMirBackendSourceMap(mir, "js", "dist/app.js", source);

    expect(map).toMatchObject({
      version: 1,
      target: "js",
      outFile: "dist/app.js"
    });
    expect(map.mappings[0]).toMatchObject({
      kind: "function",
      generated: {
        module: "math",
        function: "main",
        symbol: "__anpl_modules[\"math\"].main"
      },
      source: {
        file: "src/main.anpl",
        start: {
          line: 3
        }
      },
      mir: {
        function: "math.main",
        blocks: ["math.main.entry"]
      }
    });
    expect(map.mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "block",
          generated: expect.objectContaining({
            block: "math.main.entry"
          }),
          source: expect.objectContaining({
            file: "src/main.anpl",
            start: expect.objectContaining({
              line: 3
            })
          }),
          mir: expect.objectContaining({
            function: "math.main",
            block: "math.main.entry"
          })
        }),
        expect.objectContaining({
          kind: "instruction",
          mir: expect.objectContaining({
            function: "math.main",
            block: "math.main.entry",
            instruction: 0,
            op: "const"
          }),
          source: expect.objectContaining({
            start: expect.objectContaining({
              line: 4
            })
          })
        }),
        expect.objectContaining({
          kind: "terminator",
          mir: expect.objectContaining({
            function: "math.main",
            block: "math.main.entry",
            terminator: "return"
          }),
          source: expect.objectContaining({
            start: expect.objectContaining({
              line: 4
            })
          })
        })
      ])
    );
    expect(map.mappings[0]?.generated.line).toBeGreaterThan(1);
    expect(map.mappings[0]?.generated.column).toBeGreaterThan(0);
  });

  it("emits TypeScript from MIR with typed runtime scaffolding", () => {
    const parsed = parseAnpl(`module math

fn add(a: int, b: int) -> int {
  return a + b
}

fn main() -> int {
  return add(2, 3)
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const source = compileMirProgramToTypeScript(
      lowerHirToMir(lowerProgramToHir(parsed.program))
    );
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        strict: true
      },
      reportDiagnostics: true
    });

    expect(source).toContain("type __AnplFunction");
    expect(source).toContain("const __anpl_runtime_policy");
    expect(source).toContain("function __anpl_track_value<T>(value: T): T");
    expect(source).toContain("__anpl_check_runtime_limits();");
    expect(source).toContain("const __anpl_modules: Record<string, Record<string, __AnplFunction>>");
    expect(source).toContain("add(a: any, b: any): any");
    expect(transpiled.diagnostics ?? []).toEqual([]);
  });

  it("exposes a backend interface for MIR TypeScript emission", () => {
    const parsed = parseAnpl(`module math

fn main() -> int {
  return 1
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const result = typescriptBackend.emit(lowerHirToMir(lowerProgramToHir(parsed.program)), {
      outFile: "dist/app.ts"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "ts",
          path: "dist/app.ts"
        }),
        expect.objectContaining({
          kind: "map",
          path: "dist/app.ts.map.json"
        })
      ])
    );
    expect(result.artifacts[0]?.content).toContain("__anpl_modules[\"math\"]");
  });

  it("emits ESM TypeScript files per MIR module", () => {
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

    const result = typescriptBackend.emit(lowerHirToMir(lowerProgramToHir(parsed.program)), {
      outDir: "dist",
      moduleFormat: "esm"
    });
    const math = result.artifacts.find((artifact) => artifact.path === "dist/math.ts");
    const app = result.artifacts.find((artifact) => artifact.path === "dist/app.ts");
    const runtime = result.artifacts.find((artifact) => artifact.path === "dist/anpl-runtime.ts");
    const transpiled = ts.transpileModule(app?.content ?? "", {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        strict: true
      },
      reportDiagnostics: true
    });

    expect(result.diagnostics).toEqual([]);
    expect(runtime?.content).toContain("export function __anpl_track_value<T>(value: T): T");
    expect(math?.content).toContain("export function add(a: any, b: any): any");
    expect(math?.content).toContain(
      "import { __anpl_check_runtime_limits, __anpl_track_value, len, now, print, uuid } from \"./anpl-runtime.js\";"
    );
    expect(math?.content).not.toContain("function __anpl_track_value");
    expect(app?.content).toContain("import * as __anpl_math from \"./math.js\";");
    expect(app?.content).toContain(
      "import { __anpl_check_runtime_limits, __anpl_track_value, len, now, print, uuid } from \"./anpl-runtime.js\";"
    );
    expect(app?.content).toContain("export function main(): any");
    expect(app?.content).toContain("__anpl_math.add(");
    expect(app?.content).not.toContain("const __anpl_modules");
    expect(app?.content).not.toContain("const __anpl_runtime_policy");
    expect(transpiled.diagnostics ?? []).toEqual([]);
  });
});
