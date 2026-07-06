import { describe, expect, it } from "vitest";
import {
  benchmarkSuiteToJson,
  benchmarkSuiteToText,
  compareAnplToTarget,
  defaultBenchmarkTasks,
  measureSource,
  runOfflineBenchmarkSuite
} from "./index.js";

describe("ANPL benchmark metrics", () => {
  it("measures compact source metrics", () => {
    const metrics = measureSource(`module math

fn add(a: int, b: int) -> int {
  return a + b
}`);

    expect(metrics.lines).toBe(5);
    expect(metrics.estimatedTokens).toBeGreaterThan(0);
  });

  it("compares ANPL with generated target source", () => {
    const result = compareAnplToTarget({
      name: "math.add",
      anplSource: "fn add(a: int, b: int) -> int { return a + b }",
      targetSource: "export function add(a: number, b: number): number { return a + b; }"
    });

    expect(result.name).toBe("math.add");
    expect(result.tokenReductionRatio).toBeGreaterThanOrEqual(0);
  });

  it("runs the default offline benchmark suite", async () => {
    const result = await runOfflineBenchmarkSuite();

    expect(result.summary.taskCount).toBe(defaultBenchmarkTasks.length);
    expect(result.summary.anplFirstSuccessRate).toBe(1);
    expect(result.summary.anplParseSuccessRate).toBe(1);
    expect(result.summary.anplSemanticSuccessRate).toBe(1);
    expect(result.summary.anplBuildSuccessRate).toBe(1);
    expect(result.summary.anplRunSuccessRate).toBe(1);
    expect(result.summary.directTargetSuccessRates).toMatchObject({
      python: 1,
      ts: 1
    });
    expect(result.runs).toHaveLength(defaultBenchmarkTasks.length * 3);
    expect(result.runs.map((run) => run.mode)).toEqual(
      expect.arrayContaining(["direct-ts", "direct-python", "anpl-first"])
    );
    expect(
      result.runs.find(
        (run) => run.taskId === "multi-file-order-total" && run.mode === "anpl-first"
      )
    ).toMatchObject({
      success: true,
      parseSuccess: true,
      semanticSuccess: true,
      buildSuccess: true,
      runSuccess: true
    });
    expect(
      result.runs.find(
        (run) => run.taskId === "package-qualified-import" && run.mode === "anpl-first"
      )
    ).toMatchObject({
      success: true,
      parseSuccess: true,
      semanticSuccess: true,
      buildSuccess: true,
      runSuccess: true
    });
  });

  it("serializes benchmark results for CLI output", async () => {
    const result = await runOfflineBenchmarkSuite([defaultBenchmarkTasks[0]!]);
    const json = benchmarkSuiteToJson(result);
    const text = benchmarkSuiteToText(result);

    expect(JSON.parse(json)).toMatchObject({
      summary: {
        taskCount: 1,
        anplFirstSuccessRate: 1,
        directTargetSuccessRates: {
          python: 1,
          ts: 1
        }
      }
    });
    expect(text).toContain("ANPL offline benchmark");
    expect(text).toContain("direct-python fixture success");
    expect(text).toContain("math-add");
  });
});
