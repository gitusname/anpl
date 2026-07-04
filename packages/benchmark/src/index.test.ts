import { describe, expect, it } from "vitest";
import { compareAnplToTarget, measureSource } from "./index.js";

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
});
