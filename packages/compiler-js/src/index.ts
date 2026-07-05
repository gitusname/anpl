import type { GeneratedFile } from "@anpl/core";
import type { IRExpr, IRFunction, IRModule, IRProgram, IRStmt } from "@anpl/ir";
import type {
  MirBlock,
  MirFunction,
  MirInstruction,
  MirProgram,
  MirTerminator
} from "@anpl/mir";

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
    .map(([moduleName, functions]) => compileMirModule(moduleName, functions))
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

function compileMirModule(moduleName: string, functions: MirFunction[]): string {
  const members = functions.map(compileMirFunctionMember).join(",\n\n");
  return `__anpl_modules[${JSON.stringify(moduleName)}] = {\n${indent(members)}\n};`;
}

function compileMirFunctionMember(fn: MirFunction): string {
  const params = fn.params.map((param) => param.name).join(", ");
  const body = [
    "const __locals = Object.create(null);",
    "const __values = Object.create(null);",
    ...fn.params.map(
      (param) => `__locals[${JSON.stringify(`${fn.id}.${param.name}`)}] = ${param.name};`
    ),
    `let __block = ${JSON.stringify(fn.blocks[0]?.id ?? `${fn.id}.entry`)};`,
    "while (true) {",
    indent("switch (__block) {"),
    indent(fn.blocks.map(compileMirBlock).join("\n"), 2),
    indent("default:"),
    indent("throw new Error(`Unknown ANPL MIR block ${__block}`);", 2),
    indent("}"),
    "}"
  ].join("\n");

  return `${functionNameForSymbol(fn.id)}(${params}) {\n${indent(body)}\n}`;
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

function runtimePrelude(): string {
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
