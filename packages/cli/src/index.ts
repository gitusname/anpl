#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { compileProgramToJavaScriptFile } from "@anpl/compiler-js";
import type { Diagnostic } from "@anpl/core";
import { diagnosticsToJson, formatDiagnostics } from "@anpl/diagnostics";
import { interpretProgram } from "@anpl/interpreter";
import { lowerProgram } from "@anpl/ir";
import { optimizeProgram } from "@anpl/optimizer";
import { parseAnpl } from "@anpl/parser";
import { analyzeProgram } from "@anpl/semantic";

type PipelineResult =
  | {
      ok: true;
      ast: unknown;
      ir: ReturnType<typeof lowerProgram>;
      diagnostics: [];
    }
  | {
      ok: false;
      ast?: unknown;
      ir?: ReturnType<typeof lowerProgram>;
      diagnostics: Diagnostic[];
    };

const program = new Command()
  .name("anpl")
  .description("AI-native programming language toolchain")
  .version("0.0.0");

program
  .command("check")
  .argument("<file>")
  .option("--json", "print diagnostics as JSON")
  .description("parse and semantically check an ANPL file")
  .action((file: string, options: { json?: boolean }) => {
    const result = runPipeline(file);
    if (!result.ok) {
      printDiagnostics(result.diagnostics, options.json);
      process.exitCode = 1;
      return;
    }
    console.log(`OK ${file}`);
  });

program
  .command("run")
  .argument("<file>")
  .description("run an ANPL file through the interpreter")
  .action((file: string) => {
    const pipeline = runPipeline(file);
    if (!pipeline.ok) {
      printDiagnostics(pipeline.diagnostics);
      process.exitCode = 1;
      return;
    }

    const result = interpretProgram(pipeline.ir);
    if (!result.ok) {
      printDiagnostics(result.diagnostics);
      process.exitCode = 1;
      return;
    }

    for (const line of result.output) {
      console.log(line);
    }
    if (result.value !== undefined) {
      console.log(result.value);
    }
  });

program
  .command("build")
  .argument("<file>")
  .option("--target <target>", "compiler target", "js")
  .option("--out <dir>", "output directory", "generated")
  .description("compile an ANPL file")
  .action((file: string, options: { target: string; out: string }) => {
    const pipeline = runPipeline(file);
    if (!pipeline.ok) {
      printDiagnostics(pipeline.diagnostics);
      process.exitCode = 1;
      return;
    }

    if (options.target !== "js") {
      printDiagnostics([
        {
          code: "ANPL_UNSUPPORTED_TARGET",
          severity: "error",
          message: `Unsupported target '${options.target}'.`,
          confidence: "high"
        }
      ]);
      process.exitCode = 1;
      return;
    }

    const generated = compileProgramToJavaScriptFile(
      pipeline.ir,
      join(options.out, "anpl.js")
    );
    mkdirSync(dirname(generated.path), { recursive: true });
    writeFileSync(generated.path, generated.content);
    console.log(`Generated ${generated.path}`);
  });

program
  .command("emit-ast")
  .argument("<file>")
  .description("print parsed ANPL AST as JSON")
  .action((file: string) => {
    const source = readFileSync(file, "utf8");
    const parsed = parseAnpl(source, file);
    if (!parsed.ok) {
      printDiagnostics(parsed.diagnostics);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(parsed.program, null, 2));
  });

program
  .command("emit-ir")
  .argument("<file>")
  .description("print ANPL IR as JSON")
  .action((file: string) => {
    const pipeline = runPipeline(file);
    if (!pipeline.ok) {
      printDiagnostics(pipeline.diagnostics);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(pipeline.ir, null, 2));
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

program.parse();

function runPipeline(file: string): PipelineResult {
  const source = readFileSync(file, "utf8");
  const parsed = parseAnpl(source, file);
  if (!parsed.ok) {
    return {
      ok: false,
      ast: parsed.program,
      diagnostics: parsed.diagnostics
    };
  }

  const semantic = analyzeProgram(parsed.program);
  if (!semantic.ok) {
    return {
      ok: false,
      ast: parsed.program,
      diagnostics: semantic.diagnostics
    };
  }

  return {
    ok: true,
    ast: parsed.program,
    ir: optimizeProgram(lowerProgram(parsed.program)),
    diagnostics: []
  };
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
