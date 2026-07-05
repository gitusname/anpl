import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { compileProgramToJavaScriptFile } from "@anpl/compiler-js";
import type { Diagnostic } from "@anpl/core";
import { createDiagnostic } from "@anpl/core";
import { formatProgram } from "@anpl/formatter";
import { lowerProgramToHir } from "@anpl/hir";
import { interpretMirProgram } from "@anpl/interpreter";
import { lowerProgram } from "@anpl/ir";
import { lowerHirToMir } from "@anpl/mir";
import { optimizeMir, optimizeProgram } from "@anpl/optimizer";
import { parseAnpl } from "@anpl/parser";
import { buildModuleGraph, loadProject, type ProjectDirEntry } from "@anpl/project";
import { analyzeProgram, type SemanticResult } from "@anpl/semantic";
import type { Program } from "@anpl/ast";
import type { ProductionSourceFile } from "@anpl/source";

export type CompileMode =
  | "check"
  | "run"
  | "build"
  | "emit-ast"
  | "emit-hir"
  | "emit-mir"
  | "format";

export type CompilerOptions = {
  mode: CompileMode;
  target?: "js" | "ts" | "interpreter";
  projectRoot: string;
  entry?: string;
  outDir?: string;
  diagnosticsFormat?: "human" | "json" | "yaml";
  strict?: boolean;
};

export type CompilerResult<T = unknown> = {
  ok: boolean;
  value?: T;
  diagnostics: Diagnostic[];
  artifacts: CompilerArtifact[];
  timings: CompilerTimings;
};

export type CompilerArtifact = {
  kind: "ast" | "hir" | "mir" | "js" | "map" | "diagnostic" | "formatted";
  path?: string;
  content: string;
};

export type CompilerTimings = {
  loadMs: number;
  lexMs: number;
  parseMs: number;
  semanticMs: number;
  irMs: number;
  optimizeMs: number;
  backendMs: number;
  totalMs: number;
};

export type CompilerHost = {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  resolvePath(from: string, specifier: string): Promise<string>;
  readDir?(path: string): Promise<ProjectDirEntry[]>;
  now(): number;
  randomUUID(): string;
};

export const nodeCompilerHost: CompilerHost = {
  readFile: async (path) => readFile(path, "utf8"),
  writeFile: async (path, content) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  },
  fileExists: async (path) => existsSync(path),
  resolvePath: async (from, specifier) => {
    if (specifier.startsWith("/")) {
      return specifier;
    }

    const base = isDirectoryPath(from) ? from : dirname(from);
    return resolve(base, specifier);
  },
  readDir: async (path) => {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      path: join(path, entry.name),
      kind: entry.isDirectory() ? "directory" : "file"
    }));
  },
  now: () => Date.now(),
  randomUUID: () => randomUUID()
};

function isDirectoryPath(path: string): boolean {
  if (existsSync(path)) {
    return statSync(path).isDirectory();
  }
  return extname(path).length === 0;
}

type PipelineState = {
  sourcePath: string;
  source: string;
  parsed: ReturnType<typeof parseAnpl>;
  entryParsed: ReturnType<typeof parseAnpl>;
  semantic?: SemanticResult;
  hir?: ReturnType<typeof lowerProgramToHir>;
  mir?: ReturnType<typeof lowerHirToMir>;
  ir?: ReturnType<typeof lowerProgram>;
};

export async function compileProject(
  options: CompilerOptions,
  host: CompilerHost
): Promise<CompilerResult> {
  const timings = emptyTimings();
  const totalStart = host.now();
  const diagnostics: Diagnostic[] = [];
  const artifacts: CompilerArtifact[] = [];

  try {
    const loadStart = host.now();
    const project = await loadProject(options.projectRoot, host, {
      entry: options.entry
    });
    const entry = project.manifest.entry;
    const sourcePath = await host.resolvePath(options.projectRoot, entry);
    const entrySourceFile = project.files.find((file) => file.path === sourcePath);
    const source = entrySourceFile?.content ?? "";
    timings.loadMs = host.now() - loadStart;

    const parseStart = host.now();
    const parsedFiles = parseProjectFiles(project.files);
    const parsed = mergeParsedFiles(parsedFiles);
    const entryParsed =
      parsedFiles.find((file) => file.source.path === sourcePath)?.parsed ?? parsed;
    timings.parseMs = host.now() - parseStart;
    diagnostics.push(...parsed.diagnostics);

    if (!parsed.ok) {
      return finish({
        ok: false,
        diagnostics,
        artifacts,
        timings,
        totalStart,
        host
      });
    }

    const semanticStart = host.now();
    const semantic = analyzeProgram(parsed.program);
    const moduleGraph = buildModuleGraph(parsed.program, sourcePath);
    timings.semanticMs = host.now() - semanticStart;
    diagnostics.push(...moduleGraph.diagnostics);

    if (!semantic.ok || moduleGraph.diagnostics.length > 0) {
      diagnostics.push(...semantic.diagnostics);
      return finish({
        ok: false,
        diagnostics,
        artifacts,
        timings,
        totalStart,
        host
      });
    }

    const irStart = host.now();
    const hir = lowerProgramToHir(parsed.program);
    const mir = lowerHirToMir(hir);
    const ir = lowerProgram(parsed.program);
    timings.irMs = host.now() - irStart;

    const optimizeStart = host.now();
    const optimizedMir = optimizeMir(mir);
    const optimized = optimizeProgram(ir);
    timings.optimizeMs = host.now() - optimizeStart;
    diagnostics.push(...optimizedMir.diagnostics);

    const state: PipelineState = {
      sourcePath,
      source,
      parsed,
      entryParsed,
      semantic,
      hir,
      mir: optimizedMir.program,
      ir: optimized
    };

    const backendStart = host.now();
    const result = await runMode(options, host, state, artifacts);
    timings.backendMs = host.now() - backendStart;
    diagnostics.push(...result.diagnostics);

    return finish({
      ok: result.ok,
      value: result.value,
      diagnostics,
      artifacts,
      timings,
      totalStart,
      host
    });
  } catch (error) {
    diagnostics.push(
      createDiagnostic({
        code: "ANPL_COMPILER_ERROR",
        severity: "error",
        message: error instanceof Error ? error.message : String(error),
        confidence: "high"
      })
    );

    return finish({
      ok: false,
      diagnostics,
      artifacts,
      timings,
      totalStart,
      host
    });
  }
}

async function runMode(
  options: CompilerOptions,
  host: CompilerHost,
  state: PipelineState,
  artifacts: CompilerArtifact[]
): Promise<{ ok: boolean; value?: unknown; diagnostics: Diagnostic[] }> {
  if (!state.parsed.ok || state.ir === undefined || state.hir === undefined || state.mir === undefined) {
    return { ok: false, diagnostics: [] };
  }

  switch (options.mode) {
    case "check":
      return { ok: true, diagnostics: [] };
    case "emit-ast":
      artifacts.push({
        kind: "ast",
        content: JSON.stringify(state.parsed.program, null, 2)
      });
      return { ok: true, value: state.parsed.program, diagnostics: [] };
    case "emit-hir":
      artifacts.push({
        kind: "hir",
        content: JSON.stringify(state.hir, null, 2)
      });
      return { ok: true, value: state.hir, diagnostics: [] };
    case "emit-mir":
      artifacts.push({
        kind: "mir",
        content: JSON.stringify(state.mir, null, 2)
      });
      return { ok: true, value: state.mir, diagnostics: [] };
    case "format": {
      if (!state.entryParsed.ok) {
        return { ok: false, diagnostics: state.entryParsed.diagnostics };
      }
      const formatted = formatProgram(state.entryParsed.program);
      artifacts.push({
        kind: "formatted",
        path: state.sourcePath,
        content: formatted
      });
      await host.writeFile(state.sourcePath, formatted);
      return { ok: true, value: formatted, diagnostics: [] };
    }
    case "run": {
      const result = interpretMirProgram(state.mir);
      return {
        ok: result.ok,
        value: result,
        diagnostics: result.diagnostics
      };
    }
    case "build": {
      if (options.target !== undefined && options.target !== "js") {
        const diagnostic = createDiagnostic({
          code: "ANPL_UNSUPPORTED_TARGET",
          severity: "error",
          message: `Unsupported target '${options.target}'.`,
          confidence: "high"
        });
        artifacts.push({
          kind: "diagnostic",
          content: JSON.stringify(diagnostic, null, 2)
        });
        return { ok: false, diagnostics: [diagnostic] };
      }

      const outDir = options.outDir ?? "generated";
      const generated = compileProgramToJavaScriptFile(state.ir, join(outDir, "anpl.js"));
      artifacts.push({
        kind: "js",
        path: generated.path,
        content: generated.content
      });
      await host.writeFile(await host.resolvePath(options.projectRoot, generated.path), generated.content);
      return { ok: true, value: generated, diagnostics: [] };
    }
  }
}

function finish(input: {
  ok: boolean;
  value?: unknown;
  diagnostics: Diagnostic[];
  artifacts: CompilerArtifact[];
  timings: CompilerTimings;
  totalStart: number;
  host: CompilerHost;
}): CompilerResult {
  input.timings.totalMs = input.host.now() - input.totalStart;

  return {
    ok: input.ok && input.diagnostics.length === 0,
    value: input.value,
    diagnostics: input.diagnostics,
    artifacts: input.artifacts,
    timings: input.timings
  };
}

type ParsedProjectFile = {
  source: ProductionSourceFile;
  parsed: ReturnType<typeof parseAnpl>;
};

function parseProjectFiles(files: ProductionSourceFile[]): ParsedProjectFile[] {
  return files.map((source) => ({
    source,
    parsed: parseAnpl(source.content, source.path)
  }));
}

function mergeParsedFiles(files: ParsedProjectFile[]): ReturnType<typeof parseAnpl> {
  if (files.length === 0) {
    const diagnostic = createDiagnostic({
      code: "ANPL_PROJECT_NO_SOURCES",
      severity: "error",
      message: "Project did not resolve any ANPL source files.",
      confidence: "high"
    });

    return {
      ok: false,
      diagnostics: [diagnostic]
    };
  }

  const diagnostics = files.flatMap((file) => file.parsed.diagnostics);
  const programs = files
    .map((file) => file.parsed.program)
    .filter((program): program is Program => program !== undefined);
  const program = mergePrograms(programs);

  if (diagnostics.length > 0 || files.some((file) => !file.parsed.ok)) {
    return {
      ok: false,
      program,
      diagnostics
    };
  }

  return {
    ok: true,
    program,
    diagnostics: []
  };
}

function mergePrograms(programs: Program[]): Program {
  const modules = programs.flatMap((program) => program.modules);
  const firstSpan = programs[0]?.span ?? fallbackSpan();
  const lastSpan = programs[programs.length - 1]?.span ?? firstSpan;

  return {
    kind: "Program",
    modules,
    span: {
      file: firstSpan.file,
      start: firstSpan.start,
      end: lastSpan.end
    }
  };
}

function fallbackSpan() {
  return {
    start: {
      offset: 0,
      line: 1,
      column: 1
    },
    end: {
      offset: 0,
      line: 1,
      column: 1
    }
  };
}

function emptyTimings(): CompilerTimings {
  return {
    loadMs: 0,
    lexMs: 0,
    parseMs: 0,
    semanticMs: 0,
    irMs: 0,
    optimizeMs: 0,
    backendMs: 0,
    totalMs: 0
  };
}
