import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatProgram } from "@anpl/formatter";
import { parseAnpl } from "@anpl/parser";

const fixtureRoot = "tests/conformance/valid";
const validFixtures = ["math.anpl", "records.anpl", "imports.anpl", "enums.anpl"];

describe("formatter conformance", () => {
  for (const fixture of validFixtures) {
    it(`formats ${fixture} idempotently`, () => {
      const file = join(fixtureRoot, fixture);
      const parsed = parseAnpl(readFileSync(file, "utf8"), file);

      expect(parsed.ok).toBe(true);
      if (!parsed.ok) {
        return;
      }

      const once = formatProgram(parsed.program);
      const reparsed = parseAnpl(once, file);

      expect(reparsed.ok).toBe(true);
      if (!reparsed.ok) {
        return;
      }

      const twice = formatProgram(reparsed.program);
      expect(twice).toBe(once);
    });
  }
});
