import type { Diagnostic, GeneratedFile } from "@anpl/core";
import type { IRExpr, IRFunction, IRModule, IRProgram, IRStmt } from "@anpl/ir";
import type {
  MirBlock,
  MirFunction,
  MirInstruction,
  MirProgram,
  MirTerminator
} from "@anpl/mir";

export type BackendArtifact = {
  kind: "js" | "ts" | "map";
  path?: string;
  content: string;
};

export type BackendContext = {
  outFile?: string;
};

export type BackendResult = {
  artifacts: BackendArtifact[];
  diagnostics: Diagnostic[];
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
      context.outFile ?? "generated/anpl.js"
    );

    return {
      artifacts: [
        {
          kind: "js",
          path: generated.path,
          content: generated.content
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
      context.outFile ?? "generated/anpl.ts"
    );

    return {
      artifacts: [
        {
          kind: "ts",
          path: generated.path,
          content: generated.content
        }
      ],
      diagnostics: []
    };
  }
};

export function compileProgramToJavaScript(program: IRProgram): string {
  const modules = program.modules.map(compileModule).join("\n\n");

  return `${runtimePrelude()}\n\nconst __anpl_modules = {};\n\n${modules}\n\nexport { __anpl_modules };\n`;
}

export function compileProgramToJavaScriptFile(
  program: IRProgram,
  path = "generated/anpl.js"
): GeneratedFile {
  return {
    path,
    content: compileProgramToJavaScript(program)
  };
}

export function compileMirProgramToJavaScript(program: MirProgram): string {
  const modules = groupMirFunctionsByModule(program)
    .map(([moduleName, functions]) => compileMirModule(moduleName, functions, "js"))
    .join("\n\n");

  return `${runtimePrelude()}\n\nconst __anpl_modules = {};\n\n${modules}\n\nexport { __anpl_modules };\n`;
}

export function compileMirProgramToJavaScriptFile(
  program: MirProgram,
  path = "generated/anpl.js"
): GeneratedFile {
  return {
    path,
    content: compileMirProgramToJavaScript(program)
  };
}

export function compileMirProgramToTypeScript(program: MirProgram): string {
  const modules = groupMirFunctionsByModule(program)
    .map(([moduleName, functions]) => compileMirModule(moduleName, functions, "ts"))
    .join("\n\n");

  return `${runtimePrelude("ts")}\n\ntype __AnplFunction = (...args: any[]) => any;\nconst __anpl_modules: Record<string, Record<string, __AnplFunction>> = {};\n\n${modules}\n\nexport { __anpl_modules };\n`;
}

export function compileMirProgramToTypeScriptFile(
  program: MirProgram,
  path = "generated/anpl.ts"
): GeneratedFile {
  return {
    path,
    content: compileMirProgramToTypeScript(program)
  };
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
      (param) => `__locals[${JSON.stringify(`${fn.id}.${param.name}`)}] = ${param.name};`
    ),
    language === "ts"
      ? `let __block: string = ${JSON.stringify(fn.blocks[0]?.id ?? `${fn.id}.entry`)};`
      : `let __block = ${JSON.stringify(fn.blocks[0]?.id ?? `${fn.id}.entry`)};`,
    "while (true) {",
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
      return `${valueSlot(instruction.target)} = ${JSON.stringify(instruction.value)};`;
    case "load":
      return `${valueSlot(instruction.target)} = __locals[${JSON.stringify(instruction.symbol)}];`;
    case "store":
      return `__locals[${JSON.stringify(instruction.symbol)}] = ${valueSlot(instruction.value)};`;
    case "binary":
      return `${valueSlot(instruction.target)} = (${valueSlot(instruction.left)} ${compileOperator(instruction.operator)} ${valueSlot(instruction.right)});`;
    case "call": {
      const call = `${compileCallee(instruction.callee)}(${instruction.args.map(valueSlot).join(", ")})`;
      return instruction.target === undefined
        ? `${call};`
        : `${valueSlot(instruction.target)} = ${call};`;
    }
    case "record":
      return `${valueSlot(instruction.target)} = { ${Object.entries(instruction.fields)
        .map(([field, value]) => `${JSON.stringify(field)}: ${valueSlot(value)}`)
        .join(", ")} };`;
    case "member":
      return `${valueSlot(instruction.target)} = ${valueSlot(instruction.object)}[${JSON.stringify(instruction.field)}];`;
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

function indent(source: string, levels = 1): string {
  const prefix = "  ".repeat(levels);
  return source
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function runtimePrelude(language: BackendLanguage = "js"): string {
  if (language === "ts") {
    return `function uuid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function print(value: any): null {
  console.log(value);
  return null;
}

function len(value: any): number {
  if (typeof value === "string" || Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}`;
  }

  return `function uuid() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function print(value) {
  console.log(value);
  return null;
}

function len(value) {
  if (typeof value === "string" || Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}`;
}
