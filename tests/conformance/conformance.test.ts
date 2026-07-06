import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileMirProgramToJavaScript } from "@anpl/compiler-js";
import { lowerProgramToHir } from "@anpl/hir";
import { interpretMirProgram } from "@anpl/interpreter";
import { lowerHirToMir } from "@anpl/mir";
import { parseAnpl } from "@anpl/parser";
import { analyzeProgram } from "@anpl/semantic";

const fixtureRoot = "tests/conformance";

const validFixtures = ["math.anpl", "records.anpl", "imports.anpl", "enums.anpl"];

const invalidFixtures: Record<string, string> = {
  "type-mismatch.anpl": "ANPL_RETURN_TYPE_MISMATCH",
  "missing-return.anpl": "ANPL_RETURN_MISSING",
  "unknown-symbol.anpl": "ANPL_SEMANTIC_UNKNOWN_SYMBOL"
};

describe("ANPL conformance fixtures", () => {
  for (const fixture of validFixtures) {
    it(`accepts valid fixture ${fixture}`, () => {
      const file = join(fixtureRoot, "valid", fixture);
      const parsed = parseAnpl(readFileSync(file, "utf8"), file);

      expect(parsed.diagnostics).toEqual([]);
      expect(parsed.ok).toBe(true);

      if (!parsed.ok) {
        return;
      }

      const semantic = analyzeProgram(parsed.program);
      expect(semantic.diagnostics).toEqual([]);
      expect(semantic.ok).toBe(true);
      if (!semantic.ok) {
        return;
      }

      const mir = lowerHirToMir(lowerProgramToHir(parsed.program, semantic.typedProgram));
      expect(mir.functions.length).toBeGreaterThan(0);
    });
  }

  for (const [fixture, expectedCode] of Object.entries(invalidFixtures)) {
    it(`rejects invalid fixture ${fixture}`, () => {
      const file = join(fixtureRoot, "invalid", fixture);
      const parsed = parseAnpl(readFileSync(file, "utf8"), file);

      expect(parsed.ok).toBe(true);
      if (!parsed.ok) {
        return;
      }

      const semantic = analyzeProgram(parsed.program);
      expect(semantic.ok).toBe(false);
      expect(semantic.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        expectedCode
      );
    });
  }

  for (const fixture of validFixtures) {
    it(`keeps valid fixture snapshots stable for ${fixture}`, () => {
      const file = join(fixtureRoot, "valid", fixture);
      const parsed = parseAnpl(readFileSync(file, "utf8"), file);
      const name = fixtureBaseName(fixture);

      expect(snapshotJson({ ok: parsed.ok, diagnostics: parsed.diagnostics, cst: parsed.cst })).toBe(
        readSnapshot("valid", `${name}.parse.json`)
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) {
        return;
      }
      expect(snapshotJson(parsed.program)).toBe(readSnapshot("valid", `${name}.ast.json`));

      const semantic = analyzeProgram(parsed.program);
      expect(semantic.ok).toBe(true);
      if (!semantic.ok) {
        return;
      }

      const hir = lowerProgramToHir(parsed.program, semantic.typedProgram);
      const mir = lowerHirToMir(hir);
      const js = compileMirProgramToJavaScript(mir);

      expect(snapshotJson(hir)).toBe(readSnapshot("valid", `${name}.hir.json`));
      expect(snapshotJson(mir)).toBe(readSnapshot("valid", `${name}.mir.json`));
      expect(js).toBe(readSnapshot("valid", `${name}.js`));
    });
  }

  for (const [fixture] of Object.entries(invalidFixtures)) {
    it(`keeps invalid fixture snapshots stable for ${fixture}`, () => {
      const file = join(fixtureRoot, "invalid", fixture);
      const parsed = parseAnpl(readFileSync(file, "utf8"), file);
      const name = fixtureBaseName(fixture);

      expect(snapshotJson({ ok: parsed.ok, diagnostics: parsed.diagnostics, cst: parsed.cst })).toBe(
        readSnapshot("invalid", `${name}.parse.json`)
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) {
        return;
      }
      expect(snapshotJson(parsed.program)).toBe(readSnapshot("invalid", `${name}.ast.json`));

      const semantic = analyzeProgram(parsed.program);
      expect(snapshotJson(semantic.diagnostics)).toBe(
        readSnapshot("invalid", `${name}.diagnostics.json`)
      );
    });
  }

  for (const fixture of ["math.anpl", "imports.anpl"]) {
    it(`executes ${fixture} through MIR`, () => {
      const file = join(fixtureRoot, "valid", fixture);
      const parsed = parseAnpl(readFileSync(file, "utf8"), file);

      expect(parsed.ok).toBe(true);
      if (!parsed.ok) {
        return;
      }

      const semantic = analyzeProgram(parsed.program);
      expect(semantic.ok).toBe(true);
      if (!semantic.ok) {
        return;
      }

      const result = interpretMirProgram(
        lowerHirToMir(lowerProgramToHir(parsed.program, semantic.typedProgram))
      );
      expect(result).toMatchObject({
        ok: true,
        value: {
          kind: "int",
          value: 5
        }
      });
    });
  }

  for (const fixture of ["math.anpl", "imports.anpl"]) {
    it(`executes ${fixture} after MIR JavaScript compilation`, async () => {
      const file = join(fixtureRoot, "valid", fixture);
      const parsed = parseAnpl(readFileSync(file, "utf8"), file);

      expect(parsed.ok).toBe(true);
      if (!parsed.ok) {
        return;
      }

      const semantic = analyzeProgram(parsed.program);
      expect(semantic.ok).toBe(true);
      if (!semantic.ok) {
        return;
      }

      const js = compileMirProgramToJavaScript(
        lowerHirToMir(lowerProgramToHir(parsed.program, semantic.typedProgram))
      );
      const module = (await import(
        `data:text/javascript;charset=utf-8,${encodeURIComponent(js)}`
      )) as {
        __anpl_modules: Record<string, Record<string, () => unknown>>;
      };
      const moduleName = fixture === "imports.anpl" ? "app" : "math";

      expect(module.__anpl_modules[moduleName]?.main()).toBe(5);
    });
  }
});

function fixtureBaseName(fixture: string): string {
  return fixture.replace(/\.anpl$/, "");
}

function snapshotJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readSnapshot(group: "valid" | "invalid", file: string): string {
  return readFileSync(join(fixtureRoot, "snapshots", group, file), "utf8");
}
