import type { Diagnostic } from "@anpl/core";
import { createDiagnostic } from "@anpl/core";
import type { IRExpr, IRFunction, IRProgram, IRStmt } from "@anpl/ir";
import type {
  MirBlock,
  MirFunction,
  MirInstruction,
  MirProgram,
  MirTerminator
} from "@anpl/mir";
import type { RuntimeHost, RuntimeValue } from "@anpl/runtime";
import {
  checkRuntimeLimits,
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
  runtimeValueFromLiteral,
  trackRuntimeValue
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
type RegisterFile = Map<string, RuntimeValue>;

type ReturnSignal = {
  returned: true;
  value: RuntimeValue | undefined;
};

type RuntimeDiagnosticDetail = {
  code?: string;
  expected?: string;
  received?: string;
  cause?: string;
  fix?: string;
  evidence?: string[];
};

export function interpretProgram(
  program: IRProgram,
  entry = "main",
  host: RuntimeHost = createRuntimeHost()
): InterpretResult {
  const interpreter = new Interpreter(program, host);
  return interpreter.run(entry);
}

export function interpretMirProgram(
  program: MirProgram,
  entry = "main",
  host: RuntimeHost = createRuntimeHost()
): InterpretResult {
  const interpreter = new MirInterpreter(program, host);
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
        this.runtimeError(`Entry function '${entry}' was not found.`, entry, {
          code: "ANPL_RUNTIME_ENTRY_NOT_FOUND",
          expected: "entry function",
          received: "missing",
          cause: "Runtime execution could not find the requested entry function.",
          fix: "Pass a module-qualified entry name or declare a main function."
        });
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
              code: "ANPL_RUNTIME_INVALID_CONDITION",
              expected: "bool",
              received: runtimeTypeName(condition),
              cause: "Runtime control flow requires a boolean condition.",
              fix: "Return or compute a bool expression before the if branch."
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
        entry,
        {
          code: "ANPL_RUNTIME_ENTRY_AMBIGUOUS",
          expected: "single entry function",
          received: `${matches.length} candidates`,
          cause: "More than one runtime function has the requested unqualified entry name.",
          fix: "Use a module-qualified entry such as module.main."
        }
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
        this.runtimeError(`Variable '${expr.name}' is not defined.`, expr.name, {
          code: "ANPL_RUNTIME_UNDEFINED_VALUE",
          expected: "defined runtime value",
          received: "undefined",
          cause: "The runtime attempted to read a variable that is not present in the current frame.",
          fix: "Ensure the value is initialized before it is read."
        });
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
                code: "ANPL_RUNTIME_EFFECT_BLOCKED",
                expected: effect,
                received: "blocked",
                cause: "The builtin requires a capability that is not allowed by the runtime sandbox.",
                fix: "Allow the required effect in the sandbox policy or avoid the builtin."
              }
            );
            return runtimeNull();
          }
          return builtin(...args);
        }
        const fn = this.functions.get(expr.callee);
        if (fn === undefined) {
          this.runtimeError(`Function '${expr.callee}' is not defined.`, expr.callee, {
            code: "ANPL_RUNTIME_FUNCTION_NOT_FOUND",
            expected: "runtime function",
            received: "missing",
            cause: "A runtime call target did not resolve to a function.",
            fix: "Check the callee name, imports, and module-qualified symbol."
          });
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
            code: "ANPL_RUNTIME_INVALID_MEMBER_ACCESS",
            expected: "record",
            received: runtimeTypeName(object),
            cause: "Member access requires a record runtime value.",
            fix: "Access a declared record field or change the expression to produce a record."
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
              code: "ANPL_RUNTIME_UNEXPECTED_VALUE",
              expected: "number",
              received: `${runtimeTypeName(left)}, ${runtimeTypeName(right)}`,
              cause: "A numeric runtime operator received a non-numeric value.",
              fix: "Convert the operands to numbers or use an operator supported by their types."
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
              code: "ANPL_RUNTIME_UNEXPECTED_VALUE",
              expected: "number",
              received: `${runtimeTypeName(left)}, ${runtimeTypeName(right)}`,
              cause: "A comparison runtime operator received a non-numeric value.",
              fix: "Compare numeric values or change the expression."
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
              code: "ANPL_RUNTIME_UNEXPECTED_VALUE",
              expected: "bool",
              received: `${runtimeTypeName(left)}, ${runtimeTypeName(right)}`,
              cause: "A boolean runtime operator received a non-boolean value.",
              fix: "Convert the operands to bool or change the expression."
            }
          );
          return runtimeNull();
        }
        return runtimeBool(operator === "and" ? leftBool && rightBool : leftBool || rightBool);
      }
      default:
        this.runtimeError(`Unknown binary operator '${operator}'.`, operator, {
          code: "ANPL_RUNTIME_UNEXPECTED_VALUE",
          expected: "known binary operator",
          received: operator,
          cause: "The runtime reached an operator that is not implemented.",
          fix: "Lower only supported ANPL binary operators into runtime instructions."
        });
        return runtimeNull();
    }
  }

  private runtimeError(
    message: string,
    symbol?: string,
    detail: RuntimeDiagnosticDetail = {}
  ): void {
    this.diagnostics.push(
      createDiagnostic({
        code: detail.code ?? "ANPL_RUNTIME_ERROR",
        severity: "error",
        category: "runtime",
        message,
        symbol,
        expected: detail.expected,
        received: detail.received,
        evidence: detail.evidence ?? this.host.frames.map((frame) => `at ${frame.function}`),
        cause: detail.cause ?? "Runtime evaluation reached an invalid value or blocked capability.",
        fix: detail.fix ?? "Inspect the runtime stack and repair the failing expression or sandbox policy.",
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

class MirInterpreter {
  private readonly diagnostics: Diagnostic[] = [];
  private readonly functions = new Map<string, MirFunction>();

  constructor(
    program: MirProgram,
    private readonly host: RuntimeHost
  ) {
    for (const fn of program.functions) {
      this.functions.set(fn.id, fn);
    }
  }

  run(entry: string): InterpretResult {
    if (!this.checkLimits("runtime")) {
      return this.fail();
    }

    const fn = this.resolveEntry(entry);
    if (fn === undefined) {
      if (this.diagnostics.length === 0) {
        this.runtimeError(`Entry function '${entry}' was not found.`, entry, {
          code: "ANPL_RUNTIME_ENTRY_NOT_FOUND",
          expected: "entry function",
          received: "missing",
          cause: "Runtime execution could not find the requested MIR entry function.",
          fix: "Pass a module-qualified entry name or declare a main function."
        });
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

  private callFunction(fn: MirFunction, args: RuntimeValue[]): RuntimeValue | undefined {
    if (!this.checkLimits(fn.id)) {
      return undefined;
    }

    const env: Environment = new Map();
    const registers: RegisterFile = new Map();

    for (const [index, param] of fn.params.entries()) {
      this.setLocal(env, mirLocalSymbol(fn, param.name), args[index] ?? runtimeNull());
    }

    this.host.frames.push({
      function: fn.id,
      module: moduleNameForSymbol(fn.id)
    });
    try {
      return this.executeFunction(fn, env, registers);
    } finally {
      this.host.frames.pop();
    }
  }

  private executeFunction(
    fn: MirFunction,
    env: Environment,
    registers: RegisterFile
  ): RuntimeValue | undefined {
    const blocks = new Map(fn.blocks.map((block) => [block.id, block]));
    let currentId = fn.blocks[0]?.id;

    while (currentId !== undefined) {
      if (!this.checkLimits(currentId)) {
        return undefined;
      }

      const block = blocks.get(currentId);
      if (block === undefined) {
        this.runtimeError(`MIR block '${currentId}' was not found.`, fn.id, {
          code: "ANPL_RUNTIME_UNEXPECTED_VALUE",
          expected: "known MIR block",
          received: currentId,
          cause: "MIR control flow jumped to a block that is not present in the function.",
          fix: "Inspect MIR lowering or optimizer output for an invalid jump target."
        });
        return undefined;
      }

      this.executeBlock(block, env, registers);
      if (this.diagnostics.length > 0) {
        return undefined;
      }

      const next = this.executeTerminator(block.terminator, registers);
      if (next.kind === "return") {
        return next.value;
      }
      currentId = next.target;
    }

    return undefined;
  }

  private executeBlock(
    block: MirBlock,
    env: Environment,
    registers: RegisterFile
  ): void {
    for (const instruction of block.instructions) {
      if (!this.checkLimits(instruction.op)) {
        return;
      }

      this.executeInstruction(instruction, env, registers);
      if (this.diagnostics.length > 0) {
        return;
      }
    }
  }

  private executeInstruction(
    instruction: MirInstruction,
    env: Environment,
    registers: RegisterFile
  ): void {
    switch (instruction.op) {
      case "const":
        this.setRegister(
          registers,
          instruction.target,
          runtimeValueFromLiteral(normalizeLiteral(instruction.value))
        );
        return;
      case "load": {
        const value = env.get(instruction.symbol);
        if (value === undefined) {
          this.runtimeError(`Variable '${instruction.symbol}' is not defined.`, instruction.symbol, {
            code: "ANPL_RUNTIME_UNDEFINED_VALUE",
            expected: "defined runtime value",
            received: "undefined",
            cause: "MIR attempted to load a local value that has not been stored.",
            fix: "Ensure MIR lowering stores the local before any load instruction."
          });
          this.setRegister(registers, instruction.target, runtimeNull());
          return;
        }
        this.setRegister(registers, instruction.target, value);
        return;
      }
      case "store":
        this.setLocal(env, instruction.symbol, this.readRegister(registers, instruction.value));
        return;
      case "binary":
        this.setRegister(
          registers,
          instruction.target,
          this.applyBinary(
            instruction.operator,
            this.readRegister(registers, instruction.left),
            this.readRegister(registers, instruction.right)
          )
        );
        return;
      case "call": {
        const args = instruction.args.map((arg) => this.readRegister(registers, arg));
        const value = this.callTarget(instruction.callee, args);
        if (instruction.target !== undefined) {
          this.setRegister(registers, instruction.target, value ?? runtimeNull());
        }
        return;
      }
      case "record": {
        const fields = new Map<string, RuntimeValue>();
        for (const [field, value] of Object.entries(instruction.fields)) {
          fields.set(field, this.readRegister(registers, value));
        }
        this.setRegister(registers, instruction.target, runtimeRecord(instruction.type, fields));
        return;
      }
      case "member": {
        const object = this.readRegister(registers, instruction.object);
        if (object.kind === "record") {
          this.setRegister(
            registers,
            instruction.target,
            object.fields.get(instruction.field) ?? runtimeNull()
          );
          return;
        }
        this.runtimeError(
          `Cannot read property '${instruction.field}' on ${runtimeTypeName(object)}.`,
          instruction.field,
          {
            code: "ANPL_RUNTIME_INVALID_MEMBER_ACCESS",
            expected: "record",
            received: runtimeTypeName(object),
            cause: "MIR member access requires a record runtime value.",
            fix: "Check semantic typing or MIR lowering for the member expression."
          }
        );
        this.setRegister(registers, instruction.target, runtimeNull());
        return;
      }
    }
  }

  private executeTerminator(
    terminator: MirTerminator,
    registers: RegisterFile
  ): { kind: "return"; value?: RuntimeValue } | { kind: "next"; target: string } {
    if (!this.checkLimits("terminator")) {
      return { kind: "return" };
    }

    switch (terminator.kind) {
      case "return":
        return {
          kind: "return",
          value:
            terminator.value === undefined
              ? undefined
              : this.readRegister(registers, terminator.value)
        };
      case "jump":
        return {
          kind: "next",
          target: terminator.target
        };
      case "branch": {
        const condition = this.readRegister(registers, terminator.condition);
        const conditionValue = runtimeToBool(condition);
        if (conditionValue === undefined) {
          this.runtimeError(
            `If condition must be bool, received ${runtimeTypeName(condition)}.`,
            "if",
            {
              code: "ANPL_RUNTIME_INVALID_CONDITION",
              expected: "bool",
              received: runtimeTypeName(condition),
              cause: "MIR branch terminators require a boolean condition value.",
              fix: "Ensure the branch condition lowers from a bool expression."
            }
          );
          return {
            kind: "return"
          };
        }

        return {
          kind: "next",
          target: conditionValue ? terminator.thenBlock : terminator.elseBlock
        };
      }
    }
  }

  private callTarget(callee: string, args: RuntimeValue[]): RuntimeValue | undefined {
    if (!this.checkLimits(callee)) {
      return runtimeNull();
    }

    const builtin = this.host.builtins[callee];
    if (builtin !== undefined) {
      const effect = this.host.builtinEffects[callee];
      if (effect !== undefined && !isEffectAllowed(this.host.sandbox, effect)) {
        this.runtimeError(
          `Builtin '${callee}' requires blocked effect '${effect}'.`,
          callee,
          {
            code: "ANPL_RUNTIME_EFFECT_BLOCKED",
            expected: effect,
            received: "blocked",
            cause: "The builtin requires a capability that is not allowed by the runtime sandbox.",
            fix: "Allow the required effect in the sandbox policy or avoid the builtin."
          }
        );
        return runtimeNull();
      }
      return builtin(...args);
    }

    const fn = this.functions.get(callee);
    if (fn === undefined) {
      this.runtimeError(`Function '${callee}' is not defined.`, callee, {
        code: "ANPL_RUNTIME_FUNCTION_NOT_FOUND",
        expected: "runtime function",
        received: "missing",
        cause: "A MIR call target did not resolve to a runtime function.",
        fix: "Check the callee symbol, imports, and module-qualified MIR IDs."
      });
      return runtimeNull();
    }

    return this.callFunction(fn, args) ?? runtimeNull();
  }

  private resolveEntry(entry: string): MirFunction | undefined {
    if (entry.includes(".")) {
      return this.functions.get(entry);
    }

    const matches = [...this.functions.values()].filter((fn) => functionNameForSymbol(fn.id) === entry);
    if (matches.length === 1) {
      return matches[0];
    }

    if (matches.length > 1) {
      this.runtimeError(
        `Entry function '${entry}' is ambiguous. Use a module-qualified entry name.`,
        entry,
        {
          code: "ANPL_RUNTIME_ENTRY_AMBIGUOUS",
          expected: "single entry function",
          received: `${matches.length} candidates`,
          cause: "More than one MIR function has the requested unqualified entry name.",
          fix: "Use a module-qualified entry such as module.main."
        }
      );
    }

    return undefined;
  }

  private readRegister(registers: RegisterFile, name: string): RuntimeValue {
    const value = registers.get(name);
    if (value === undefined) {
      this.runtimeError(`MIR value '${name}' is not defined.`, name, {
        code: "ANPL_RUNTIME_UNDEFINED_VALUE",
        expected: "defined MIR register",
        received: "undefined",
        cause: "A MIR instruction attempted to read a register before it was written.",
        fix: "Inspect MIR lowering or optimizer output for invalid register ordering."
      });
      return runtimeNull();
    }
    return value;
  }

  private setRegister(registers: RegisterFile, name: string, value: RuntimeValue): void {
    registers.set(name, value);
    this.trackValue(value, name);
  }

  private setLocal(env: Environment, name: string, value: RuntimeValue): void {
    env.set(name, value);
    this.trackValue(value, name);
  }

  private trackValue(value: RuntimeValue, symbol: string): void {
    if (this.diagnostics.length > 0) {
      return;
    }

    const violation = trackRuntimeValue(this.host, value);
    if (violation !== undefined) {
      this.runtimeError(violation.message, symbol, {
        code: "ANPL_RUNTIME_LIMIT_EXCEEDED",
        expected: violation.expected,
        received: violation.received,
        cause:
          violation.kind === "memory"
            ? "Runtime memory estimate exceeded the sandbox policy."
            : "Runtime execution exceeded the sandbox time policy.",
        fix:
          violation.kind === "memory"
            ? "Increase maxMemoryMb or reduce allocated runtime values."
            : "Increase maxExecutionMs or simplify the executed program."
      });
    }
  }

  private checkLimits(symbol: string): boolean {
    if (this.diagnostics.length > 0) {
      return false;
    }

    const violation = checkRuntimeLimits(this.host);
    if (violation === undefined) {
      return true;
    }

    this.runtimeError(violation.message, symbol, {
      code: "ANPL_RUNTIME_LIMIT_EXCEEDED",
      expected: violation.expected,
      received: violation.received,
      cause:
        violation.kind === "memory"
          ? "Runtime memory estimate exceeded the sandbox policy."
          : "Runtime execution exceeded the sandbox time policy.",
      fix:
        violation.kind === "memory"
          ? "Increase maxMemoryMb or reduce allocated runtime values."
          : "Increase maxExecutionMs or simplify the executed program."
    });
    return false;
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
              code: "ANPL_RUNTIME_UNEXPECTED_VALUE",
              expected: "number",
              received: `${runtimeTypeName(left)}, ${runtimeTypeName(right)}`,
              cause: "A numeric MIR operator received a non-numeric runtime value.",
              fix: "Check semantic typing or MIR lowering for the binary expression."
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
              code: "ANPL_RUNTIME_UNEXPECTED_VALUE",
              expected: "number",
              received: `${runtimeTypeName(left)}, ${runtimeTypeName(right)}`,
              cause: "A comparison MIR operator received a non-numeric runtime value.",
              fix: "Check semantic typing or MIR lowering for the comparison expression."
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
              code: "ANPL_RUNTIME_UNEXPECTED_VALUE",
              expected: "bool",
              received: `${runtimeTypeName(left)}, ${runtimeTypeName(right)}`,
              cause: "A boolean MIR operator received a non-boolean runtime value.",
              fix: "Check semantic typing or MIR lowering for the boolean expression."
            }
          );
          return runtimeNull();
        }
        return runtimeBool(operator === "and" ? leftBool && rightBool : leftBool || rightBool);
      }
      default:
        this.runtimeError(`Unknown binary operator '${operator}'.`, operator, {
          code: "ANPL_RUNTIME_UNEXPECTED_VALUE",
          expected: "known binary operator",
          received: operator,
          cause: "The MIR runtime reached an operator that is not implemented.",
          fix: "Lower only supported ANPL binary operators into MIR."
        });
        return runtimeNull();
    }
  }

  private runtimeError(
    message: string,
    symbol?: string,
    detail: RuntimeDiagnosticDetail = {}
  ): void {
    this.diagnostics.push(
      createDiagnostic({
        code: detail.code ?? "ANPL_RUNTIME_ERROR",
        severity: "error",
        category: "runtime",
        message,
        symbol,
        expected: detail.expected,
        received: detail.received,
        evidence: detail.evidence ?? this.host.frames.map((frame) => `at ${frame.function}`),
        cause: detail.cause ?? "Runtime evaluation reached an invalid value or blocked capability.",
        fix: detail.fix ?? "Inspect the runtime stack and repair the failing expression or sandbox policy.",
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

function normalizeLiteral(value: unknown): string | number | boolean | null {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  return null;
}

function mirLocalSymbol(fn: MirFunction, name: string): string {
  return `${fn.id}.${name}`;
}

function moduleNameForSymbol(symbol: string): string | undefined {
  const index = symbol.lastIndexOf(".");
  return index === -1 ? undefined : symbol.slice(0, index);
}

function functionNameForSymbol(symbol: string): string {
  const index = symbol.lastIndexOf(".");
  return index === -1 ? symbol : symbol.slice(index + 1);
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
