import { describe, expect, it } from "vitest";
import * as ts from "typescript";
import { parseAnpl } from "@anpl/parser";
import { lowerProgramToHir } from "@anpl/hir";
import { lowerProgram } from "@anpl/ir";
import { lowerHirToMir } from "@anpl/mir";
import {
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
    expect(result.artifacts).toMatchObject([
      {
        kind: "js",
        path: "dist/app.js"
      }
    ]);
    expect(result.artifacts[0]?.content).toContain("__anpl_modules[\"math\"]");
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
    expect(result.artifacts).toMatchObject([
      {
        kind: "ts",
        path: "dist/app.ts"
      }
    ]);
    expect(result.artifacts[0]?.content).toContain("__anpl_modules[\"math\"]");
  });
});
