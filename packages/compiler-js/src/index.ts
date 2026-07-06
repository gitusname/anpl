import type { Diagnostic, GeneratedFile, Span } from "@anpl/core";
import type { IRExpr, IRFunction, IRModule, IRProgram, IRStmt } from "@anpl/ir";
import type {
  MirBlock,
  MirFunction,
  MirInstruction,
  MirProgram,
  MirTerminator
} from "@anpl/mir";
import { mergeSandboxPolicy, type SandboxPolicy } from "@anpl/runtime";

export type BackendArtifact = {
  kind: "js" | "ts" | "map";
  path?: string;
  content: string;
};

export type BackendContext = {
  outFile?: string;
  runtimePolicy?: Partial<SandboxPolicy>;
};

export type BackendResult = {
  artifacts: BackendArtifact[];
  diagnostics: Diagnostic[];
};

export type BackendSourceMap = {
  version: 1;
  target: "js" | "ts";
  outFile: string;
  mappings: BackendSourceMapEntry[];
};

export type BackendSourceMapEntry = {
  kind: "function" | "block" | "instruction" | "terminator";
  generated: {
    line: number;
    column: number;
    module: string;
    function: string;
    symbol: string;
    block?: string;
  };
  source?: {
    file?: string;
    start: Span["start"];
    end: Span["end"];
  };
  mir: {
    function: string;
    blocks?: string[];
    block?: string;
    instruction?: number;
    op?: MirInstruction["op"];
    terminator?: MirTerminator["kind"];
  };
};

export type Backend = {
  name: string;
  target: string;
  emit(program: MirProgram, context?: BackendContext): BackendResult;
};

export const javascriptBackend: Backend = {
  name: "javascript",
  target: "js",
  emit(program, context = {}) {
    const generated = compileMirProgramToJavaScriptFile(
      program,
      context.outFile ?? "generated/anpl.js",
      {
        runtimePolicy: context.runtimePolicy
      }
    );
    const sourceMap = createMirBackendSourceMap(program, "js", generated.path, generated.content);

    return {
      artifacts: [
        {
          kind: "js",
          path: generated.path,
          content: generated.content
        },
        {
          kind: "map",
          path: `${generated.path}.map.json`,
          content: JSON.stringify(sourceMap, null, 2)
        }
      ],
      diagnostics: []
    };
  }
};

export const typescriptBackend: Backend = {
  name: "typescript",
  target: "ts",
  emit(program, context = {}) {
    const generated = compileMirProgramToTypeScriptFile(
      program,
      context.outFile ?? "generated/anpl.ts",
      {
        runtimePolicy: context.runtimePolicy
      }
    );
    const sourceMap = createMirBackendSourceMap(program, "ts", generated.path, generated.content);

    return {
      artifacts: [
        {
          kind: "ts",
          path: generated.path,
          content: generated.content
        },
        {
          kind: "map",
          path: `${generated.path}.map.json`,
          content: JSON.stringify(sourceMap, null, 2)
        }
      ],
      diagnostics: []
    };
  }
};

export type BackendEmitOptions = {
  runtimePolicy?: Partial<SandboxPolicy>;
};

export function compileProgramToJavaScript(
  program: IRProgram,
  options: BackendEmitOptions = {}
): string {
  const modules = program.modules.map(compileModule).join("\n\n");

  return `${runtimePrelude("js", options.runtimePolicy ?? {})}\n\nconst __anpl_modules = {};\n\n${modules}\n\nexport { __anpl_modules };\n`;
}

export function compileProgramToJavaScriptFile(
  program: IRProgram,
  path = "generated/anpl.js",
  options: BackendEmitOptions = {}
): GeneratedFile {
  return {
    path,
    content: compileProgramToJavaScript(program, options)
  };
}

export function compileMirProgramToJavaScript(
  program: MirProgram,
  options: BackendEmitOptions = {}
): string {
  const modules = groupMirFunctionsByModule(program)
    .map(([moduleName, functions]) => compileMirModule(moduleName, functions, "js"))
    .join("\n\n");

  return `${runtimePrelude("js", options.runtimePolicy ?? {})}\n\nconst __anpl_modules = {};\n\n${modules}\n\nexport { __anpl_modules };\n`;
}

export function compileMirProgramToJavaScriptFile(
  program: MirProgram,
  path = "generated/anpl.js",
  options: BackendEmitOptions = {}
): GeneratedFile {
  return {
    path,
    content: compileMirProgramToJavaScript(program, options)
  };
}

export function compileMirProgramToTypeScript(
  program: MirProgram,
  options: BackendEmitOptions = {}
): string {
  const modules = groupMirFunctionsByModule(program)
    .map(([moduleName, functions]) => compileMirModule(moduleName, functions, "ts"))
    .join("\n\n");

  return `${runtimePrelude("ts", options.runtimePolicy ?? {})}\n\ntype __AnplFunction = (...args: any[]) => any;\nconst __anpl_modules: Record<string, Record<string, __AnplFunction>> = {};\n\n${modules}\n\nexport { __anpl_modules };\n`;
}

export function compileMirProgramToTypeScriptFile(
  program: MirProgram,
  path = "generated/anpl.ts",
  options: BackendEmitOptions = {}
): GeneratedFile {
  return {
    path,
    content: compileMirProgramToTypeScript(program, options)
  };
}

export function createMirBackendSourceMap(
  program: MirProgram,
  target: BackendSourceMap["target"],
  outFile: string,
  content: string
): BackendSourceMap {
  return {
    version: 1,
    target,
    outFile,
    mappings: program.functions.flatMap((fn) =>
      createMirFunctionSourceMapEntries(fn, content)
    )
  };
}

function createMirFunctionSourceMapEntries(
  fn: MirFunction,
  content: string
): BackendSourceMapEntry[] {
  const moduleName = moduleNameForSymbol(fn.id);
  const functionName = functionNameForSymbol(fn.id);
  const symbol = `__anpl_modules[${JSON.stringify(moduleName)}].${functionName}`;
  const generated = generatedLocationForFunction(content, moduleName, functionName);
  const entries: BackendSourceMapEntry[] = [
    {
      kind: "function",
      generated: {
        ...generated,
        module: moduleName,
        function: functionName,
        symbol
      },
      source: sourceSpan(fn.span),
      mir: {
        function: fn.id,
        blocks: fn.blocks.map((block) => block.id)
      }
    }
  ];

  let cursorLine = generated.line;
  for (const block of fn.blocks) {
    const blockGenerated = generatedLocationForSnippet(
      content,
      `case ${JSON.stringify(block.id)}: {`,
      cursorLine
    );
    entries.push({
      kind: "block",
      generated: {
        ...blockGenerated,
        module: moduleName,
        function: functionName,
        symbol,
        block: block.id
      },
      source: sourceSpan(block.span),
      mir: {
        function: fn.id,
        block: block.id
      }
    });

    cursorLine = blockGenerated.line;
    block.instructions.forEach((instruction, index) => {
      const instructionGenerated = generatedLocationForSnippet(
        content,
        compileMirInstruction(instruction),
        cursorLine
      );
      entries.push({
        kind: "instruction",
        generated: {
          ...instructionGenerated,
          module: moduleName,
          function: functionName,
          symbol,
          block: block.id
        },
        source: sourceSpan(instruction.span),
        mir: {
          function: fn.id,
          block: block.id,
          instruction: index,
          op: instruction.op
        }
      });
      cursorLine = instructionGenerated.line;
    });

    const terminatorGenerated = generatedLocationForSnippet(
      content,
      compileMirTerminator(block.terminator),
      cursorLine
    );
    entries.push({
      kind: "terminator",
      generated: {
        ...terminatorGenerated,
        module: moduleName,
        function: functionName,
        symbol,
        block: block.id
      },
      source: sourceSpan(block.terminator.span),
      mir: {
        function: fn.id,
        block: block.id,
        terminator: block.terminator.kind
      }
    });
    cursorLine = terminatorGenerated.line;
  }

  return entries;
}

function compileModule(moduleDecl: IRModule): string {
  const members = moduleDecl.functions.map(compileFunctionMember).join(",\n\n");
  return `__anpl_modules[${JSON.stringify(moduleDecl.name)}] = {\n${indent(members)}\n};`;
}

function compileFunctionMember(fn: IRFunction): string {
  const params = fn.params.map((param) => param.name).join(", ");
  const body = fn.body.map((stmt) => indent(compileStmt(stmt))).join("\n");

  return `${fn.name}(${params}) {\n${body}\n}`;
}

function compileStmt(stmt: IRStmt): string {
  switch (stmt.op) {
    case "let":
      return `let ${stmt.name} = ${compileExpr(stmt.value)};`;
    case "return":
      return `return${stmt.value ? ` ${compileExpr(stmt.value)}` : ""};`;
    case "expr":
      return `${compileExpr(stmt.expression)};`;
    case "if": {
      const thenBody = stmt.thenBody.map((inner) => indent(compileStmt(inner))).join("\n");
      const elseBody = stmt.elseBody?.map((inner) => indent(compileStmt(inner))).join("\n");
      return elseBody
        ? `if (${compileExpr(stmt.condition)}) {\n${thenBody}\n} else {\n${elseBody}\n}`
        : `if (${compileExpr(stmt.condition)}) {\n${thenBody}\n}`;
    }
  }
}

function compileExpr(expr: IRExpr): string {
  switch (expr.op) {
    case "literal":
      return JSON.stringify(expr.value);
    case "load":
      return expr.name;
    case "binary":
      return `(${compileExpr(expr.left)} ${compileOperator(expr.operator)} ${compileExpr(expr.right)})`;
    case "call":
      return `${compileCallee(expr.callee)}(${expr.args.map(compileExpr).join(", ")})`;
    case "record":
      return `{ ${expr.fields
        .map((field) => `${field.name}: ${compileExpr(field.value)}`)
        .join(", ")} }`;
    case "member":
      return `${compileExpr(expr.object)}.${expr.property}`;
  }
}

function compileCallee(callee: string): string {
  const [moduleName, functionName, ...rest] = callee.split(".");
  if (moduleName !== undefined && functionName !== undefined && rest.length === 0) {
    return `__anpl_modules[${JSON.stringify(moduleName)}].${functionName}`;
  }
  return callee;
}

function compileOperator(operator: string): string {
  if (operator === "and") {
    return "&&";
  }
  if (operator === "or") {
    return "||";
  }
  return operator;
}

function groupMirFunctionsByModule(program: MirProgram): Array<[string, MirFunction[]]> {
  const modules = new Map<string, MirFunction[]>();

  for (const fn of program.functions) {
    const moduleName = moduleNameForSymbol(fn.id);
    const functions = modules.get(moduleName) ?? [];
    functions.push(fn);
    modules.set(moduleName, functions);
  }

  return [...modules.entries()];
}

type BackendLanguage = "js" | "ts";

function compileMirModule(
  moduleName: string,
  functions: MirFunction[],
  language: BackendLanguage
): string {
  const members = functions.map((fn) => compileMirFunctionMember(fn, language)).join(",\n\n");
  return `__anpl_modules[${JSON.stringify(moduleName)}] = {\n${indent(members)}\n};`;
}

function compileMirFunctionMember(fn: MirFunction, language: BackendLanguage): string {
  const params = fn.params
    .map((param) => (language === "ts" ? `${param.name}: any` : param.name))
    .join(", ");
  const body = [
    language === "ts"
      ? "const __locals: Record<string, any> = Object.create(null);"
      : "const __locals = Object.create(null);",
    language === "ts"
      ? "const __values: Record<string, any> = Object.create(null);"
      : "const __values = Object.create(null);",
    ...fn.params.map(
      (param) => `__locals[${JSON.stringify(`${fn.id}.${param.name}`)}] = __anpl_track_value(${param.name});`
    ),
    language === "ts"
      ? `let __block: string = ${JSON.stringify(fn.blocks[0]?.id ?? `${fn.id}.entry`)};`
      : `let __block = ${JSON.stringify(fn.blocks[0]?.id ?? `${fn.id}.entry`)};`,
    "while (true) {",
    indent("__anpl_check_runtime_limits();"),
    indent("switch (__block) {"),
    indent(fn.blocks.map(compileMirBlock).join("\n"), 2),
    indent("default:"),
    indent("throw new Error(`Unknown ANPL MIR block ${__block}`);", 2),
    indent("}"),
    "}"
  ].join("\n");

  const returnType = language === "ts" ? ": any" : "";
  return `${functionNameForSymbol(fn.id)}(${params})${returnType} {\n${indent(body)}\n}`;
}

function compileMirBlock(block: MirBlock): string {
  const instructions = block.instructions.map(compileMirInstruction).join("\n");
  const terminator = compileMirTerminator(block.terminator);
  const body = [instructions, terminator].filter((part) => part.length > 0).join("\n");

  return `case ${JSON.stringify(block.id)}: {\n${indent(body)}\n}`;
}

function compileMirInstruction(instruction: MirInstruction): string {
  switch (instruction.op) {
    case "const":
      return `${valueSlot(instruction.target)} = __anpl_track_value(${JSON.stringify(instruction.value)});`;
    case "load":
      return `${valueSlot(instruction.target)} = __anpl_track_value(__locals[${JSON.stringify(instruction.symbol)}]);`;
    case "store":
      return `__locals[${JSON.stringify(instruction.symbol)}] = __anpl_track_value(${valueSlot(instruction.value)});`;
    case "binary":
      return `${valueSlot(instruction.target)} = __anpl_track_value((${valueSlot(instruction.left)} ${compileOperator(instruction.operator)} ${valueSlot(instruction.right)}));`;
    case "call": {
      const call = `${compileCallee(instruction.callee)}(${instruction.args.map(valueSlot).join(", ")})`;
      return instruction.target === undefined
        ? `${call};`
        : `${valueSlot(instruction.target)} = __anpl_track_value(${call});`;
    }
    case "record":
      return `${valueSlot(instruction.target)} = __anpl_track_value({ ${Object.entries(instruction.fields)
        .map(([field, value]) => `${JSON.stringify(field)}: ${valueSlot(value)}`)
        .join(", ")} });`;
    case "member":
      return `${valueSlot(instruction.target)} = __anpl_track_value(${valueSlot(instruction.object)}[${JSON.stringify(instruction.field)}]);`;
  }
}

function compileMirTerminator(terminator: MirTerminator): string {
  switch (terminator.kind) {
    case "return":
      return terminator.value === undefined ? "return;" : `return ${valueSlot(terminator.value)};`;
    case "jump":
      return `__block = ${JSON.stringify(terminator.target)};\ncontinue;`;
    case "branch":
      return `__block = ${valueSlot(terminator.condition)} ? ${JSON.stringify(terminator.thenBlock)} : ${JSON.stringify(terminator.elseBlock)};\ncontinue;`;
  }
}

function valueSlot(name: string): string {
  return `__values[${JSON.stringify(name)}]`;
}

function moduleNameForSymbol(symbol: string): string {
  const index = symbol.indexOf(".");
  return index === -1 ? "$main" : symbol.slice(0, index);
}

function functionNameForSymbol(symbol: string): string {
  const index = symbol.lastIndexOf(".");
  return index === -1 ? symbol : symbol.slice(index + 1);
}

function generatedLocationForFunction(
  content: string,
  moduleName: string,
  functionName: string
): { line: number; column: number } {
  const lines = content.split("\n");
  const moduleHeader = `__anpl_modules[${JSON.stringify(moduleName)}] = {`;
  const moduleLine = lines.findIndex((line) => line === moduleHeader);
  const searchStart = moduleLine === -1 ? 0 : moduleLine + 1;

  for (let index = searchStart; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const column = line.indexOf(`${functionName}(`);
    if (column !== -1) {
      return {
        line: index + 1,
        column: column + 1
      };
    }
  }

  return {
    line: 1,
    column: 1
  };
}

function generatedLocationForSnippet(
  content: string,
  snippet: string,
  startLine = 1
): { line: number; column: number } {
  const firstLine = snippet.split("\n")[0] ?? "";
  const lines = content.split("\n");

  for (let index = Math.max(0, startLine - 1); index < lines.length; index += 1) {
    const column = lines[index]?.indexOf(firstLine) ?? -1;
    if (column !== -1) {
      return {
        line: index + 1,
        column: column + 1
      };
    }
  }

  return {
    line: 1,
    column: 1
  };
}

function sourceSpan(span: Span | undefined): BackendSourceMapEntry["source"] {
  if (span === undefined) {
    return undefined;
  }

  return {
    file: span.file,
    start: span.start,
    end: span.end
  };
}

function indent(source: string, levels = 1): string {
  const prefix = "  ".repeat(levels);
  return source
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function runtimePrelude(
  language: BackendLanguage = "js",
  policy: Partial<SandboxPolicy> = {}
): string {
  const sandbox = mergeSandboxPolicy(policy);
  const policySource = JSON.stringify(sandbox);

  if (language === "ts") {
    return `type __AnplRuntimePolicy = {
  allowFileSystem: boolean;
  allowNetwork: boolean;
  allowProcess: boolean;
  maxExecutionMs: number;
  maxMemoryMb: number;
  allowedEffects: string[];
};

const __anpl_runtime_policy: __AnplRuntimePolicy = ${policySource};
const __anpl_runtime_started_at = Date.now();
let __anpl_runtime_memory_bytes = 0;

function __anpl_effect_allowed(effect: string): boolean {
  if (effect.startsWith("io.")) {
    return __anpl_runtime_policy.allowFileSystem && __anpl_runtime_policy.allowedEffects.includes(effect);
  }
  if (effect === "net.request") {
    return __anpl_runtime_policy.allowNetwork && __anpl_runtime_policy.allowedEffects.includes(effect);
  }
  return __anpl_runtime_policy.allowedEffects.includes(effect);
}

function __anpl_require_effect(effect: string, builtin: string): void {
  if (!__anpl_effect_allowed(effect)) {
    throw new Error(\`ANPL runtime policy blocked builtin '\${builtin}' effect '\${effect}'.\`);
  }
}

function __anpl_check_runtime_limits(): void {
  const elapsed = Date.now() - __anpl_runtime_started_at;
  if (elapsed > __anpl_runtime_policy.maxExecutionMs) {
    throw new Error(\`ANPL runtime policy exceeded maxExecutionMs \${__anpl_runtime_policy.maxExecutionMs}.\`);
  }
  const maxBytes = __anpl_runtime_policy.maxMemoryMb * 1024 * 1024;
  if (__anpl_runtime_memory_bytes > maxBytes) {
    throw new Error(\`ANPL runtime policy exceeded maxMemoryMb \${__anpl_runtime_policy.maxMemoryMb}.\`);
  }
}

function __anpl_estimate_value_bytes(value: any): number {
  if (typeof value === "number") return 16;
  if (typeof value === "boolean" || value === null || value === undefined) return 8;
  if (typeof value === "string") return 24 + value.length * 2;
  if (typeof value === "function") return 24;
  if (Array.isArray(value)) {
    return 32 + value.reduce((sum, item) => sum + __anpl_estimate_value_bytes(item), 0);
  }
  if (typeof value === "object") {
    return 48 + Object.entries(value).reduce(
      (sum, [key, item]) => sum + key.length * 2 + __anpl_estimate_value_bytes(item),
      0
    );
  }
  return 8;
}

function __anpl_track_value<T>(value: T): T {
  __anpl_runtime_memory_bytes += __anpl_estimate_value_bytes(value);
  __anpl_check_runtime_limits();
  return value;
}

function uuid(): string {
  __anpl_require_effect("random.uuid", "uuid");
  return crypto.randomUUID();
}

function now(): string {
  __anpl_require_effect("time.now", "now");
  return new Date().toISOString();
}

function print(value: any): null {
  __anpl_require_effect("console.print", "print");
  console.log(value);
  return null;
}

function len(value: any): number {
  if (typeof value === "string" || Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}`;
  }

  return `const __anpl_runtime_policy = ${policySource};
const __anpl_runtime_started_at = Date.now();
let __anpl_runtime_memory_bytes = 0;

function __anpl_effect_allowed(effect) {
  if (effect.startsWith("io.")) {
    return __anpl_runtime_policy.allowFileSystem && __anpl_runtime_policy.allowedEffects.includes(effect);
  }
  if (effect === "net.request") {
    return __anpl_runtime_policy.allowNetwork && __anpl_runtime_policy.allowedEffects.includes(effect);
  }
  return __anpl_runtime_policy.allowedEffects.includes(effect);
}

function __anpl_require_effect(effect, builtin) {
  if (!__anpl_effect_allowed(effect)) {
    throw new Error(\`ANPL runtime policy blocked builtin '\${builtin}' effect '\${effect}'.\`);
  }
}

function __anpl_check_runtime_limits() {
  const elapsed = Date.now() - __anpl_runtime_started_at;
  if (elapsed > __anpl_runtime_policy.maxExecutionMs) {
    throw new Error(\`ANPL runtime policy exceeded maxExecutionMs \${__anpl_runtime_policy.maxExecutionMs}.\`);
  }
  const maxBytes = __anpl_runtime_policy.maxMemoryMb * 1024 * 1024;
  if (__anpl_runtime_memory_bytes > maxBytes) {
    throw new Error(\`ANPL runtime policy exceeded maxMemoryMb \${__anpl_runtime_policy.maxMemoryMb}.\`);
  }
}

function __anpl_estimate_value_bytes(value) {
  if (typeof value === "number") return 16;
  if (typeof value === "boolean" || value === null || value === undefined) return 8;
  if (typeof value === "string") return 24 + value.length * 2;
  if (typeof value === "function") return 24;
  if (Array.isArray(value)) {
    return 32 + value.reduce((sum, item) => sum + __anpl_estimate_value_bytes(item), 0);
  }
  if (typeof value === "object") {
    return 48 + Object.entries(value).reduce(
      (sum, [key, item]) => sum + key.length * 2 + __anpl_estimate_value_bytes(item),
      0
    );
  }
  return 8;
}

function __anpl_track_value(value) {
  __anpl_runtime_memory_bytes += __anpl_estimate_value_bytes(value);
  __anpl_check_runtime_limits();
  return value;
}

function uuid() {
  __anpl_require_effect("random.uuid", "uuid");
  return crypto.randomUUID();
}

function now() {
  __anpl_require_effect("time.now", "now");
  return new Date().toISOString();
}

function print(value) {
  __anpl_require_effect("console.print", "print");
  console.log(value);
  return null;
}

function len(value) {
  if (typeof value === "string" || Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}`;
}
