import type { IRExpr, IRProgram, IRStmt } from "@anpl/ir";

export function optimizeProgram(program: IRProgram): IRProgram {
  return {
    modules: program.modules.map((moduleDecl) => ({
      ...moduleDecl,
      functions: moduleDecl.functions.map((fn) => ({
        ...fn,
        body: fn.body.map(optimizeStmt)
      }))
    }))
  };
}

function optimizeStmt(stmt: IRStmt): IRStmt {
  switch (stmt.op) {
    case "let":
      return {
        ...stmt,
        value: optimizeExpr(stmt.value)
      };
    case "return":
      return {
        ...stmt,
        value: stmt.value ? optimizeExpr(stmt.value) : undefined
      };
    case "if":
      return {
        ...stmt,
        condition: optimizeExpr(stmt.condition),
        thenBody: stmt.thenBody.map(optimizeStmt),
        elseBody: stmt.elseBody?.map(optimizeStmt)
      };
    case "expr":
      return {
        ...stmt,
        expression: optimizeExpr(stmt.expression)
      };
  }
}

function optimizeExpr(expr: IRExpr): IRExpr {
  switch (expr.op) {
    case "binary": {
      const left = optimizeExpr(expr.left);
      const right = optimizeExpr(expr.right);

      if (left.op === "literal" && right.op === "literal") {
        const folded = foldBinary(expr.operator, left.value, right.value);
        if (folded !== undefined) {
          return {
            op: "literal",
            value: folded
          };
        }
      }

      return {
        ...expr,
        left,
        right
      };
    }
    case "call":
      return {
        ...expr,
        args: expr.args.map(optimizeExpr)
      };
    case "record":
      return {
        ...expr,
        fields: expr.fields.map((field) => ({
          ...field,
          value: optimizeExpr(field.value)
        }))
      };
    case "member":
      return {
        ...expr,
        object: optimizeExpr(expr.object)
      };
    case "literal":
    case "load":
      return expr;
  }
}

function foldBinary(
  operator: string,
  left: string | number | boolean | null,
  right: string | number | boolean | null
): string | number | boolean | null | undefined {
  if (typeof left === "number" && typeof right === "number") {
    switch (operator) {
      case "+":
        return left + right;
      case "-":
        return left - right;
      case "*":
        return left * right;
      case "/":
        return left / right;
      case "%":
        return left % right;
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      case "<":
        return left < right;
      case "<=":
        return left <= right;
      case ">":
        return left > right;
      case ">=":
        return left >= right;
      default:
        return undefined;
    }
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    if (operator === "and") {
      return left && right;
    }
    if (operator === "or") {
      return left || right;
    }
  }

  if (operator === "==" || operator === "!=") {
    return operator === "==" ? left === right : left !== right;
  }

  return undefined;
}
