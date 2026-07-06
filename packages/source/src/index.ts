import type { Position, SourceFile as CoreSourceFile, Span } from "@anpl/core";

export type SourceFileId = string & { readonly __brand: "SourceFileId" };

export type ProductionSourceFile = {
  id: SourceFileId;
  path: string;
  content: string;
  hash: string;
  lineStarts: number[];
};

export type SourceMap = {
  files: Map<SourceFileId, ProductionSourceFile>;
  filesByPath: Map<string, ProductionSourceFile>;
};

export function createSourceFile(path: string, content: string): ProductionSourceFile {
  return {
    id: path as SourceFileId,
    path,
    content,
    hash: hashSource(content),
    lineStarts: computeLineStarts(content)
  };
}

export function fromCoreSourceFile(source: CoreSourceFile): ProductionSourceFile {
  return createSourceFile(source.path ?? "<memory>", source.content);
}

export function createSourceMap(files: ProductionSourceFile[]): SourceMap {
  return {
    files: new Map(files.map((file) => [file.id, file])),
    filesByPath: new Map(files.map((file) => [file.path, file]))
  };
}

export function getSourceFile(
  sourceMap: SourceMap,
  idOrPath: SourceFileId | string
): ProductionSourceFile | undefined {
  return sourceMap.files.get(idOrPath as SourceFileId) ?? sourceMap.filesByPath.get(idOrPath);
}

export function computeLineStarts(content: string): number[] {
  const lineStarts = [0];

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }

  return lineStarts;
}

export function positionAt(file: ProductionSourceFile, offset: number): Position {
  const clampedOffset = Math.max(0, Math.min(offset, file.content.length));
  let low = 0;
  let high = file.lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const lineStart = file.lineStarts[mid] ?? 0;

    if (lineStart <= clampedOffset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const lineIndex = Math.max(0, high);
  const lineStart = file.lineStarts[lineIndex] ?? 0;

  return {
    offset: clampedOffset,
    line: lineIndex + 1,
    column: clampedOffset - lineStart + 1
  };
}

export function offsetAt(
  file: ProductionSourceFile,
  position: Pick<Position, "line" | "column">
): number {
  const lineIndex = Math.max(0, Math.min(position.line - 1, file.lineStarts.length - 1));
  const lineStart = file.lineStarts[lineIndex] ?? 0;
  const nextLineStart = file.lineStarts[lineIndex + 1] ?? file.content.length + 1;
  const lineEnd = Math.max(lineStart, nextLineStart - 1);
  const requested = lineStart + Math.max(0, position.column - 1);

  return Math.max(lineStart, Math.min(requested, lineEnd));
}

export function spanFromOffsets(file: ProductionSourceFile, start: number, end: number): Span {
  const safeStart = Math.max(0, Math.min(start, file.content.length));
  const safeEnd = Math.max(safeStart, Math.min(end, file.content.length));

  return {
    file: file.path,
    start: positionAt(file, safeStart),
    end: positionAt(file, safeEnd)
  };
}

export function positionInSourceMap(
  sourceMap: SourceMap,
  idOrPath: SourceFileId | string,
  offset: number
): Position | undefined {
  const file = getSourceFile(sourceMap, idOrPath);
  return file === undefined ? undefined : positionAt(file, offset);
}

export function spanInSourceMap(
  sourceMap: SourceMap,
  idOrPath: SourceFileId | string,
  start: number,
  end: number
): Span | undefined {
  const file = getSourceFile(sourceMap, idOrPath);
  return file === undefined ? undefined : spanFromOffsets(file, start, end);
}

export function lineText(file: ProductionSourceFile, line: number): string {
  const lineIndex = line - 1;
  const lineStart = file.lineStarts[lineIndex];
  if (lineStart === undefined) {
    return "";
  }

  const nextLineStart = file.lineStarts[lineIndex + 1] ?? file.content.length + 1;
  const lineEnd = Math.max(lineStart, nextLineStart - 1);
  return file.content.slice(lineStart, lineEnd).replace(/\r$/, "");
}

export function hashSource(content: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
