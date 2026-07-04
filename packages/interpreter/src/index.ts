import type { Diagnostic } from "@anpl/core";
import { createDiagnostic } from "@anpl/core";
import type { IRExpr, IRFunction, IRProgram, IRStmt } from "@anpl/ir";
import type { RuntimeHost, RuntimeValue } from "@anpl/runtime";
import { createRuntimeHost } from "@anpl/runtime";

export type InterpretResult =
  | {
      ok: true;
      value: RuntimeValue | undefined;
      output: string[];
      diagnostics: [];
    }
  | {
      ok: false;
      value?: RuntimeValue;
      output: string[];
      diagnostics: Diagnostic[];
    };

type Environment = Map<string, RuntimeValue>;

type ReturnSignal = {
  returned: true;
  value: RuntimeValue | undefined;
};

export function interpretProgram(
  program: IRProgram,
  entry = "main",
  host: RuntimeHost = createRuntimeHost()
): InterpretResult {
  const interpreter = new Interpreter(program, host);
  return interpreter.run(entry);
}

class Interpreter {
  private readonly diagnostics: Diagnostic[] = [];
  private readonly functions = new Map<string, IRFunction>();

  constructor(
    program: IRProgram,
    private readonly host: RuntimeHost
  ) {
    for (const moduleDecl of program.modules) {
      for (const fn of moduleDecl.functions) {
        this.functions.set(fn.name, fn);
      }
    }
  }

  run(entry: string): InterpretResult {
    const fn = this.functions.get(entry);
    if (fn === undefined) {
      this.runtimeError(`Entry function '${entry}' was not found.`, entry);
      return this.fail();
    }

    const value = this.callFunction(fn, []);
    if (this.diagnostics.length > 0) {
      return this.fail(value);
    }

    return {
      ok: true,
      value,
      output: this.host.output,
      diagnostics: []
    };
  }

  private callFunction(fn: IRFunction, args: RuntimeValue[]): RuntimeValue | undefined {
    const env: Environment = new Map();

    for (const [index, param] of fn.params.entries()) {
      env.set(param.name, args[index] ?? null);
    }

    const signal = this.executeBlock(fn.body, env);
    return signal?.value;
  }

  private executeBlock(stmts: IRStmt[], env: Environment): ReturnSignal | undefined {
    for (const stmt of stmts) {
      const result = this.executeStmt(stmt, env);
      if (result?.returned) {
        return result;
      }
    }
    return undefined;
  }

  private executeStmt(stmt: IRStmt, env: Environment): ReturnSignal | undefined {
    switch (stmt.op) {
      case "let":
        env.set(stmt.name, this.evaluate(stmt.value, env));
        return undefined;
      case "return":
        return {
          returned: true,
          value: stmt.value ? this.evaluate(stmt.value, env) : undefined
        };
      case "if": {
        const condition = this.evaluate(stmt.condition, env);
        if (condition === true) {
          return this.executeBlock(stmt.thenBody, new Map(env));
        }
        if (stmt.elseBody !== undefined) {
          return this.executeBlock(stmt.elseBody, new Map(env));
        }
        return undefined;
      }
      case "expr":
        this.evaluate(stmt.expression, env);
        return undefined;
    }
  }

  private evaluate(expr: IRExpr, env: Environment): RuntimeValue {
    switch (expr.op) {
      case "literal":
        return expr.value;
      case "load": {
        if (env.has(expr.name)) {
          return env.get(expr.name) ?? null;
        }
        this.runtimeError(`Variable '${expr.name}' is not defined.`, expr.name);
        return null;
      }
      case "binary":
        return this.applyBinary(
          expr.operator,
          this.evaluate(expr.left, env),
          this.evaluate(expr.right, env)
        );
      case "call": {
        const args = expr.args.map((arg) => this.evaluate(arg, env));
        const builtin = this.host.builtins[expr.callee];
        if (builtin !== undefined) {
          return builtin(...args);
        }
        const fn = this.functions.get(expr.callee);
        if (fn === undefined) {
          this.runtimeError(`Function '${expr.callee}' is not defined.`, expr.callee);
          return null;
        }
        return this.callFunction(fn, args) ?? null;
      }
      case "record": {
        const value: Record<string, RuntimeValue> = {};
        for (const field of expr.fields) {
          value[field.name] = this.evaluate(field.value, env);
        }
        return value;
      }
      case "member": {
        const object = this.evaluate(expr.object, env);
        if (object !== null && typeof object === "object" && !Array.isArray(object)) {
          return (object as Record<string, RuntimeValue>)[expr.property] ?? null;
        }
        this.runtimeError(`Cannot read property '${expr.property}'.`, expr.property);
        return null;
      }
    }
  }

  private applyBinary(operator: string, left: RuntimeValue, right: RuntimeValue): RuntimeValue {
    switch (operator) {
      case "+":
        return Number(left) + Number(right);
      case "-":
        return Number(left) - Number(right);
      case "*":
        return Number(left) * Number(right);
      case "/":
        return Number(left) / Number(right);
      case "%":
        return Number(left) % Number(right);
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      case "<":
        return Number(left) < Number(right);
      case "<=":
        return Number(left) <= Number(right);
      case ">":
        return Number(left) > Number(right);
      case ">=":
        return Number(left) >= Number(right);
      case "and":
        return Boolean(left) && Boolean(right);
      case "or":
        return Boolean(left) || Boolean(right);
      default:
        this.runtimeError(`Unknown binary operator '${operator}'.`, operator);
        return null;
    }
  }

  private runtimeError(message: string, symbol?: string): void {
    this.diagnostics.push(
      createDiagnostic({
        code: "ANPL_RUNTIME_ERROR",
        severity: "error",
        message,
        symbol,
        confidence: "high"
      })
    );
  }

  private fail(value?: RuntimeValue): InterpretResult {
    return {
      ok: false,
      value,
      output: this.host.output,
      diagnostics: this.diagnostics
    };
  }
}
