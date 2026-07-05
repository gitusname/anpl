import type { Position, SourceFile as CoreSourceFile } from "@anpl/core";

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
    files: new Map(files.map((file) => [file.id, file]))
  };
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

export function hashSource(content: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
