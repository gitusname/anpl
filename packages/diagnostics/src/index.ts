import type { Diagnostic } from "@anpl/core";

export type DiagnosticCategory =
  | "lex"
  | "parse"
  | "semantic"
  | "type"
  | "ir"
  | "runtime"
  | "backend"
  | "project"
  | "tooling";

export type DiagnosticDefinition = {
  code: string;
  category: DiagnosticCategory;
  severity: Diagnostic["severity"];
  messageTemplate: string;
  aiRepairable: boolean;
};

export const diagnosticRegistry = {
  ANPL_LEX_INVALID_CHAR: {
    code: "ANPL_LEX_INVALID_CHAR",
    category: "lex",
    severity: "error",
    messageTemplate: "Unexpected character '{character}'.",
    aiRepairable: true
  },
  ANPL_PARSE_UNEXPECTED_TOKEN: {
    code: "ANPL_PARSE_UNEXPECTED_TOKEN",
    category: "parse",
    severity: "error",
    messageTemplate: "Unexpected token '{token}'.",
    aiRepairable: true
  },
  ANPL_SEMANTIC_UNKNOWN_SYMBOL: {
    code: "ANPL_SEMANTIC_UNKNOWN_SYMBOL",
    category: "semantic",
    severity: "error",
    messageTemplate: "Symbol '{symbol}' is not defined.",
    aiRepairable: true
  },
  ANPL_TYPE_MISMATCH: {
    code: "ANPL_TYPE_MISMATCH",
    category: "type",
    severity: "error",
    messageTemplate: "Expected {expected} but received {received}.",
    aiRepairable: true
  },
  ANPL_RETURN_TYPE_MISMATCH: {
    code: "ANPL_RETURN_TYPE_MISMATCH",
    category: "type",
    severity: "error",
    messageTemplate: "Return type mismatch: expected {expected} but received {received}.",
    aiRepairable: true
  },
  ANPL_CALL_ARG_COUNT_MISMATCH: {
    code: "ANPL_CALL_ARG_COUNT_MISMATCH",
    category: "semantic",
    severity: "error",
    messageTemplate: "Function expected {expected} arguments but received {received}.",
    aiRepairable: true
  },
  ANPL_FIELD_NOT_FOUND: {
    code: "ANPL_FIELD_NOT_FOUND",
    category: "semantic",
    severity: "error",
    messageTemplate: "Field '{symbol}' was not found.",
    aiRepairable: true
  },
  ANPL_RUNTIME_ERROR: {
    code: "ANPL_RUNTIME_ERROR",
    category: "runtime",
    severity: "error",
    messageTemplate: "{message}",
    aiRepairable: true
  },
  ANPL_UNSUPPORTED_TARGET: {
    code: "ANPL_UNSUPPORTED_TARGET",
    category: "backend",
    severity: "error",
    messageTemplate: "Unsupported target '{target}'.",
    aiRepairable: false
  }
} as const satisfies Record<string, DiagnosticDefinition>;

export function getDiagnosticDefinition(code: string): DiagnosticDefinition | undefined {
  return diagnosticRegistry[code as keyof typeof diagnosticRegistry];
}

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
