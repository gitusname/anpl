export type DiagnosticSeverity = "info" | "warning" | "error";

export type DiagnosticConfidence = "low" | "medium" | "high";

export type SourceLocation = {
  file?: string;
  line?: number;
  column?: number;
};

export type Diagnostic = SourceLocation & {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  cause?: string;
  fix?: string;
  evidence?: string[];
  confidence?: DiagnosticConfidence;
};

export type GeneratedFile = {
  path: string;
  content: string;
};
