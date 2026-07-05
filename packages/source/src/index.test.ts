import { describe, expect, it } from "vitest";
import { createSourceFile, positionAt } from "./index.js";

describe("source files", () => {
  it("computes line starts, hashes, and positions", () => {
    const file = createSourceFile("src/main.anpl", "module app\nfn main() -> int");

    expect(file.id).toBe("src/main.anpl");
    expect(file.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(file.lineStarts).toEqual([0, 11]);
    expect(positionAt(file, 11)).toEqual({
      offset: 11,
      line: 2,
      column: 1
    });
  });
});
