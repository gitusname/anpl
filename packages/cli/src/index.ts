#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
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
  explainDiagnosticCode,
  formatDiagnostics
} from "@anpl/diagnostics";

const program = new Command()
  .name("anpl")
  .description("Machine-first programming language toolchain for AI coding tools")
  .version("0.0.0");

program
  .command("check")
  .argument("[file]")
  .option("--project-root <dir>", "project root when no file is provided")
  .option("--json", "print diagnostics as JSON")
  .description("parse and semantically check an ANPL file or project")
  .action(async (file: string | undefined, options: { json?: boolean; projectRoot?: string }) => {
    const result = await compileInput("check", file, {
      projectRoot: options.projectRoot
    });
    if (!result.ok) {
      printDiagnostics(result.diagnostics, options.json);
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

    const runResult = result.value as { output: string[]; value?: unknown } | undefined;
    for (const line of runResult?.output ?? []) {
      console.log(line);
    }
    if (runResult?.value !== undefined) {
      console.log(runResult.value);
    }
  });

program
  .command("build")
  .argument("[file]")
  .option("--project-root <dir>", "project root when no file is provided")
  .option("--target <target>", "compiler target", "js")
  .option("--out <dir>", "output directory", "generated")
  .description("compile an ANPL file or project")
  .action(async (file: string | undefined, options: { projectRoot?: string; target: "js" | "ts"; out: string }) => {
    const result = await compileInput("build", file, {
      projectRoot: options.projectRoot,
      target: options.target,
      outDir: options.out
    });
    if (!result.ok) {
      printDiagnostics(result.diagnostics);
      process.exitCode = 1;
      return;
    }

    const generated = result.artifacts.find((artifact) => artifact.kind === "js");
    console.log(`Generated ${generated?.path ?? `${options.out}/anpl.js`}`);
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
  .description("compress a log file into a simple ANPL diagnostic")
  .action((file: string) => {
    const content = readFileSync(file, "utf8");
    const diagnostic: Diagnostic = {
      code: inferDiagnosticCode(content),
      severity: "error",
      message: firstUsefulLine(content) ?? "No diagnostic evidence found.",
      file,
      evidence: content.split(/\r?\n/).filter(Boolean).slice(0, 5),
      confidence: "medium"
    };
    console.log(diagnosticsToJson([diagnostic]));
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

async function emitArtifact(
  mode: Extract<CompileMode, "emit-ast" | "emit-hir" | "emit-mir">,
  file: string,
  kind: CompilerArtifact["kind"]
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

function printDiagnostics(diagnostics: Diagnostic[], asJson = false): void {
  console.error(asJson ? diagnosticsToJson(diagnostics) : formatDiagnostics(diagnostics));
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
