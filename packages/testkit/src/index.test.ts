import { describe, expect, it } from "vitest";
import { parseAndAnalyze } from "./index.js";

describe("testkit", () => {
  it("parses and analyzes a valid program", () => {
    expect(
      parseAndAnalyze(`module math

fn main() -> int {
  return 1
}`).ok
    ).toBe(true);
  });
});
