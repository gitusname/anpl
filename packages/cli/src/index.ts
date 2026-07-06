#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
import {
  benchmarkSuiteToJson,
  benchmarkSuiteToText,
  runOfflineBenchmarkSuite
} from "@anpl/benchmark";
import {
  compileProject,
  nodeCompilerHost,
  type CompileMode,
  type CompilerArtifact,
  type CompilerResult
} from "@anpl/compiler";
import type { Diagnostic } from "@anpl/core";
import {
  diagnosticsToJson,
  diagnosticsToYaml,
  explainDiagnosticCode,
  formatDiagnostics
} from "@anpl/diagnostics";
import type { RuntimeValue } from "@anpl/runtime";
import { runtimeValueToDisplay } from "@anpl/runtime";

const program = new Command()
  .name("anpl")
  .description("Machine-first programming language toolchain for AI coding tools")
  .version("0.0.0");

program
  .command("init")
  .argument("[dir]")
  .option("--name <name>", "project name")
  .option("--module <module>", "initial ANPL module name")
  .option("--force", "overwrite generated project files")
  .description("initialize a minimal ANPL project")
  .action(
    async (
      dir: string | undefined,
      options: { name?: string; module?: string; force?: boolean }
    ) => {
      const result = await compileProject(
        {
          mode: "init",
          projectRoot: resolve(dir ?? process.cwd()),
          init: {
            name: options.name,
            moduleName: options.module,
            force: options.force
          }
        },
        nodeCompilerHost
      );
      if (!result.ok) {
        printDiagnostics(result.diagnostics);
        process.exitCode = 1;
        return;
      }

      for (const artifact of result.artifacts.filter((candidate) => candidate.kind === "project")) {
        console.log(`Created ${artifact.path}`);
      }
    }
  );

program
  .command("check")
  .argument("[file]")
  .option("--project-root <dir>", "project root when no file is provided")
  .option("--json", "print diagnostics as JSON")
  .option("--yaml", "print diagnostics as YAML")
  .description("parse and semantically check an ANPL file or project")
  .action(async (file: string | undefined, options: { json?: boolean; yaml?: boolean; projectRoot?: string }) => {
    const result = await compileInput("check", file, {
      projectRoot: options.projectRoot
    });
    if (!result.ok) {
      printDiagnostics(result.diagnostics, diagnosticOutputFormat(options));
      process.exitCode = 1;
      return;
    }
    console.log(`OK ${file ?? options.projectRoot ?? process.cwd()}`);
  });

program
  .command("run")
  .argument("[file]")
  .option("--project-root <dir>", "project root when no file is provided")
  .description("run an ANPL file or project through the interpreter")
  .action(async (file: string | undefined, options: { projectRoot?: string }) => {
    const result = await compileInput("run", file, {
      projectRoot: options.projectRoot
    });
    if (!result.ok) {
      printDiagnostics(result.diagnostics);
      process.exitCode = 1;
      return;
    }

    const runResult = result.value as { output: string[]; value?: RuntimeValue } | undefined;
    for (const line of runResult?.output ?? []) {
      console.log(line);
    }
    if (runResult?.value !== undefined) {
      console.log(runtimeValueToDisplay(runResult.value));
    }
  });

program
  .command("build")
  .argument("[file]")
  .option("--project-root <dir>", "project root when no file is provided")
  .option("--target <target>", "compiler target", "js")
  .option("--out <dir>", "output directory", "generated")
  .option("--module-format <format>", "backend module format: namespace or esm", "namespace")
  .description("compile an ANPL file or project")
  .action(async (
    file: string | undefined,
    options: { projectRoot?: string; target: "js" | "ts"; out: string; moduleFormat: string }
  ) => {
    const moduleFormat = parseModuleFormat(options.moduleFormat);
    if (moduleFormat === undefined) {
      console.error(`Unknown module format: ${options.moduleFormat}`);
      console.error("Expected one of: namespace, esm");
      process.exitCode = 1;
      return;
    }

    const result = await compileInput("build", file, {
      projectRoot: options.projectRoot,
      target: options.target,
      outDir: options.out,
      moduleFormat
    });
    if (!result.ok) {
      printDiagnostics(result.diagnostics);
      process.exitCode = 1;
      return;
    }

    const generated = result.artifacts.filter(
      (artifact) => artifact.kind === options.target
    );
    if (generated.length <= 1) {
      console.log(`Generated ${generated[0]?.path ?? `${options.out}/anpl.${options.target}`}`);
      return;
    }
    console.log(`Generated ${generated.length} ${options.target} artifacts in ${options.out}`);
  });

program
  .command("emit")
  .argument("<kind>", "artifact kind: ast, hir, mir, or ir")
  .argument("<file>")
  .description("print compiler artifacts as JSON")
  .action(async (kind: string, file: string) => {
    const selection = emitSelection(kind);
    if (selection === undefined) {
      console.error(`Unknown emit kind: ${kind}`);
      console.error("Expected one of: ast, hir, mir, ir");
      process.exitCode = 1;
      return;
    }

    await emitArtifact(selection.mode, file, selection.kind);
  });

program
  .command("emit-ast")
  .argument("<file>")
  .description("print parsed ANPL AST as JSON")
  .action(async (file: string) => {
    await emitArtifact("emit-ast", file, "ast");
  });

program
  .command("emit-hir")
  .argument("<file>")
  .description("print ANPL HIR as JSON")
  .action(async (file: string) => {
    await emitArtifact("emit-hir", file, "hir");
  });

program
  .command("emit-mir")
  .argument("<file>")
  .description("print ANPL MIR as JSON")
  .action(async (file: string) => {
    await emitArtifact("emit-mir", file, "mir");
  });

program
  .command("emit-ir")
  .argument("<file>")
  .description("print ANPL MIR as JSON (compatibility alias)")
  .action(async (file: string) => {
    await emitArtifact("emit-mir", file, "mir");
  });

program
  .command("format")
  .argument("<file>")
  .description("rewrite an ANPL file in canonical format")
  .action(async (file: string) => {
    const result = await compileFile("format", file);
    if (!result.ok) {
      printDiagnostics(result.diagnostics);
      process.exitCode = 1;
      return;
    }
    console.log(`Formatted ${file}`);
  });

program
  .command("diagnose")
  .argument("<file>")
  .option("--yaml", "print diagnostic as YAML")
  .description("compress a log file into a simple ANPL diagnostic")
  .action((file: string, options: { yaml?: boolean }) => {
    const content = readFileSync(file, "utf8");
    const diagnostic: Diagnostic = {
      code: inferDiagnosticCode(content),
      severity: "error",
      message: firstUsefulLine(content) ?? "No diagnostic evidence found.",
      file,
      evidence: content.split(/\r?\n/).filter(Boolean).slice(0, 5),
      confidence: "medium"
    };
    console.log(options.yaml ? diagnosticsToYaml([diagnostic]) : diagnosticsToJson([diagnostic]));
  });

program
  .command("benchmark")
  .option("--json", "print benchmark results as JSON")
  .option("--no-execute", "skip generated JavaScript execution")
  .option("--out <file>", "write benchmark results as a JSON artifact")
  .description("run the offline ANPL benchmark fixture suite")
  .action(async (options: { json?: boolean; execute?: boolean; out?: string }) => {
    const result = await runOfflineBenchmarkSuite(undefined, {
      executeGeneratedJavaScript: options.execute
    });
    const json = benchmarkSuiteToJson(result);
    if (options.out !== undefined) {
      const outPath = resolve(options.out);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, `${json}\n`, "utf8");
    }

    console.log(options.json ? json : benchmarkSuiteToText(result));
    if (options.out !== undefined && options.json !== true) {
      console.log(`Wrote ${options.out}`);
    }
  });

program
  .command("explain")
  .argument("<code>")
  .option("--json", "print explanation as JSON")
  .description("explain an ANPL diagnostic code")
  .action((code: string, options: { json?: boolean }) => {
    const explanation = explainDiagnosticCode(code);
    if (explanation === undefined) {
      console.error(`Unknown diagnostic code: ${code}`);
      process.exitCode = 1;
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(explanation, null, 2));
      return;
    }

    console.log(`${explanation.code}`);
    console.log(`category: ${explanation.category}`);
    console.log(`severity: ${explanation.severity}`);
    console.log(`aiRepairable: ${String(explanation.aiRepairable)}`);
    console.log(`message: ${explanation.messageTemplate}`);
    if (explanation.causeTemplate !== undefined) {
      console.log(`cause: ${explanation.causeTemplate}`);
    }
    if (explanation.fixTemplate !== undefined) {
      console.log(`fix: ${explanation.fixTemplate}`);
    }
  });

program.parseAsync();

type EmitSelection = {
  mode: Extract<CompileMode, "emit-ast" | "emit-hir" | "emit-mir">;
  kind: Extract<CompilerArtifact["kind"], "ast" | "hir" | "mir">;
};

function emitSelection(kind: string): EmitSelection | undefined {
  switch (kind) {
    case "ast":
      return { mode: "emit-ast", kind: "ast" };
    case "hir":
      return { mode: "emit-hir", kind: "hir" };
    case "mir":
    case "ir":
      return { mode: "emit-mir", kind: "mir" };
    default:
      return undefined;
  }
}

async function emitArtifact(
  mode: Extract<CompileMode, "emit-ast" | "emit-hir" | "emit-mir">,
  file: string,
  kind: Extract<CompilerArtifact["kind"], "ast" | "hir" | "mir">
): Promise<void> {
  const result = await compileFile(mode, file);
  if (!result.ok) {
    printDiagnostics(result.diagnostics);
    process.exitCode = 1;
    return;
  }

  const artifact = result.artifacts.find((candidate) => candidate.kind === kind);
  console.log(artifact?.content ?? "");
}

async function compileFile(
  mode: CompileMode,
  file: string,
  overrides: Partial<Parameters<typeof compileProject>[0]> = {}
): Promise<CompilerResult> {
  const absoluteFile = resolve(file);

  return compileProject(
    {
      mode,
      projectRoot: dirname(absoluteFile),
      entry: absoluteFile,
      ...overrides
    },
    nodeCompilerHost
  );
}

async function compileInput(
  mode: CompileMode,
  file: string | undefined,
  options: Partial<Parameters<typeof compileProject>[0]> & { projectRoot?: string } = {}
): Promise<CompilerResult> {
  const { projectRoot, ...overrides } = options;

  if (file !== undefined) {
    const absoluteFile = resolve(file);
    return compileProject(
      {
        mode,
        projectRoot: resolve(projectRoot ?? dirname(absoluteFile)),
        entry: absoluteFile,
        ...overrides
      },
      nodeCompilerHost
    );
  }

  return compileProject(
    {
      mode,
      projectRoot: resolve(projectRoot ?? process.cwd()),
      ...overrides,
      entry: undefined
    },
    nodeCompilerHost
  );
}

type DiagnosticOutputFormat = "human" | "json" | "yaml";

function diagnosticOutputFormat(options: { json?: boolean; yaml?: boolean }): DiagnosticOutputFormat {
  if (options.yaml === true) {
    return "yaml";
  }
  if (options.json === true) {
    return "json";
  }
  return "human";
}

function parseModuleFormat(value: string): "namespace" | "esm" | undefined {
  if (value === "namespace" || value === "esm") {
    return value;
  }
  return undefined;
}

function printDiagnostics(
  diagnostics: Diagnostic[],
  format: DiagnosticOutputFormat = "human"
): void {
  if (format === "json") {
    console.error(diagnosticsToJson(diagnostics));
    return;
  }
  if (format === "yaml") {
    console.error(diagnosticsToYaml(diagnostics));
    return;
  }
  console.error(formatDiagnostics(diagnostics));
}

function firstUsefulLine(content: string): string | undefined {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

function inferDiagnosticCode(content: string): string {
  if (content.includes("TypeError")) {
    return "ANPL_RUNTIME_ERROR";
  }
  if (content.includes("SyntaxError")) {
    return "ANPL_PARSE_UNEXPECTED_TOKEN";
  }
  if (content.includes("not found") || content.includes("undefined")) {
    return "ANPL_SEMANTIC_UNKNOWN_SYMBOL";
  }
  return "ANPL_DIAGNOSTIC_LOG";
}
