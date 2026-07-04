export type Position = {
  offset: number;
  line: number;
  column: number;
};

export type Span = {
  file?: string;
  start: Position;
  end: Position;
};

export type SourceFile = {
  path?: string;
  content: string;
};

export type Result<T, E = Diagnostic[]> =
  | {
      ok: true;
      value: T;
      diagnostics?: Diagnostic[];
    }
  | {
      ok: false;
      error?: E;
      diagnostics: Diagnostic[];
    };

export type DiagnosticSeverity = "info" | "warning" | "error";

export type DiagnosticConfidence = "low" | "medium" | "high";

export type SourceLocation = {
  file?: string;
  line?: number;
  column?: number;
  span?: Span;
};

export type Diagnostic = SourceLocation & {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  symbol?: string;
  expected?: string;
  received?: string;
  cause?: string;
  fix?: string;
  evidence?: string[];
  confidence: DiagnosticConfidence;
};

export function createSpan(
  file: string | undefined,
  start: Position,
  end: Position
): Span {
  return {
    file,
    start,
    end
  };
}

export function createDiagnostic(input: Diagnostic): Diagnostic {
  return input;
}

export type GeneratedFile = {
  path: string;
  content: string;
};
