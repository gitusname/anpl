import type { Diagnostic, DiagnosticCategory } from "@anpl/core";

export type DiagnosticDefinition = {
  code: string;
  category: DiagnosticCategory;
  severity: Diagnostic["severity"];
  messageTemplate: string;
  causeTemplate?: string;
  fixTemplate?: string;
  aiRepairable: boolean;
};

export type DiagnosticExplanation = DiagnosticDefinition & {
  summary: string;
};

export const diagnosticRegistry = {
  ANPL_LEX_INVALID_CHAR: {
    code: "ANPL_LEX_INVALID_CHAR",
    category: "lex",
    severity: "error",
    messageTemplate: "Unexpected character '{character}'.",
    causeTemplate: "The lexer found a character that is not part of ANPL v0.1 syntax.",
    fixTemplate: "Remove the character or replace it with a valid ANPL token.",
    aiRepairable: true
  },
  ANPL_PARSE_UNEXPECTED_TOKEN: {
    code: "ANPL_PARSE_UNEXPECTED_TOKEN",
    category: "parse",
    severity: "error",
    messageTemplate: "Unexpected token '{token}'.",
    causeTemplate: "The parser could not match the token stream to the ANPL grammar.",
    fixTemplate: "Use the expected grammar shape near the reported location.",
    aiRepairable: true
  },
  ANPL_SEMANTIC_UNKNOWN_SYMBOL: {
    code: "ANPL_SEMANTIC_UNKNOWN_SYMBOL",
    category: "semantic",
    severity: "error",
    messageTemplate: "Symbol '{symbol}' is not defined.",
    causeTemplate: "The referenced symbol is not visible in the current module scope.",
    fixTemplate: "Declare the symbol, import its module, or correct the symbol name.",
    aiRepairable: true
  },
  ANPL_SEMANTIC_UNKNOWN_MODULE: {
    code: "ANPL_SEMANTIC_UNKNOWN_MODULE",
    category: "semantic",
    severity: "error",
    messageTemplate: "Module '{symbol}' is not defined.",
    causeTemplate: "The imported module is not present in the semantic module table.",
    fixTemplate: "Add the missing module source file or correct the import name.",
    aiRepairable: true
  },
  ANPL_SEMANTIC_DUPLICATE_SYMBOL: {
    code: "ANPL_SEMANTIC_DUPLICATE_SYMBOL",
    category: "semantic",
    severity: "error",
    messageTemplate: "Symbol '{symbol}' is already defined.",
    causeTemplate: "A scope contains more than one declaration with the same name.",
    fixTemplate: "Rename one declaration or remove the duplicate declaration.",
    aiRepairable: true
  },
  ANPL_SEMANTIC_IMPORT_SELF: {
    code: "ANPL_SEMANTIC_IMPORT_SELF",
    category: "semantic",
    severity: "error",
    messageTemplate: "Module '{symbol}' cannot import itself.",
    causeTemplate: "A module import points back to the declaring module.",
    fixTemplate: "Remove the self-import from the module.",
    aiRepairable: true
  },
  ANPL_SEMANTIC_IMPORT_CONFLICT: {
    code: "ANPL_SEMANTIC_IMPORT_CONFLICT",
    category: "semantic",
    severity: "error",
    messageTemplate: "Imported symbol '{symbol}' conflicts with an existing symbol.",
    causeTemplate: "An imported declaration would shadow or collide with an already visible symbol.",
    fixTemplate: "Rename one symbol or import a narrower symbol set.",
    aiRepairable: true
  },
  ANPL_TYPE_MISMATCH: {
    code: "ANPL_TYPE_MISMATCH",
    category: "type",
    severity: "error",
    messageTemplate: "Expected {expected} but received {received}.",
    causeTemplate: "A value was used where a different ANPL type is required.",
    fixTemplate: "Change the expression type or update the declaration/signature.",
    aiRepairable: true
  },
  ANPL_RETURN_TYPE_MISMATCH: {
    code: "ANPL_RETURN_TYPE_MISMATCH",
    category: "type",
    severity: "error",
    messageTemplate: "Return type mismatch: expected {expected} but received {received}.",
    causeTemplate: "The returned expression does not match the function return type.",
    fixTemplate: "Return a value of the declared type or change the function return type.",
    aiRepairable: true
  },
  ANPL_RETURN_MISSING: {
    code: "ANPL_RETURN_MISSING",
    category: "semantic",
    severity: "error",
    messageTemplate: "Function '{symbol}' must return {expected}.",
    causeTemplate: "A non-void function can reach the end without returning a value.",
    fixTemplate: "Add a return statement on every control-flow path or change the return type to void.",
    aiRepairable: true
  },
  ANPL_CALL_ARG_COUNT_MISMATCH: {
    code: "ANPL_CALL_ARG_COUNT_MISMATCH",
    category: "semantic",
    severity: "error",
    messageTemplate: "Function expected {expected} arguments but received {received}.",
    causeTemplate: "A function call uses a different number of arguments than its signature.",
    fixTemplate: "Add missing arguments, remove extra arguments, or update the function signature.",
    aiRepairable: true
  },
  ANPL_FIELD_NOT_FOUND: {
    code: "ANPL_FIELD_NOT_FOUND",
    category: "semantic",
    severity: "error",
    messageTemplate: "Field '{symbol}' was not found.",
    causeTemplate: "A record construction or member access references a field that is not declared.",
    fixTemplate: "Use an existing field name or add the field to the record type.",
    aiRepairable: true
  },
  ANPL_ENUM_EMPTY: {
    code: "ANPL_ENUM_EMPTY",
    category: "type",
    severity: "error",
    messageTemplate: "Enum type must declare at least one variant.",
    causeTemplate: "Enum type references require at least one variant.",
    fixTemplate: "Add one or more enum variants, for example enum[active, archived].",
    aiRepairable: true
  },
  ANPL_RUNTIME_ERROR: {
    code: "ANPL_RUNTIME_ERROR",
    category: "runtime",
    severity: "error",
    messageTemplate: "{message}",
    causeTemplate: "The program failed during runtime execution.",
    fixTemplate: "Inspect the runtime symbol, stack, and evidence to repair the failing expression.",
    aiRepairable: true
  },
  ANPL_UNSUPPORTED_TARGET: {
    code: "ANPL_UNSUPPORTED_TARGET",
    category: "backend",
    severity: "error",
    messageTemplate: "Unsupported target '{target}'.",
    causeTemplate: "The selected backend target is not implemented by this ANPL toolchain.",
    fixTemplate: "Use a supported target such as 'js'.",
    aiRepairable: false
  },
  ANPL_PROJECT_NO_SOURCES: {
    code: "ANPL_PROJECT_NO_SOURCES",
    category: "project",
    severity: "error",
    messageTemplate: "Project did not resolve any ANPL source files.",
    causeTemplate: "The manifest entry/source patterns did not point to readable .anpl files.",
    fixTemplate: "Check anpl.json entry/source patterns or pass a valid file path.",
    aiRepairable: true
  },
  ANPL_PROJECT_INVALID_MANIFEST: {
    code: "ANPL_PROJECT_INVALID_MANIFEST",
    category: "project",
    severity: "error",
    messageTemplate: "Invalid ANPL manifest.",
    causeTemplate: "The anpl.json manifest is missing required shape or contains invalid JSON/schema values.",
    fixTemplate: "Fix anpl.json so it matches the ANPL manifest schema.",
    aiRepairable: true
  },
  ANPL_PROJECT_ENTRY_NOT_FOUND: {
    code: "ANPL_PROJECT_ENTRY_NOT_FOUND",
    category: "project",
    severity: "error",
    messageTemplate: "Project entry '{symbol}' was not found.",
    causeTemplate: "The project entry path does not resolve to a readable ANPL source file.",
    fixTemplate: "Create the entry file, update anpl.json, or pass a valid entry path.",
    aiRepairable: true
  },
  ANPL_PROJECT_SOURCE_NOT_FOUND: {
    code: "ANPL_PROJECT_SOURCE_NOT_FOUND",
    category: "project",
    severity: "error",
    messageTemplate: "Source file '{symbol}' from anpl.json was not found.",
    causeTemplate: "The manifest source list references a file that is not present in the project.",
    fixTemplate: "Create the file or remove the stale source path from anpl.json.",
    aiRepairable: true
  },
  ANPL_PROJECT_SOURCE_PATTERN_UNREADABLE: {
    code: "ANPL_PROJECT_SOURCE_PATTERN_UNREADABLE",
    category: "project",
    severity: "error",
    messageTemplate: "Source pattern '{symbol}' could not be read.",
    causeTemplate: "The project loader could not enumerate a manifest source pattern.",
    fixTemplate: "Create the pattern base directory, fix the source glob, or use a host with readDir support.",
    aiRepairable: true
  },
  ANPL_PROJECT_SOURCE_READ_ERROR: {
    code: "ANPL_PROJECT_SOURCE_READ_ERROR",
    category: "project",
    severity: "error",
    messageTemplate: "Could not read ANPL source file '{symbol}'.",
    causeTemplate: "A resolved source path could not be read by the compiler host.",
    fixTemplate: "Make the file readable or remove it from the manifest source patterns.",
    aiRepairable: true
  },
  ANPL_PROJECT_UNKNOWN_MODULE: {
    code: "ANPL_PROJECT_UNKNOWN_MODULE",
    category: "project",
    severity: "error",
    messageTemplate: "Imported module '{symbol}' was not found in the project graph.",
    causeTemplate: "A module import refers to a module that is not present in resolved project sources.",
    fixTemplate: "Add the missing module source file or correct the import name.",
    aiRepairable: true
  },
  ANPL_PROJECT_DUPLICATE_MODULE: {
    code: "ANPL_PROJECT_DUPLICATE_MODULE",
    category: "project",
    severity: "error",
    messageTemplate: "Module '{symbol}' is already defined in the project graph.",
    causeTemplate: "Two or more resolved source files declare the same module.",
    fixTemplate: "Rename one module or remove the duplicate source from the project manifest.",
    aiRepairable: true
  },
  ANPL_PROJECT_INIT_EXISTS: {
    code: "ANPL_PROJECT_INIT_EXISTS",
    category: "project",
    severity: "error",
    messageTemplate: "Project file '{file}' already exists.",
    causeTemplate: "Project initialization would overwrite an existing file.",
    fixTemplate: "Choose an empty directory or pass --force to overwrite generated project files.",
    aiRepairable: true
  },
  ANPL_PROJECT_INIT_HOST_READONLY: {
    code: "ANPL_PROJECT_INIT_HOST_READONLY",
    category: "project",
    severity: "error",
    messageTemplate: "Project host does not support writing files.",
    causeTemplate: "The compiler host is read-only for project initialization.",
    fixTemplate: "Use a compiler host that implements writeFile.",
    aiRepairable: false
  },
  ANPL_COMPILER_ERROR: {
    code: "ANPL_COMPILER_ERROR",
    category: "tooling",
    severity: "error",
    messageTemplate: "{message}",
    causeTemplate: "The compiler facade encountered an unexpected toolchain error.",
    fixTemplate: "Inspect the message and reduce the input to a reproducible compiler issue.",
    aiRepairable: false
  }
} as const satisfies Record<string, DiagnosticDefinition>;

export function getDiagnosticDefinition(code: string): DiagnosticDefinition | undefined {
  return diagnosticRegistry[code as keyof typeof diagnosticRegistry];
}

export function diagnosticsToJson(diagnostics: Diagnostic[]): string {
  return JSON.stringify(diagnostics.map(enrichDiagnostic), null, 2);
}

export function enrichDiagnostic(diagnostic: Diagnostic): Diagnostic {
  const definition = getDiagnosticDefinition(diagnostic.code);
  if (definition === undefined) {
    return diagnostic;
  }

  return {
    ...diagnostic,
    category: diagnostic.category ?? definition.category,
    cause: diagnostic.cause ?? interpolate(definition.causeTemplate, diagnostic),
    fix: diagnostic.fix ?? interpolate(definition.fixTemplate, diagnostic)
  };
}

export function explainDiagnosticCode(code: string): DiagnosticExplanation | undefined {
  const definition = getDiagnosticDefinition(code);
  if (definition === undefined) {
    return undefined;
  }

  return {
    ...definition,
    summary: `${definition.code} is a ${definition.category} diagnostic. ${
      definition.aiRepairable
        ? "It is intended to be repairable by AI coding tools."
        : "It is not normally repairable from source text alone."
    }`
  };
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const enriched = enrichDiagnostic(diagnostic);
  const location =
    enriched.file !== undefined
      ? `${enriched.file}:${enriched.line ?? 1}:${enriched.column ?? 1}`
      : "ANPL";
  const details = [
    enriched.category ? `category=${enriched.category}` : undefined,
    enriched.expected ? `expected=${enriched.expected}` : undefined,
    enriched.received ? `received=${enriched.received}` : undefined,
    enriched.fix ? `fix=${enriched.fix}` : undefined
  ]
    .filter(Boolean)
    .join(" ");

  return `${location} ${enriched.severity.toUpperCase()} ${enriched.code}: ${
    enriched.message
  }${details ? ` (${details})` : ""}`;
}

export function formatDiagnostics(diagnostics: Diagnostic[]): string {
  return diagnostics.map(formatDiagnostic).join("\n");
}

function interpolate(
  template: string | undefined,
  diagnostic: Diagnostic
): string | undefined {
  if (template === undefined) {
    return undefined;
  }

  return template.replace(/\{(\w+)\}/g, (_, key: keyof Diagnostic) => {
    const value = diagnostic[key];
    return value === undefined || typeof value === "object" ? `{${String(key)}}` : String(value);
  });
}
