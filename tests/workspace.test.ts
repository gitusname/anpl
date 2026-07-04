import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packages = [
  "core",
  "parser",
  "validator",
  "normalizer",
  "generator-prisma",
  "cli"
];

describe("workspace", () => {
  it.each(packages)("contains the %s package", (packageName) => {
    const packageDir = join(process.cwd(), "packages", packageName);

    expect(existsSync(join(packageDir, "package.json"))).toBe(true);
    expect(existsSync(join(packageDir, "tsconfig.json"))).toBe(true);
    expect(existsSync(join(packageDir, "src", "index.ts"))).toBe(true);
  });
});
