import type { Diagnostic } from "@anpl/core";
import { createDiagnostic } from "@anpl/core";
import type { IRExpr, IRFunction, IRProgram, IRStmt } from "@anpl/ir";
import type { RuntimeHost, RuntimeValue } from "@anpl/runtime";
import {
  createRuntimeHost,
  isEffectAllowed,
  runtimeBool,
  runtimeDecimal,
  runtimeEquals,
  runtimeInt,
  runtimeNull,
  runtimeRecord,
  runtimeToBool,
  runtimeToNumber,
  runtimeTypeName,
  runtimeValueFromLiteral
} from "@anpl/runtime";

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
        this.functions.set(fn.qualifiedName, fn);
      }
    }
  }

  run(entry: string): InterpretResult {
    const fn = this.resolveEntry(entry);
    if (fn === undefined) {
      if (this.diagnostics.length === 0) {
        this.runtimeError(`Entry function '${entry}' was not found.`, entry);
      }
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
      env.set(param.name, args[index] ?? runtimeNull());
    }

    this.host.frames.push({
      function: fn.qualifiedName,
      module: fn.moduleName
    });
    try {
      const signal = this.executeBlock(fn.body, env);
      return signal?.value;
    } finally {
      this.host.frames.pop();
    }
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
        const conditionValue = runtimeToBool(condition);
        if (conditionValue === undefined) {
          this.runtimeError(
            `If condition must be bool, received ${runtimeTypeName(condition)}.`,
            "if",
            {
              expected: "bool",
              received: runtimeTypeName(condition)
            }
          );
          return undefined;
        }
        if (conditionValue) {
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

  private resolveEntry(entry: string): IRFunction | undefined {
    if (entry.includes(".")) {
      return this.functions.get(entry);
    }

    const matches = [...this.functions.values()].filter((fn) => fn.name === entry);
    if (matches.length === 1) {
      return matches[0];
    }

    if (matches.length > 1) {
      this.runtimeError(
        `Entry function '${entry}' is ambiguous. Use a module-qualified entry name.`,
        entry
      );
    }

    return undefined;
  }

  private evaluate(expr: IRExpr, env: Environment): RuntimeValue {
    switch (expr.op) {
      case "literal":
        return runtimeValueFromLiteral(expr.value);
      case "load": {
        if (env.has(expr.name)) {
          return env.get(expr.name) ?? runtimeNull();
        }
        this.runtimeError(`Variable '${expr.name}' is not defined.`, expr.name);
        return runtimeNull();
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
          const effect = this.host.builtinEffects[expr.callee];
          if (effect !== undefined && !isEffectAllowed(this.host.sandbox, effect)) {
            this.runtimeError(
              `Builtin '${expr.callee}' requires blocked effect '${effect}'.`,
              expr.callee,
              {
                expected: effect,
                received: "blocked"
              }
            );
            return runtimeNull();
          }
          return builtin(...args);
        }
        const fn = this.functions.get(expr.callee);
        if (fn === undefined) {
          this.runtimeError(`Function '${expr.callee}' is not defined.`, expr.callee);
          return runtimeNull();
        }
        return this.callFunction(fn, args) ?? runtimeNull();
      }
      case "record": {
        const value = new Map<string, RuntimeValue>();
        for (const field of expr.fields) {
          value.set(field.name, this.evaluate(field.value, env));
        }
        return runtimeRecord(expr.typeName, value);
      }
      case "member": {
        const object = this.evaluate(expr.object, env);
        if (object.kind === "record") {
          return object.fields.get(expr.property) ?? runtimeNull();
        }
        this.runtimeError(
          `Cannot read property '${expr.property}' on ${runtimeTypeName(object)}.`,
          expr.property,
          {
            expected: "record",
            received: runtimeTypeName(object)
          }
        );
        return runtimeNull();
      }
    }
  }

  private applyBinary(operator: string, left: RuntimeValue, right: RuntimeValue): RuntimeValue {
    const leftNumber = runtimeToNumber(left);
    const rightNumber = runtimeToNumber(right);

    switch (operator) {
      case "+":
      case "-":
      case "*":
      case "/":
      case "%": {
        if (leftNumber === undefined || rightNumber === undefined) {
          this.runtimeError(
            `Cannot apply '${operator}' to ${runtimeTypeName(left)} and ${runtimeTypeName(right)}.`,
            operator,
            {
              expected: "number",
              received: `${runtimeTypeName(left)}, ${runtimeTypeName(right)}`
            }
          );
          return runtimeNull();
        }
        const value = applyNumeric(operator, leftNumber, rightNumber);
        return left.kind === "decimal" || right.kind === "decimal"
          ? runtimeDecimal(value)
          : runtimeInt(value);
      }
      case "==":
        return runtimeBool(runtimeEquals(left, right));
      case "!=":
        return runtimeBool(!runtimeEquals(left, right));
      case "<":
      case "<=":
      case ">":
      case ">=": {
        if (leftNumber === undefined || rightNumber === undefined) {
          this.runtimeError(
            `Cannot compare ${runtimeTypeName(left)} and ${runtimeTypeName(right)}.`,
            operator,
            {
              expected: "number",
              received: `${runtimeTypeName(left)}, ${runtimeTypeName(right)}`
            }
          );
          return runtimeNull();
        }
        return runtimeBool(applyComparison(operator, leftNumber, rightNumber));
      }
      case "and":
      case "or": {
        const leftBool = runtimeToBool(left);
        const rightBool = runtimeToBool(right);
        if (leftBool === undefined || rightBool === undefined) {
          this.runtimeError(
            `Cannot apply '${operator}' to ${runtimeTypeName(left)} and ${runtimeTypeName(right)}.`,
            operator,
            {
              expected: "bool",
              received: `${runtimeTypeName(left)}, ${runtimeTypeName(right)}`
            }
          );
          return runtimeNull();
        }
        return runtimeBool(operator === "and" ? leftBool && rightBool : leftBool || rightBool);
      }
      default:
        this.runtimeError(`Unknown binary operator '${operator}'.`, operator);
        return runtimeNull();
    }
  }

  private runtimeError(
    message: string,
    symbol?: string,
    detail: { expected?: string; received?: string } = {}
  ): void {
    this.diagnostics.push(
      createDiagnostic({
        code: "ANPL_RUNTIME_ERROR",
        severity: "error",
        category: "runtime",
        message,
        symbol,
        expected: detail.expected,
        received: detail.received,
        evidence: this.host.frames.map((frame) => `at ${frame.function}`),
        cause: "Runtime evaluation reached an invalid value or blocked capability.",
        fix: "Inspect the runtime stack and repair the failing expression or sandbox policy.",
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

function applyNumeric(operator: string, left: number, right: number): number {
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
    default:
      return Number.NaN;
  }
}

function applyComparison(operator: string, left: number, right: number): boolean {
  switch (operator) {
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    default:
      return false;
  }
}
