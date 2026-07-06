import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const tsxBin = join(repoRoot, "node_modules/.bin/tsx");
const cliEntry = join(repoRoot, "packages/cli/src/index.ts");

type CliResult = {
  code: number;
  stdout: string;
  stderr: string;
};

describe("CLI conformance", () => {
  it("checks, runs, emits, and diagnoses file inputs through the CLI process", async () => {
    const validFile = "tests/conformance/valid/math.anpl";
    const invalidFile = "tests/conformance/invalid/type-mismatch.anpl";
    const check = await runAnpl(["check", validFile]);
    expect(check).toMatchObject({
      code: 0,
      stderr: ""
    });
    expect(check.stdout).toContain(`OK ${validFile}`);

    const run = await runAnpl(["run", validFile]);
    expect(run).toMatchObject({
      code: 0,
      stderr: ""
    });
    expect(run.stdout.trim()).toBe("5");

    const emitAst = await runAnpl(["emit", "ast", validFile]);
    expect(emitAst.code).toBe(0);
    expect(JSON.parse(emitAst.stdout)).toMatchObject({
      kind: "Program"
    });

    const emitHir = await runAnpl(["emit", "hir", validFile]);
    expect(emitHir.code).toBe(0);
    expect(JSON.parse(emitHir.stdout)).toMatchObject({
      modules: expect.any(Array)
    });

    const emitMir = await runAnpl(["emit", "mir", validFile]);
    expect(emitMir.code).toBe(0);
    expect(JSON.parse(emitMir.stdout)).toMatchObject({
      functions: expect.any(Array)
    });

    const invalid = await runAnpl(["check", invalidFile, "--json"]);
    expect(invalid.code).toBe(1);
    expect(JSON.parse(invalid.stderr)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ANPL_RETURN_TYPE_MISMATCH"
        })
      ])
    );

    const tempDir = await mkdtemp(join(tmpdir(), "anpl-cli-log-"));
    try {
      const logFile = join(tempDir, "runtime.log");
      await writeFile(logFile, "TypeError: invalid call\nat generated.js:1:1\n", "utf8");
      const diagnose = await runAnpl(["diagnose", logFile]);
      expect(diagnose.code).toBe(0);
      expect(JSON.parse(diagnose.stdout)).toEqual([
        expect.objectContaining({
          code: "ANPL_RUNTIME_ERROR"
        })
      ]);
    } finally {
      await rm(tempDir, {
        recursive: true,
        force: true
      });
    }

    const explain = await runAnpl(["explain", "ANPL_TYPE_MISMATCH"]);
    expect(explain.code).toBe(0);
    expect(explain.stdout).toContain("ANPL_TYPE_MISMATCH");
    expect(explain.stdout).toContain("category: type");
  });

  it("initializes, formats, and builds projects through the CLI process", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "anpl-cli-project-"));

    try {
      const init = await runAnpl(["init", tempDir, "--name", "CLI Demo", "--module", "cli_demo"]);
      expect(init.code).toBe(0);
      expect(init.stdout).toContain("Created");
      expect(await readFile(join(tempDir, "anpl.json"), "utf8")).toContain("\"name\": \"cli-demo\"");
      expect(await readFile(join(tempDir, "src/main.anpl"), "utf8")).toContain("module cli_demo");

      const projectCheck = await runAnpl(["check", "--project-root", tempDir]);
      expect(projectCheck.code).toBe(0);
      expect(projectCheck.stdout).toContain(`OK ${tempDir}`);

      const projectRun = await runAnpl(["run", "--project-root", tempDir]);
      expect(projectRun.code).toBe(0);
      expect(projectRun.stdout.trim()).toBe("0");

      const messyFile = join(tempDir, "src/messy.anpl");
      await writeFile(
        messyFile,
        "module messy\n\nfn main() -> int {\nreturn 1\n}\n",
        "utf8"
      );
      const format = await runAnpl(["format", messyFile]);
      expect(format.code).toBe(0);
      expect(await readFile(messyFile, "utf8")).toBe(
        "module messy\n\nfn main() -> int {\n  return 1\n}\n"
      );

      const namespaceBuild = await runAnpl([
        "build",
        "--project-root",
        tempDir,
        "--out",
        "dist"
      ]);
      expect(namespaceBuild.code).toBe(0);
      expect(namespaceBuild.stdout).toContain("Generated dist/anpl.js");
      expect(await readFile(join(tempDir, "dist/anpl.js"), "utf8")).toContain("__anpl_modules");
      expect(await readFile(join(tempDir, "dist/anpl.js.map.json"), "utf8")).toContain("\"target\": \"js\"");

      const esmBuild = await runAnpl([
        "build",
        "--project-root",
        tempDir,
        "--out",
        "esm-dist",
        "--module-format",
        "esm"
      ]);
      expect(esmBuild.code).toBe(0);
      expect(esmBuild.stdout).toContain("Generated 3 js artifacts in esm-dist");
      expect(await readFile(join(tempDir, "esm-dist/anpl-runtime.js"), "utf8")).toContain(
        "export function __anpl_track_value"
      );
      expect(await readFile(join(tempDir, "esm-dist/cli_demo.js"), "utf8")).toContain(
        "from \"./anpl-runtime.js\""
      );
      expect(await readFile(join(tempDir, "esm-dist/messy.js"), "utf8")).toContain(
        "export function main()"
      );
    } finally {
      await rm(tempDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("writes benchmark JSON artifacts through the CLI process", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "anpl-cli-benchmark-"));

    try {
      const outFile = join(tempDir, "artifacts/benchmark.json");
      const benchmark = await runAnpl(["benchmark", "--json", "--out", outFile]);
      expect(benchmark).toMatchObject({
        code: 0,
        stderr: ""
      });

      const stdout = JSON.parse(benchmark.stdout);
      const artifact = JSON.parse(await readFile(outFile, "utf8"));
      expect(stdout).toMatchObject({
        summary: {
          taskCount: 13,
          runCount: 39,
          anplFirstSuccessRate: 1
        }
      });
      expect(artifact).toMatchObject(stdout);
    } finally {
      await rm(tempDir, {
        recursive: true,
        force: true
      });
    }
  });
});

async function runAnpl(args: string[], cwd = repoRoot): Promise<CliResult> {
  try {
    const result = await execFileAsync(
      tsxBin,
      ["--tsconfig", resolve(repoRoot, "tsconfig.base.json"), cliEntry, ...args],
      {
        cwd,
        maxBuffer: 10 * 1024 * 1024
      }
    );
    return {
      code: 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    const failed = error as Error & {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: typeof failed.code === "number" ? failed.code : 1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? ""
    };
  }
}
