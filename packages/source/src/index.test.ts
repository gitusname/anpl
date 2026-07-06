import { describe, expect, it } from "vitest";
import {
  createSourceFile,
  createSourceMap,
  getSourceFile,
  lineText,
  offsetAt,
  positionAt,
  positionInSourceMap,
  spanFromOffsets,
  spanInSourceMap
} from "./index.js";

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
    expect(offsetAt(file, { line: 2, column: 4 })).toBe(14);
  });

  it("maps files, positions, spans, and line text through a source map", () => {
    const main = createSourceFile("src/main.anpl", "module app\r\nfn main() -> int\n");
    const lib = createSourceFile("src/lib.anpl", "module lib\n");
    const sourceMap = createSourceMap([main, lib]);

    expect(getSourceFile(sourceMap, main.id)).toBe(main);
    expect(getSourceFile(sourceMap, "src/lib.anpl")).toBe(lib);
    expect(positionInSourceMap(sourceMap, "src/main.anpl", 12)).toEqual({
      offset: 12,
      line: 2,
      column: 1
    });
    expect(spanInSourceMap(sourceMap, "src/main.anpl", 12, 14)).toEqual({
      file: "src/main.anpl",
      start: {
        offset: 12,
        line: 2,
        column: 1
      },
      end: {
        offset: 14,
        line: 2,
        column: 3
      }
    });
    expect(lineText(main, 1)).toBe("module app");
    expect(lineText(main, 2)).toBe("fn main() -> int");
    expect(lineText(main, 99)).toBe("");
  });

  it("clamps source positions and spans to valid file ranges", () => {
    const file = createSourceFile("main.anpl", "abc\n");

    expect(positionAt(file, 99)).toEqual({
      offset: 4,
      line: 2,
      column: 1
    });
    expect(offsetAt(file, { line: 99, column: 99 })).toBe(4);
    expect(spanFromOffsets(file, -10, 99)).toEqual({
      file: "main.anpl",
      start: {
        offset: 0,
        line: 1,
        column: 1
      },
      end: {
        offset: 4,
        line: 2,
        column: 1
      }
    });
  });
});
