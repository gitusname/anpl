import type { Diagnostic } from "@anpl/core";
import {
  compileProject,
  type CompilerHost,
  type CompilerResult
} from "@anpl/compiler";
import { compileMirProgramToJavaScript } from "@anpl/compiler-js";
import { lowerProgramToHir } from "@anpl/hir";
import { lowerHirToMir } from "@anpl/mir";
import { parseAnpl } from "@anpl/parser";
import { analyzeProgram } from "@anpl/semantic";

export type SourceMetrics = {
  bytes: number;
  characters: number;
  lines: number;
  estimatedTokens: number;
};

export type BenchmarkCase = {
  name: string;
  anplSource: string;
  targetSource: string;
};

export type BenchmarkResult = {
  name: string;
  anpl: SourceMetrics;
  target: SourceMetrics;
  tokenReductionRatio: number;
};

export type BenchmarkTask = {
  id: string;
  title: string;
  intent: string;
  expectedBehavior: string[];
  tests?: string[];
  anplSource?: string;
  anplFiles?: BenchmarkProjectFile[];
  directTargetSource?: string;
  directTargetVariants?: BenchmarkDirectTarget[];
  expectedResult?: unknown;
  entryModule?: string;
  entryFunction?: string;
};

export type BenchmarkProjectFile = {
  path: string;
  content: string;
};

export type BenchmarkTargetLanguage = "ts" | "python";

export type BenchmarkDirectTarget = {
  language: BenchmarkTargetLanguage;
  source: string;
};

export type BenchmarkRun = {
  taskId: string;
  mode: "direct-ts" | "direct-python" | "anpl-first";
  targetLanguage?: BenchmarkTargetLanguage;
  model?: string;
  promptTokens: number;
  outputTokens: number;
  repairLoops: number;
  success: boolean;
  diagnostics: Diagnostic[];
  parseSuccess?: boolean;
  semanticSuccess?: boolean;
  buildSuccess?: boolean;
  runSuccess?: boolean;
  diagnosticTokens: number;
  sourceTokens: number;
  generatedTargetTokens: number;
  durationMs: number;
};

export type BenchmarkSuiteResult = {
  tasks: BenchmarkTask[];
  runs: BenchmarkRun[];
  summary: BenchmarkSummary;
};

export type BenchmarkSummary = {
  taskCount: number;
  runCount: number;
  anplFirstSuccessRate: number;
  directTargetSuccessRate: number;
  anplParseSuccessRate: number;
  anplSemanticSuccessRate: number;
  anplBuildSuccessRate: number;
  anplRunSuccessRate: number;
  directTargetSuccessRates: Record<string, number>;
  averageSourceTokenReductionRatio: number;
  averageDiagnosticTokens: number;
  averageRepairLoops: number;
};

export type BenchmarkSuiteOptions = {
  model?: string;
  executeGeneratedJavaScript?: boolean;
};

const defaultPythonTargets: Record<string, string> = {
  "math-add": `def add(a: int, b: int) -> int:
    return a + b


def main() -> int:
    return add(2, 3)
`,
  "imported-add": `def math_add(a: int, b: int) -> int:
    return a + b


def main() -> int:
    return math_add(2, 3)
`,
  "record-enum": `def create_customer(name: str) -> dict:
    return {
        "name": name,
        "status": "active",
    }


def main() -> int:
    customer = create_customer("Ada")
    return len(customer["status"])
`,
  "branch-then": `def main() -> int:
    score = 7
    if score > 5:
        return 10
    return 0
`,
  "branch-else": `def main() -> int:
    score = 3
    if score > 5:
        return 10
    return 1
`,
  "arithmetic-precedence": `def main() -> int:
    return 2 + 3 * 4
`,
  "record-member": `def make_point(x: int, y: int) -> dict:
    return {
        "x": x,
        "y": y,
    }


def main() -> int:
    point = make_point(3, 4)
    return point["x"]
`,
  "enum-argument": `def score(status: str) -> int:
    return len(status)


def main() -> int:
    return score("active")
`,
  "nested-calls": `def inc(value: int) -> int:
    return value + 1


def main() -> int:
    return inc(inc(3))
`,
  "bool-logic": `def main() -> int:
    if 2 < 3 and 4 > 1:
        return 1
    return 0
`,
  "text-length": `def main() -> int:
    return len("Ada")
`,
  "multi-file-order-total": `def add(a: int, b: int) -> int:
    return a + b


def main() -> int:
    return add(40, 2)
`,
  "package-qualified-import": `def local_add(a: int, b: int) -> int:
    return 100


def mathlib_add(a: int, b: int) -> int:
    return a + b


def main() -> int:
    return mathlib_add(2, 3)
`
};

export const defaultBenchmarkTasks: BenchmarkTask[] = withPythonTargets([
  {
    id: "math-add",
    title: "Add two integers",
    intent: "Create a small module with add(a, b) and main() returning add(2, 3).",
    expectedBehavior: ["main returns 5"],
    anplSource: `module math

fn add(a: int, b: int) -> int {
  return a + b
}

fn main() -> int {
  return add(2, 3)
}
`,
    directTargetSource: `export function add(a: number, b: number): number {
  return a + b;
}

export function main(): number {
  return add(2, 3);
}
`,
    expectedResult: 5,
    entryModule: "math"
  },
  {
    id: "imported-add",
    title: "Call an imported module function",
    intent: "Create math.add and app.main; app imports math and returns add(2, 3).",
    expectedBehavior: ["app.main returns 5", "imported function call resolves to math.add"],
    anplSource: `module math

fn add(a: int, b: int) -> int {
  return a + b
}

module app

import math

fn main() -> int {
  return add(2, 3)
}
`,
    directTargetSource: `export namespace math {
  export function add(a: number, b: number): number {
    return a + b;
  }
}

export namespace app {
  export function main(): number {
    return math.add(2, 3);
  }
}
`,
    expectedResult: 5,
    entryModule: "app"
  },
  {
    id: "record-enum",
    title: "Construct a record with an enum-like status",
    intent: "Create a customer record with a status and return the status length.",
    expectedBehavior: ["main returns 6 for active"],
    anplSource: `module crm

type Customer {
  name: text
  status: enum[active, archived]
}

fn createCustomer(name: text) -> Customer {
  return Customer {
    name: name
    status: active
  }
}

fn main() -> int {
  let customer = createCustomer("Ada")
  return len(customer.status)
}
`,
    directTargetSource: `type Customer = {
  name: string;
  status: "active" | "archived";
};

function createCustomer(name: string): Customer {
  return {
    name,
    status: "active"
  };
}

export function main(): number {
  const customer = createCustomer("Ada");
  return customer.status.length;
}
`,
    expectedResult: 6,
    entryModule: "crm"
  },
  {
    id: "branch-then",
    title: "Return from then branch",
    intent: "Return 10 when a computed score is greater than 5.",
    expectedBehavior: ["main returns 10"],
    anplSource: `module rules

fn main() -> int {
  let score: int = 7
  if score > 5 {
    return 10
  }
  return 0
}
`,
    directTargetSource: `export function main(): number {
  const score = 7;
  if (score > 5) {
    return 10;
  }
  return 0;
}
`,
    expectedResult: 10,
    entryModule: "rules"
  },
  {
    id: "branch-else",
    title: "Fall through after false branch",
    intent: "Return 1 when a computed score is not greater than 5.",
    expectedBehavior: ["main returns 1"],
    anplSource: `module rules

fn main() -> int {
  let score: int = 3
  if score > 5 {
    return 10
  }
  return 1
}
`,
    directTargetSource: `export function main(): number {
  const score = 3;
  if (score > 5) {
    return 10;
  }
  return 1;
}
`,
    expectedResult: 1,
    entryModule: "rules"
  },
  {
    id: "arithmetic-precedence",
    title: "Preserve arithmetic precedence",
    intent: "Compute 2 + 3 * 4 and return the result.",
    expectedBehavior: ["main returns 14"],
    anplSource: `module math

fn main() -> int {
  return 2 + 3 * 4
}
`,
    directTargetSource: `export function main(): number {
  return 2 + 3 * 4;
}
`,
    expectedResult: 14,
    entryModule: "math"
  },
  {
    id: "record-member",
    title: "Read a record member",
    intent: "Construct a point and return its x coordinate.",
    expectedBehavior: ["main returns 3"],
    anplSource: `module geometry

type Point {
  x: int
  y: int
}

fn makePoint(x: int, y: int) -> Point {
  return Point {
    x: x
    y: y
  }
}

fn main() -> int {
  let point = makePoint(3, 4)
  return point.x
}
`,
    directTargetSource: `type Point = {
  x: number;
  y: number;
};

function makePoint(x: number, y: number): Point {
  return { x, y };
}

export function main(): number {
  const point = makePoint(3, 4);
  return point.x;
}
`,
    expectedResult: 3,
    entryModule: "geometry"
  },
  {
    id: "enum-argument",
    title: "Pass enum variant as argument",
    intent: "Pass an active status into a scoring function and return its length.",
    expectedBehavior: ["main returns 6"],
    anplSource: `module workflow

fn score(status: enum[active, archived]) -> int {
  return len(status)
}

fn main() -> int {
  return score(active)
}
`,
    directTargetSource: `type Status = "active" | "archived";

function score(status: Status): number {
  return status.length;
}

export function main(): number {
  return score("active");
}
`,
    expectedResult: 6,
    entryModule: "workflow"
  },
  {
    id: "nested-calls",
    title: "Evaluate nested calls",
    intent: "Implement inc and return inc(inc(3)).",
    expectedBehavior: ["main returns 5"],
    anplSource: `module math

fn inc(value: int) -> int {
  return value + 1
}

fn main() -> int {
  return inc(inc(3))
}
`,
    directTargetSource: `function inc(value: number): number {
  return value + 1;
}

export function main(): number {
  return inc(inc(3));
}
`,
    expectedResult: 5,
    entryModule: "math"
  },
  {
    id: "bool-logic",
    title: "Evaluate boolean logic",
    intent: "Return 1 when both simple comparisons are true.",
    expectedBehavior: ["main returns 1"],
    anplSource: `module logic

fn main() -> int {
  if 2 < 3 and 4 > 1 {
    return 1
  }
  return 0
}
`,
    directTargetSource: `export function main(): number {
  if (2 < 3 && 4 > 1) {
    return 1;
  }
  return 0;
}
`,
    expectedResult: 1,
    entryModule: "logic"
  },
  {
    id: "text-length",
    title: "Call a text builtin",
    intent: "Return the length of a text literal.",
    expectedBehavior: ["main returns 3"],
    anplSource: `module words

fn main() -> int {
  return len("Ada")
}
`,
    directTargetSource: `export function main(): number {
  return "Ada".length;
}
`,
    expectedResult: 3,
    entryModule: "words"
  },
  {
    id: "multi-file-order-total",
    title: "Load a multi-file project from a manifest",
    intent:
      "Create pricing.add in one ANPL file and app.main in another file; app imports pricing and returns add(40, 2).",
    expectedBehavior: [
      "compiler discovers both files from anpl.json source globs",
      "app.main returns 42"
    ],
    anplFiles: [
      {
        path: "anpl.json",
        content: `${JSON.stringify(
          {
            name: "order-total",
            entry: "src/app.anpl",
            source: ["src/**/*.anpl"]
          },
          null,
          2
        )}\n`
      },
      {
        path: "src/pricing.anpl",
        content: `module pricing

fn add(a: int, b: int) -> int {
  return a + b
}
`
      },
      {
        path: "src/app.anpl",
        content: `module app

import pricing

fn main() -> int {
  return add(40, 2)
}
`
      }
    ],
    directTargetSource: `export namespace pricing {
  export function add(a: number, b: number): number {
    return a + b;
  }
}

export namespace app {
  export function main(): number {
    return pricing.add(40, 2);
  }
}
`,
    expectedResult: 42,
    entryModule: "app"
  },
  {
    id: "package-qualified-import",
    title: "Resolve a package-qualified dependency import",
    intent:
      "Create a local math module returning 100 and an external mathlib.math module returning a + b; app imports mathlib.math and returns add(2, 3).",
    expectedBehavior: [
      "package-qualified import resolves the dependency module",
      "same-named local module does not shadow mathlib.math",
      "app.main returns 5"
    ],
    anplFiles: [
      {
        path: "anpl.json",
        content: `${JSON.stringify(
          {
            name: "package-import",
            entry: "src/app.anpl",
            source: ["src/**/*.anpl"],
            dependencies: {
              mathlib: {
                path: "/mathlib",
                source: ["lib/**/*.anpl"]
              }
            }
          },
          null,
          2
        )}\n`
      },
      {
        path: "src/app.anpl",
        content: `module app

import mathlib.math

fn main() -> int {
  return add(2, 3)
}
`
      },
      {
        path: "src/math.anpl",
        content: `module math

fn add(a: int, b: int) -> int {
  return 100
}
`
      },
      {
        path: "/mathlib/lib/math.anpl",
        content: `module math

fn add(a: int, b: int) -> int {
  return a + b
}
`
      }
    ],
    directTargetSource: `export namespace math {
  export function add(a: number, b: number): number {
    return 100;
  }
}

export namespace mathlib {
  export namespace math {
    export function add(a: number, b: number): number {
      return a + b;
    }
  }
}

export namespace app {
  export function main(): number {
    return mathlib.math.add(2, 3);
  }
}
`,
    expectedResult: 5,
    entryModule: "app"
  }
]);

export function measureSource(source: string): SourceMetrics {
  const trimmed = source.trim();
  const wordsAndSymbols = trimmed.match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[^\s]/g) ?? [];

  return {
    bytes: new TextEncoder().encode(source).length,
    characters: source.length,
    lines: trimmed.length === 0 ? 0 : trimmed.split(/\r?\n/).length,
    estimatedTokens: wordsAndSymbols.length
  };
}

export function compareAnplToTarget(input: BenchmarkCase): BenchmarkResult {
  const anpl = measureSource(input.anplSource);
  const target = measureSource(input.targetSource);

  return {
    name: input.name,
    anpl,
    target,
    tokenReductionRatio:
      target.estimatedTokens === 0
        ? 0
        : roundRatio((target.estimatedTokens - anpl.estimatedTokens) / target.estimatedTokens)
  };
}

export async function runOfflineBenchmarkSuite(
  tasks: BenchmarkTask[] = defaultBenchmarkTasks,
  options: BenchmarkSuiteOptions = {}
): Promise<BenchmarkSuiteResult> {
  const runs: BenchmarkRun[] = [];

  for (const task of tasks) {
    for (const target of directTargetsForTask(task)) {
      runs.push(runDirectTargetBenchmark(task, target, options));
    }
    runs.push(await runAnplFirstBenchmark(task, options));
  }

  return {
    tasks,
    runs,
    summary: summarizeRuns(tasks, runs)
  };
}

export function benchmarkSuiteToJson(result: BenchmarkSuiteResult): string {
  return JSON.stringify(result, null, 2);
}

export function benchmarkSuiteToText(result: BenchmarkSuiteResult): string {
  const lines = [
    `ANPL offline benchmark`,
    `tasks: ${result.summary.taskCount}`,
    `anpl-first success: ${percent(result.summary.anplFirstSuccessRate)}`,
    `direct fixture success: ${percent(result.summary.directTargetSuccessRate)}`,
    ...Object.entries(result.summary.directTargetSuccessRates)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([language, value]) => `direct-${language} fixture success: ${percent(value)}`),
    `parse success: ${percent(result.summary.anplParseSuccessRate)}`,
    `semantic success: ${percent(result.summary.anplSemanticSuccessRate)}`,
    `build success: ${percent(result.summary.anplBuildSuccessRate)}`,
    `run success: ${percent(result.summary.anplRunSuccessRate)}`,
    `avg source token reduction: ${percent(result.summary.averageSourceTokenReductionRatio)}`,
    `avg diagnostic tokens: ${result.summary.averageDiagnosticTokens.toFixed(2)}`,
    ""
  ];

  for (const task of result.tasks) {
    const anpl = result.runs.find((run) => run.taskId === task.id && run.mode === "anpl-first");
    const direct = result.runs
      .filter((run) => run.taskId === task.id && run.mode.startsWith("direct-"))
      .map((run) => `${run.mode}:${run.success ? "fixture" : "missing"}`)
      .join(",");
    const directTokens = result.runs
      .filter((run) => run.taskId === task.id && run.mode.startsWith("direct-"))
      .map((run) => run.sourceTokens)
      .join(",");
    lines.push(
      `${task.id}: anpl=${anpl?.success ? "pass" : "fail"} direct=${direct} sourceTokens=${anpl?.sourceTokens ?? 0}/${directTokens}`
    );
  }

  return lines.join("\n");
}

function runDirectTargetBenchmark(
  task: BenchmarkTask,
  target: BenchmarkDirectTarget,
  options: BenchmarkSuiteOptions
): BenchmarkRun {
  const start = Date.now();
  const source = target.source;
  const sourceTokens = measureSource(source).estimatedTokens;

  return {
    taskId: task.id,
    mode: directModeForLanguage(target.language),
    targetLanguage: target.language,
    model: options.model,
    promptTokens: measureSource(task.intent).estimatedTokens,
    outputTokens: sourceTokens,
    repairLoops: 0,
    success: source.trim().length > 0,
    diagnostics: [],
    diagnosticTokens: 0,
    sourceTokens,
    generatedTargetTokens: sourceTokens,
    durationMs: Date.now() - start
  };
}

async function runAnplFirstBenchmark(
  task: BenchmarkTask,
  options: BenchmarkSuiteOptions
): Promise<BenchmarkRun> {
  if (task.anplFiles !== undefined) {
    return runAnplProjectBenchmark(task, options);
  }

  const start = Date.now();
  const source = task.anplSource ?? "";
  const diagnostics: Diagnostic[] = [];
  const sourceTokens = measureSource(source).estimatedTokens;
  let parseSuccess = false;
  let semanticSuccess = false;
  let buildSuccess = false;
  let runSuccess = false;
  let generatedTargetTokens = 0;

  const parsed = parseAnpl(source, `${task.id}.anpl`);
  parseSuccess = parsed.ok;
  diagnostics.push(...parsed.diagnostics);

  if (parsed.ok) {
    const semantic = analyzeProgram(parsed.program);
    semanticSuccess = semantic.ok;
    diagnostics.push(...semantic.diagnostics);

    if (semantic.ok) {
      const mir = lowerHirToMir(lowerProgramToHir(parsed.program));
      const js = compileMirProgramToJavaScript(mir);
      generatedTargetTokens = measureSource(js).estimatedTokens;
      buildSuccess = true;

      if (options.executeGeneratedJavaScript ?? true) {
        runSuccess = await executeGeneratedMain(js, task);
      } else {
        runSuccess = true;
      }
    }
  }

  return {
    taskId: task.id,
    mode: "anpl-first",
    model: options.model,
    promptTokens: measureSource(task.intent).estimatedTokens,
    outputTokens: sourceTokens,
    repairLoops: diagnostics.length === 0 ? 0 : 1,
    success: parseSuccess && semanticSuccess && buildSuccess && runSuccess,
    diagnostics,
    parseSuccess,
    semanticSuccess,
    buildSuccess,
    runSuccess,
    diagnosticTokens:
      diagnostics.length === 0 ? 0 : measureSource(JSON.stringify(diagnostics)).estimatedTokens,
    sourceTokens,
    generatedTargetTokens,
    durationMs: Date.now() - start
  };
}

async function runAnplProjectBenchmark(
  task: BenchmarkTask,
  options: BenchmarkSuiteOptions
): Promise<BenchmarkRun> {
  const start = Date.now();
  const projectRoot = projectRootForTask(task);
  const hostFiles = projectFilesForTask(task, projectRoot);
  const source = anplSourceForTask(task);
  const sourceTokens = measureSource(source).estimatedTokens;
  const diagnostics: Diagnostic[] = [];
  let parseSuccess = false;
  let semanticSuccess = false;
  let buildSuccess = false;
  let runSuccess = false;
  let generatedTargetTokens = 0;

  const checkHost = benchmarkCompilerHost({ ...hostFiles });
  const check = await compileProject(
    {
      mode: "check",
      projectRoot
    },
    checkHost
  );
  diagnostics.push(...check.diagnostics);
  parseSuccess = !hasDiagnosticCategory(check.diagnostics, ["lex", "parse"]);
  semanticSuccess = check.ok;

  if (check.ok) {
    const buildHost = benchmarkCompilerHost({ ...hostFiles });
    const build = await compileProject(
      {
        mode: "build",
        projectRoot,
        outDir: "dist"
      },
      buildHost
    );
    diagnostics.push(...build.diagnostics);
    buildSuccess = build.ok;
    generatedTargetTokens = generatedArtifactTokens(build);

    const runHost = benchmarkCompilerHost({ ...hostFiles });
    const run = await compileProject(
      {
        mode: "run",
        projectRoot
      },
      runHost
    );
    diagnostics.push(...run.diagnostics);
    runSuccess = run.ok && runtimeResultMatches(run.value, task.expectedResult);
  }

  const uniqueDiagnostics = dedupeDiagnostics(diagnostics);

  return {
    taskId: task.id,
    mode: "anpl-first",
    model: options.model,
    promptTokens: measureSource(task.intent).estimatedTokens,
    outputTokens: sourceTokens,
    repairLoops: uniqueDiagnostics.length === 0 ? 0 : 1,
    success: parseSuccess && semanticSuccess && buildSuccess && runSuccess,
    diagnostics: uniqueDiagnostics,
    parseSuccess,
    semanticSuccess,
    buildSuccess,
    runSuccess,
    diagnosticTokens:
      uniqueDiagnostics.length === 0
        ? 0
        : measureSource(JSON.stringify(uniqueDiagnostics)).estimatedTokens,
    sourceTokens,
    generatedTargetTokens,
    durationMs: Date.now() - start
  };
}

async function executeGeneratedMain(js: string, task: BenchmarkTask): Promise<boolean> {
  try {
    const module = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(js)}`
    )) as {
      __anpl_modules?: Record<string, Record<string, () => unknown>>;
    };
    const moduleName = task.entryModule ?? moduleNameFromSource(anplSourceForTask(task));
    const functionName = task.entryFunction ?? "main";
    const actual = module.__anpl_modules?.[moduleName]?.[functionName]?.();
    return task.expectedResult === undefined ? actual !== undefined : Object.is(actual, task.expectedResult);
  } catch {
    return false;
  }
}

function projectRootForTask(task: BenchmarkTask): string {
  return `/benchmark/${task.id}`;
}

function projectFilesForTask(task: BenchmarkTask, projectRoot: string): Record<string, string> {
  const files: Record<string, string> = {};

  for (const file of task.anplFiles ?? []) {
    files[absoluteProjectPath(projectRoot, file.path)] = file.content;
  }

  return files;
}

function absoluteProjectPath(projectRoot: string, path: string): string {
  return path.startsWith("/") ? path : `${projectRoot}/${path}`;
}

function anplSourceForTask(task: BenchmarkTask): string {
  if (task.anplSource !== undefined) {
    return task.anplSource;
  }

  return (task.anplFiles ?? [])
    .filter((file) => file.path.endsWith(".anpl"))
    .map((file) => file.content)
    .join("\n");
}

function benchmarkCompilerHost(files: Record<string, string>): CompilerHost {
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

        const [name, ...rest] = filePath.slice(prefix.length).split("/");
        if (name === undefined || name.length === 0) {
          continue;
        }

        children.set(name, rest.length > 0 ? "directory" : "file");
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

function hasDiagnosticCategory(
  diagnostics: Diagnostic[],
  categories: NonNullable<Diagnostic["category"]>[]
): boolean {
  return diagnostics.some((diagnostic) =>
    diagnostic.category === undefined ? false : categories.includes(diagnostic.category)
  );
}

function generatedArtifactTokens(result: CompilerResult): number {
  return result.artifacts
    .filter((artifact) => artifact.kind === "js" || artifact.kind === "ts")
    .reduce((sum, artifact) => sum + measureSource(artifact.content).estimatedTokens, 0);
}

function runtimeResultMatches(value: unknown, expected: unknown): boolean {
  if (!isRecord(value) || value.ok !== true) {
    return false;
  }

  if (expected === undefined) {
    return value.value !== undefined;
  }

  return runtimeValueMatches(value.value, expected);
}

function runtimeValueMatches(value: unknown, expected: unknown): boolean {
  if (isRecord(value) && "value" in value) {
    return Object.is(value.value, expected);
  }

  return Object.is(value, expected);
}

function dedupeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const unique: Diagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.code,
      diagnostic.message,
      diagnostic.file ?? "",
      diagnostic.line ?? "",
      diagnostic.column ?? ""
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(diagnostic);
  }

  return unique;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function summarizeRuns(tasks: BenchmarkTask[], runs: BenchmarkRun[]): BenchmarkSummary {
  const anplRuns = runs.filter((run) => run.mode === "anpl-first");
  const directRuns = runs.filter((run) => run.mode.startsWith("direct-"));
  const reductions = directRuns.map((direct) => {
    const anpl = anplRuns.find((run) => run.taskId === direct.taskId);
    if (anpl === undefined || direct.sourceTokens === 0) {
      return 0;
    }
    return (direct.sourceTokens - anpl.sourceTokens) / direct.sourceTokens;
  });

  return {
    taskCount: tasks.length,
    runCount: runs.length,
    anplFirstSuccessRate: rate(anplRuns, (run) => run.success),
    directTargetSuccessRate: rate(directRuns, (run) => run.success),
    anplParseSuccessRate: rate(anplRuns, (run) => run.parseSuccess === true),
    anplSemanticSuccessRate: rate(anplRuns, (run) => run.semanticSuccess === true),
    anplBuildSuccessRate: rate(anplRuns, (run) => run.buildSuccess === true),
    anplRunSuccessRate: rate(anplRuns, (run) => run.runSuccess === true),
    directTargetSuccessRates: directSuccessRatesByLanguage(directRuns),
    averageSourceTokenReductionRatio: roundRatio(average(reductions)),
    averageDiagnosticTokens: roundRatio(average(anplRuns.map((run) => run.diagnosticTokens))),
    averageRepairLoops: roundRatio(average(runs.map((run) => run.repairLoops)))
  };
}

function withPythonTargets(tasks: BenchmarkTask[]): BenchmarkTask[] {
  return tasks.map((task) => {
    const python = defaultPythonTargets[task.id];
    if (python === undefined) {
      return task;
    }

    return {
      ...task,
      directTargetVariants: [
        ...(task.directTargetVariants ?? []),
        {
          language: "python",
          source: python
        }
      ]
    };
  });
}

function directTargetsForTask(task: BenchmarkTask): BenchmarkDirectTarget[] {
  return [
    ...(task.directTargetSource === undefined
      ? []
      : [
          {
            language: "ts" as const,
            source: task.directTargetSource
          }
        ]),
    ...(task.directTargetVariants ?? [])
  ];
}

function directModeForLanguage(language: BenchmarkTargetLanguage): BenchmarkRun["mode"] {
  switch (language) {
    case "ts":
      return "direct-ts";
    case "python":
      return "direct-python";
  }
}

function directSuccessRatesByLanguage(directRuns: BenchmarkRun[]): Record<string, number> {
  const languages = new Set(
    directRuns
      .map((run) => run.targetLanguage)
      .filter((language): language is BenchmarkTargetLanguage => language !== undefined)
  );

  return Object.fromEntries(
    [...languages].sort().map((language) => [
      language,
      rate(
        directRuns.filter((run) => run.targetLanguage === language),
        (run) => run.success
      )
    ])
  );
}

function rate<T>(items: T[], predicate: (item: T) => boolean): number {
  if (items.length === 0) {
    return 0;
  }
  return roundRatio(items.filter(predicate).length / items.length);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function moduleNameFromSource(source: string): string {
  return source.match(/\bmodule\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? "app";
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function roundRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
