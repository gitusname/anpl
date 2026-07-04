import type { Diagnostic } from "@anpl/core";

export function diagnosticsToJson(diagnostics: Diagnostic[]): string {
  return JSON.stringify(diagnostics, null, 2);
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const location =
    diagnostic.file !== undefined
      ? `${diagnostic.file}:${diagnostic.line ?? 1}:${diagnostic.column ?? 1}`
      : "ANPL";
  const details = [
    diagnostic.expected ? `expected=${diagnostic.expected}` : undefined,
    diagnostic.received ? `received=${diagnostic.received}` : undefined,
    diagnostic.fix ? `fix=${diagnostic.fix}` : undefined
  ]
    .filter(Boolean)
    .join(" ");

  return `${location} ${diagnostic.severity.toUpperCase()} ${diagnostic.code}: ${
    diagnostic.message
  }${details ? ` (${details})` : ""}`;
}

export function formatDiagnostics(diagnostics: Diagnostic[]): string {
  return diagnostics.map(formatDiagnostic).join("\n");
}
