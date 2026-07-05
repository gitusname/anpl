import type {
  BinaryExpr,
  BlockStmt,
  Decl,
  Expr,
  FunctionDecl,
  Param,
  Program,
  RecordExpr,
  Stmt,
  TypeDecl,
  TypeRef
} from "@anpl/ast";

export type FormatOptions = {
  indent: 2;
  lineWidth: number;
  canonical: true;
};

export const defaultFormatOptions: FormatOptions = {
  indent: 2,
  lineWidth: 100,
  canonical: true
};

export function formatProgram(
  program: Program,
  options: FormatOptions = defaultFormatOptions
): string {
  return `${program.modules
    .map((moduleDecl) => {
      const imports = moduleDecl.body.filter((decl) => decl.kind === "ImportDecl");
      const types = moduleDecl.body.filter((decl): decl is TypeDecl => decl.kind === "TypeDecl");
      const functions = moduleDecl.body.filter(
        (decl): decl is FunctionDecl => decl.kind === "FunctionDecl"
      );
      const ordered = [...imports, ...types, ...functions];
      const body = ordered.map((decl) => formatDecl(decl, options)).join("\n\n");
      return body.length > 0 ? `module ${moduleDecl.name}\n\n${body}` : `module ${moduleDecl.name}`;
    })
    .join("\n\n")}\n`;
}

function formatDecl(decl: Decl, options: FormatOptions): string {
  switch (decl.kind) {
    case "ImportDecl":
      return `import ${decl.module}`;
    case "TypeDecl":
      return formatTypeDecl(decl, options);
    case "FunctionDecl":
      return formatFunctionDecl(decl, options);
  }
}

function formatTypeDecl(decl: TypeDecl, options: FormatOptions): string {
  const fields = decl.fields
    .map(
      (field) =>
        `${spaces(options.indent)}${field.name}${field.optional ? "?" : ""}: ${formatTypeRef(field.type)}`
    )
    .join("\n");

  return `type ${decl.name} {\n${fields}\n}`;
}

function formatFunctionDecl(fn: FunctionDecl, options: FormatOptions): string {
  const params = fn.params.map(formatParam).join(", ");
  return `fn ${fn.name}(${params}) -> ${formatTypeRef(fn.returnType)} ${formatBlock(fn.body, options)}`;
}

function formatParam(param: Param): string {
  return `${param.name}: ${formatTypeRef(param.type)}`;
}

function formatBlock(block: BlockStmt, options: FormatOptions): string {
  if (block.statements.length === 0) {
    return "{}";
  }

  return `{\n${block.statements
    .map((stmt) => `${spaces(options.indent)}${formatStmt(stmt, options)}`)
    .join("\n")}\n}`;
}

function formatStmt(stmt: Stmt, options: FormatOptions): string {
  switch (stmt.kind) {
    case "LetStmt":
      return `let ${stmt.name}${stmt.type ? `: ${formatTypeRef(stmt.type)}` : ""} = ${formatExpr(stmt.value)}`;
    case "ReturnStmt":
      return `return${stmt.value ? ` ${formatExpr(stmt.value)}` : ""}`;
    case "ExprStmt":
      return formatExpr(stmt.expression);
    case "IfStmt": {
      const elseBranch =
        stmt.elseBranch === undefined
          ? ""
          : stmt.elseBranch.kind === "BlockStmt"
            ? ` else ${formatBlock(stmt.elseBranch, options)}`
            : ` else ${formatStmt(stmt.elseBranch, options)}`;
      return `if ${formatExpr(stmt.condition)} ${formatBlock(stmt.thenBranch, options)}${elseBranch}`;
    }
  }
}

function formatExpr(expr: Expr): string {
  switch (expr.kind) {
    case "LiteralExpr":
      return JSON.stringify(expr.value);
    case "IdentifierExpr":
      return expr.name;
    case "BinaryExpr":
      return formatBinaryExpr(expr);
    case "CallExpr":
      return `${formatExpr(expr.callee)}(${expr.args.map(formatExpr).join(", ")})`;
    case "RecordExpr":
      return formatRecordExpr(expr);
    case "MemberExpr":
      return `${formatExpr(expr.object)}.${expr.property}`;
  }
}

function formatBinaryExpr(expr: BinaryExpr): string {
  return `${formatExpr(expr.left)} ${expr.operator} ${formatExpr(expr.right)}`;
}

function formatRecordExpr(expr: RecordExpr): string {
  return `${expr.typeName} { ${expr.fields
    .map((field) => `${field.name}: ${formatExpr(field.value)}`)
    .join(" ") } }`;
}

function formatTypeRef(type: TypeRef): string {
  const args =
    type.typeArgs === undefined || type.typeArgs.length === 0
      ? ""
      : `[${type.typeArgs.map(formatTypeRef).join(", ")}]`;
  return `${type.name}${args}${type.optional ? "?" : ""}`;
}

function spaces(count: number): string {
  return " ".repeat(count);
}
