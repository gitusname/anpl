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

function roundRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
