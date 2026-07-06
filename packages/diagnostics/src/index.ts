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
  ANPL_PARSE_EXPECTED_IDENTIFIER: {
    code: "ANPL_PARSE_EXPECTED_IDENTIFIER",
    category: "parse",
    severity: "error",
    messageTemplate: "Expected identifier.",
    causeTemplate: "The parser expected an ANPL identifier at this location.",
    fixTemplate: "Insert or replace the token with a valid ANPL identifier.",
    aiRepairable: true
  },
  ANPL_PARSE_EXPECTED_TYPE: {
    code: "ANPL_PARSE_EXPECTED_TYPE",
    category: "parse",
    severity: "error",
    messageTemplate: "Expected type name.",
    causeTemplate: "The parser expected a primitive, declared, or enum type reference.",
    fixTemplate: "Insert a valid ANPL type name.",
    aiRepairable: true
  },
  ANPL_PARSE_EXPECTED_COLON: {
    code: "ANPL_PARSE_EXPECTED_COLON",
    category: "parse",
    severity: "error",
    messageTemplate: "Expected ':'.",
    causeTemplate: "The parser expected a colon separator.",
    fixTemplate: "Insert ':' at the reported location.",
    aiRepairable: true
  },
  ANPL_PARSE_EXPECTED_LBRACE: {
    code: "ANPL_PARSE_EXPECTED_LBRACE",
    category: "parse",
    severity: "error",
    messageTemplate: "Expected '{'.",
    causeTemplate: "The parser expected the start of a block, type body, or record body.",
    fixTemplate: "Insert '{' at the reported location.",
    aiRepairable: true
  },
  ANPL_PARSE_EXPECTED_RBRACE: {
    code: "ANPL_PARSE_EXPECTED_RBRACE",
    category: "parse",
    severity: "error",
    messageTemplate: "Expected '}'.",
    causeTemplate: "The parser expected the end of a block, type body, or record body.",
    fixTemplate: "Insert '}' at the reported location.",
    aiRepairable: true
  },
  ANPL_PARSE_EXPECTED_LPAREN: {
    code: "ANPL_PARSE_EXPECTED_LPAREN",
    category: "parse",
    severity: "error",
    messageTemplate: "Expected '('.",
    causeTemplate: "The parser expected an opening parenthesis.",
    fixTemplate: "Insert '(' at the reported location.",
    aiRepairable: true
  },
  ANPL_PARSE_EXPECTED_RPAREN: {
    code: "ANPL_PARSE_EXPECTED_RPAREN",
    category: "parse",
    severity: "error",
    messageTemplate: "Expected ')'.",
    causeTemplate: "The parser expected a closing parenthesis.",
    fixTemplate: "Insert ')' at the reported location.",
    aiRepairable: true
  },
  ANPL_PARSE_EXPECTED_ARROW: {
    code: "ANPL_PARSE_EXPECTED_ARROW",
    category: "parse",
    severity: "error",
    messageTemplate: "Expected '->'.",
    causeTemplate: "The parser expected a function return type arrow.",
    fixTemplate: "Insert '->' before the return type.",
    aiRepairable: true
  },
  ANPL_PARSE_EXPECTED_EQUAL: {
    code: "ANPL_PARSE_EXPECTED_EQUAL",
    category: "parse",
    severity: "error",
    messageTemplate: "Expected '='.",
    causeTemplate: "The parser expected an assignment separator.",
    fixTemplate: "Insert '=' at the reported location.",
    aiRepairable: true
  },
  ANPL_PARSE_EXPECTED_RBRACKET: {
    code: "ANPL_PARSE_EXPECTED_RBRACKET",
    category: "parse",
    severity: "error",
    messageTemplate: "Expected ']'.",
    causeTemplate: "The parser expected the end of a type argument list.",
    fixTemplate: "Insert ']' at the reported location.",
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
  ANPL_RUNTIME_ENTRY_NOT_FOUND: {
    code: "ANPL_RUNTIME_ENTRY_NOT_FOUND",
    category: "runtime",
    severity: "error",
    messageTemplate: "Entry function '{symbol}' was not found.",
    causeTemplate: "Runtime execution could not find the requested entry function.",
    fixTemplate: "Declare the entry function or pass a module-qualified entry name.",
    aiRepairable: true
  },
  ANPL_RUNTIME_ENTRY_AMBIGUOUS: {
    code: "ANPL_RUNTIME_ENTRY_AMBIGUOUS",
    category: "runtime",
    severity: "error",
    messageTemplate: "Entry function '{symbol}' is ambiguous.",
    causeTemplate: "More than one runtime function matches the requested unqualified entry name.",
    fixTemplate: "Use a module-qualified entry such as module.main.",
    aiRepairable: true
  },
  ANPL_RUNTIME_FUNCTION_NOT_FOUND: {
    code: "ANPL_RUNTIME_FUNCTION_NOT_FOUND",
    category: "runtime",
    severity: "error",
    messageTemplate: "Function '{symbol}' is not defined.",
    causeTemplate: "A runtime call target did not resolve to a function.",
    fixTemplate: "Check the callee name, imports, and module-qualified symbol.",
    aiRepairable: true
  },
  ANPL_RUNTIME_INVALID_MEMBER_ACCESS: {
    code: "ANPL_RUNTIME_INVALID_MEMBER_ACCESS",
    category: "runtime",
    severity: "error",
    messageTemplate: "Cannot access member '{symbol}' on {received}.",
    causeTemplate: "Member access requires a record runtime value.",
    fixTemplate: "Access a declared record field or change the expression to produce a record.",
    aiRepairable: true
  },
  ANPL_RUNTIME_INVALID_CONDITION: {
    code: "ANPL_RUNTIME_INVALID_CONDITION",
    category: "runtime",
    severity: "error",
    messageTemplate: "Runtime condition must be {expected}, received {received}.",
    causeTemplate: "Runtime control flow requires a boolean condition.",
    fixTemplate: "Change the condition expression so it produces a bool value.",
    aiRepairable: true
  },
  ANPL_RUNTIME_UNDEFINED_VALUE: {
    code: "ANPL_RUNTIME_UNDEFINED_VALUE",
    category: "runtime",
    severity: "error",
    messageTemplate: "Runtime value '{symbol}' is not defined.",
    causeTemplate: "The runtime attempted to read a value before it was initialized.",
    fixTemplate: "Ensure the value is stored before it is read.",
    aiRepairable: true
  },
  ANPL_RUNTIME_UNEXPECTED_VALUE: {
    code: "ANPL_RUNTIME_UNEXPECTED_VALUE",
    category: "runtime",
    severity: "error",
    messageTemplate: "Expected {expected} but received {received}.",
    causeTemplate: "The runtime reached a value or instruction shape that violates execution expectations.",
    fixTemplate: "Inspect semantic analysis, MIR lowering, or optimizer output for the invalid value.",
    aiRepairable: true
  },
  ANPL_RUNTIME_EFFECT_BLOCKED: {
    code: "ANPL_RUNTIME_EFFECT_BLOCKED",
    category: "runtime",
    severity: "error",
    messageTemplate: "Runtime effect '{expected}' was blocked.",
    causeTemplate: "A builtin requires a capability that is not allowed by the runtime sandbox.",
    fixTemplate: "Allow the required effect in the sandbox policy or avoid the builtin.",
    aiRepairable: true
  },
  ANPL_RUNTIME_LIMIT_EXCEEDED: {
    code: "ANPL_RUNTIME_LIMIT_EXCEEDED",
    category: "runtime",
    severity: "error",
    messageTemplate: "Runtime limit exceeded: expected {expected}, received {received}.",
    causeTemplate: "Runtime execution exceeded a sandbox time or memory policy.",
    fixTemplate: "Increase the runtime limit or simplify the executed program.",
    aiRepairable: false
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
  ANPL_PROJECT_DEPENDENCY_NOT_FOUND: {
    code: "ANPL_PROJECT_DEPENDENCY_NOT_FOUND",
    category: "project",
    severity: "error",
    messageTemplate: "Dependency '{symbol}' was not found.",
    causeTemplate: "The project manifest declares a dependency path that the compiler host cannot resolve.",
    fixTemplate: "Create the dependency project, correct the dependency path, or remove the dependency from anpl.json.",
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
  ANPL_PROJECT_AMBIGUOUS_MODULE_IMPORT: {
    code: "ANPL_PROJECT_AMBIGUOUS_MODULE_IMPORT",
    category: "project",
    severity: "error",
    messageTemplate: "Imported module '{symbol}' is ambiguous across project packages.",
    causeTemplate: "More than one resolved package exports a module with this local name.",
    fixTemplate: "Use a package-qualified import such as import package.module.",
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

export function diagnosticsToYaml(diagnostics: Diagnostic[]): string {
  return `${yamlLines(diagnostics.map(enrichDiagnostic), 0).join("\n")}\n`;
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

function yamlLines(value: unknown, indent: number): string[] {
  const prefix = " ".repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${prefix}[]`];
    }

    return value.flatMap((item) => {
      if (isRecord(item)) {
        const lines = yamlObjectLines(item, indent + 2);
        if (lines.length === 0) {
          return [`${prefix}- {}`];
        }
        const [first, ...rest] = lines;
        return [`${prefix}- ${first.trimStart()}`, ...rest];
      }
      if (isScalar(item)) {
        return [`${prefix}- ${formatYamlScalar(item)}`];
      }
      return [`${prefix}-`, ...yamlLines(item, indent + 2)];
    });
  }

  if (isRecord(value)) {
    return yamlObjectLines(value, indent);
  }

  return [`${prefix}${formatYamlScalar(value)}`];
}

function yamlObjectLines(value: Record<string, unknown>, indent: number): string[] {
  const prefix = " ".repeat(indent);
  const entries = Object.entries(value).filter(([, item]) => item !== undefined);

  return entries.flatMap(([key, item]) => {
    if (isScalar(item)) {
      return [`${prefix}${key}: ${formatYamlScalar(item)}`];
    }
    return [`${prefix}${key}:`, ...yamlLines(item, indent + 2)];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function formatYamlScalar(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value !== "string") {
    return JSON.stringify(value);
  }
  if (/^[A-Za-z0-9_.:/-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}
