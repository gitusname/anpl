import type { Diagnostic } from "@anpl/core";
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
  directTargetSource?: string;
  expectedResult?: unknown;
  entryModule?: string;
  entryFunction?: string;
};

export type BenchmarkRun = {
  taskId: string;
  mode: "direct-ts" | "anpl-first";
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
  averageSourceTokenReductionRatio: number;
  averageDiagnosticTokens: number;
  averageRepairLoops: number;
};

export type BenchmarkSuiteOptions = {
  model?: string;
  executeGeneratedJavaScript?: boolean;
};

export const defaultBenchmarkTasks: BenchmarkTask[] = [
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
  }
];

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
    runs.push(runDirectTargetBenchmark(task, options));
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
    `direct-ts fixture success: ${percent(result.summary.directTargetSuccessRate)}`,
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
    const direct = result.runs.find((run) => run.taskId === task.id && run.mode === "direct-ts");
    lines.push(
      `${task.id}: anpl=${anpl?.success ? "pass" : "fail"} direct=${direct?.success ? "fixture" : "missing"} sourceTokens=${anpl?.sourceTokens ?? 0}/${direct?.sourceTokens ?? 0}`
    );
  }

  return lines.join("\n");
}

function runDirectTargetBenchmark(
  task: BenchmarkTask,
  options: BenchmarkSuiteOptions
): BenchmarkRun {
  const start = Date.now();
  const source = task.directTargetSource ?? "";
  const sourceTokens = measureSource(source).estimatedTokens;

  return {
    taskId: task.id,
    mode: "direct-ts",
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

async function executeGeneratedMain(js: string, task: BenchmarkTask): Promise<boolean> {
  try {
    const module = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(js)}`
    )) as {
      __anpl_modules?: Record<string, Record<string, () => unknown>>;
    };
    const moduleName = task.entryModule ?? moduleNameFromSource(task.anplSource ?? "");
    const functionName = task.entryFunction ?? "main";
    const actual = module.__anpl_modules?.[moduleName]?.[functionName]?.();
    return task.expectedResult === undefined ? actual !== undefined : Object.is(actual, task.expectedResult);
  } catch {
    return false;
  }
}

function summarizeRuns(tasks: BenchmarkTask[], runs: BenchmarkRun[]): BenchmarkSummary {
  const anplRuns = runs.filter((run) => run.mode === "anpl-first");
  const directRuns = runs.filter((run) => run.mode === "direct-ts");
  const reductions = tasks.map((task) => {
    const anpl = anplRuns.find((run) => run.taskId === task.id);
    const direct = directRuns.find((run) => run.taskId === task.id);
    if (anpl === undefined || direct === undefined || direct.sourceTokens === 0) {
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
    averageSourceTokenReductionRatio: roundRatio(average(reductions)),
    averageDiagnosticTokens: roundRatio(average(anplRuns.map((run) => run.diagnosticTokens))),
    averageRepairLoops: roundRatio(average(runs.map((run) => run.repairLoops)))
  };
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
