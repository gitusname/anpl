import type { GeneratedFile } from "@anpl/core";
import type { IRExpr, IRFunction, IRProgram, IRStmt } from "@anpl/ir";

export function compileProgramToJavaScript(program: IRProgram): string {
  const functions = program.modules.flatMap((moduleDecl) => moduleDecl.functions);
  const body = functions.map(compileFunction).join("\n\n");

  return `${runtimePrelude()}\n\n${body}\n\nexport { ${functions
    .map((fn) => fn.name)
    .join(", ")} };\n`;
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

function compileFunction(fn: IRFunction): string {
  const params = fn.params.map((param) => param.name).join(", ");
  const body = fn.body.map((stmt) => indent(compileStmt(stmt))).join("\n");

  return `function ${fn.name}(${params}) {\n${body}\n}`;
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
      return `${expr.callee}(${expr.args.map(compileExpr).join(", ")})`;
    case "record":
      return `{ ${expr.fields
        .map((field) => `${field.name}: ${compileExpr(field.value)}`)
        .join(", ")} }`;
    case "member":
      return `${compileExpr(expr.object)}.${expr.property}`;
  }
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

function indent(source: string): string {
  return source
    .split("\n")
    .map((line) => `  ${line}`)
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
