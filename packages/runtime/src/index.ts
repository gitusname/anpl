import type { Span } from "@anpl/core";
import type { SymbolId } from "@anpl/symbols";
import type { TypeId } from "@anpl/types";

export type RuntimeValue =
  | { kind: "int"; value: number }
  | { kind: "decimal"; value: number }
  | { kind: "text"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "uuid"; value: string }
  | { kind: "null" }
  | { kind: "record"; type: TypeId | string; fields: Map<string, RuntimeValue> }
  | { kind: "list"; values: RuntimeValue[] }
  | { kind: "function"; symbol: SymbolId };

export type RuntimeFrame = {
  function: SymbolId | string;
  module?: string;
  span?: Span;
};

export type RuntimeError = {
  code: "ANPL_RUNTIME_ERROR";
  message: string;
  stack: RuntimeFrame[];
  span?: Span;
  cause?: string;
  fix?: string;
};

export type Effect =
  | "io.read"
  | "io.write"
  | "net.request"
  | "db.read"
  | "db.write"
  | "time.now"
  | "random.uuid"
  | "console.print";

export type SandboxPolicy = {
  allowFileSystem: boolean;
  allowNetwork: boolean;
  allowProcess: boolean;
  maxExecutionMs: number;
  maxMemoryMb: number;
  allowedEffects: Effect[];
};

export const defaultSandboxPolicy: SandboxPolicy = {
  allowFileSystem: false,
  allowNetwork: false,
  allowProcess: false,
  maxExecutionMs: 3000,
  maxMemoryMb: 128,
  allowedEffects: ["time.now", "random.uuid", "console.print"]
};

export type RuntimeBuiltin = (...args: RuntimeValue[]) => RuntimeValue;

export type RuntimeHost = {
  builtins: Record<string, RuntimeBuiltin>;
  builtinEffects: Record<string, Effect>;
  output: string[];
  sandbox: SandboxPolicy;
  frames: RuntimeFrame[];
  startedAtMs: number;
  now(): number;
  memory: RuntimeMemoryState;
};

export type RuntimeMemoryState = {
  allocatedBytes: number;
};

export type RuntimeHostOptions = {
  now?: () => number;
  startedAtMs?: number;
};

export type RuntimeLimitViolation = {
  kind: "timeout" | "memory";
  message: string;
  expected: string;
  received: string;
};

export function createRuntimeHost(
  policy: Partial<SandboxPolicy> = {},
  options: RuntimeHostOptions = {}
): RuntimeHost {
  const output: string[] = [];
  const sandbox = mergeSandboxPolicy(policy);
  const now = options.now ?? (() => Date.now());

  return {
    output,
    sandbox,
    frames: [],
    startedAtMs: options.startedAtMs ?? now(),
    now,
    memory: {
      allocatedBytes: 0
    },
    builtinEffects: {
      uuid: "random.uuid",
      now: "time.now",
      print: "console.print"
    },
    builtins: {
      uuid: () => runtimeUuid(crypto.randomUUID()),
      now: () => runtimeText(new Date().toISOString()),
      print: (value: RuntimeValue) => {
        output.push(runtimeValueToDisplay(value));
        return runtimeNull();
      },
      len: (value: RuntimeValue) => runtimeInt(runtimeLength(value))
    }
  };
}

export function mergeSandboxPolicy(policy: Partial<SandboxPolicy>): SandboxPolicy {
  return {
    ...defaultSandboxPolicy,
    ...policy,
    allowedEffects: policy.allowedEffects ?? defaultSandboxPolicy.allowedEffects
  };
}

export function isEffectAllowed(policy: SandboxPolicy, effect: Effect): boolean {
  if (effect.startsWith("io.")) {
    return policy.allowFileSystem && policy.allowedEffects.includes(effect);
  }
  if (effect === "net.request") {
    return policy.allowNetwork && policy.allowedEffects.includes(effect);
  }
  return policy.allowedEffects.includes(effect);
}

export function checkRuntimeLimits(host: RuntimeHost): RuntimeLimitViolation | undefined {
  const elapsedMs = Math.max(0, host.now() - host.startedAtMs);
  if (elapsedMs > host.sandbox.maxExecutionMs) {
    return {
      kind: "timeout",
      message: `Runtime execution exceeded ${host.sandbox.maxExecutionMs}ms.`,
      expected: `<= ${host.sandbox.maxExecutionMs}ms`,
      received: `${elapsedMs}ms`
    };
  }

  const maxBytes = host.sandbox.maxMemoryMb * 1024 * 1024;
  if (host.memory.allocatedBytes > maxBytes) {
    return {
      kind: "memory",
      message: `Runtime memory estimate exceeded ${host.sandbox.maxMemoryMb}MB.`,
      expected: `<= ${host.sandbox.maxMemoryMb}MB`,
      received: `${host.memory.allocatedBytes} bytes`
    };
  }

  return undefined;
}

export function trackRuntimeValue(
  host: RuntimeHost,
  value: RuntimeValue
): RuntimeLimitViolation | undefined {
  host.memory.allocatedBytes += estimateRuntimeValueBytes(value);
  return checkRuntimeLimits(host);
}

export function runtimeValueFromLiteral(
  value: string | number | boolean | null
): RuntimeValue {
  if (typeof value === "number") {
    return Number.isInteger(value) ? runtimeInt(value) : runtimeDecimal(value);
  }
  if (typeof value === "string") {
    return runtimeText(value);
  }
  if (typeof value === "boolean") {
    return runtimeBool(value);
  }
  return runtimeNull();
}

export function runtimeInt(value: number): RuntimeValue {
  return { kind: "int", value };
}

export function runtimeDecimal(value: number): RuntimeValue {
  return { kind: "decimal", value };
}

export function runtimeText(value: string): RuntimeValue {
  return { kind: "text", value };
}

export function runtimeBool(value: boolean): RuntimeValue {
  return { kind: "bool", value };
}

export function runtimeUuid(value: string): RuntimeValue {
  return { kind: "uuid", value };
}

export function runtimeNull(): RuntimeValue {
  return { kind: "null" };
}

export function runtimeRecord(
  type: TypeId | string,
  fields: Map<string, RuntimeValue>
): RuntimeValue {
  return { kind: "record", type, fields };
}

export function runtimeList(values: RuntimeValue[]): RuntimeValue {
  return { kind: "list", values };
}

export function runtimeFunction(symbol: SymbolId): RuntimeValue {
  return { kind: "function", symbol };
}

export function runtimeValueToDisplay(value: RuntimeValue | undefined): string {
  if (value === undefined) {
    return "void";
  }

  switch (value.kind) {
    case "int":
    case "decimal":
      return String(value.value);
    case "text":
    case "uuid":
      return value.value;
    case "bool":
      return String(value.value);
    case "null":
      return "null";
    case "list":
      return `[${value.values.map(runtimeValueToDisplay).join(", ")}]`;
    case "record":
      return `{ ${[...value.fields.entries()]
        .map(([field, fieldValue]) => `${field}: ${runtimeValueToDisplay(fieldValue)}`)
        .join(", ")} }`;
    case "function":
      return `<function ${value.symbol}>`;
  }
}

export function runtimeValueToJs(value: RuntimeValue | undefined): unknown {
  if (value === undefined) {
    return undefined;
  }

  switch (value.kind) {
    case "int":
    case "decimal":
    case "text":
    case "bool":
    case "uuid":
      return value.value;
    case "null":
      return null;
    case "list":
      return value.values.map(runtimeValueToJs);
    case "record":
      return Object.fromEntries(
        [...value.fields.entries()].map(([field, fieldValue]) => [
          field,
          runtimeValueToJs(fieldValue)
        ])
      );
    case "function":
      return value.symbol;
  }
}

export function runtimeTypeName(value: RuntimeValue | undefined): string {
  return value?.kind ?? "void";
}

export function runtimeToNumber(value: RuntimeValue): number | undefined {
  if (value.kind === "int" || value.kind === "decimal") {
    return value.value;
  }
  return undefined;
}

export function runtimeToBool(value: RuntimeValue): boolean | undefined {
  if (value.kind === "bool") {
    return value.value;
  }
  return undefined;
}

export function runtimeEquals(left: RuntimeValue, right: RuntimeValue): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  switch (left.kind) {
    case "int":
    case "decimal":
    case "text":
    case "bool":
    case "uuid":
      return left.value === (right as typeof left).value;
    case "null":
      return true;
    case "function":
      return left.symbol === (right as typeof left).symbol;
    case "list":
    case "record":
      return left === right;
  }
}

function runtimeLength(value: RuntimeValue): number {
  switch (value.kind) {
    case "text":
    case "uuid":
      return value.value.length;
    case "list":
      return value.values.length;
    case "record":
      return value.fields.size;
    default:
      return 0;
  }
}

function estimateRuntimeValueBytes(value: RuntimeValue): number {
  switch (value.kind) {
    case "int":
    case "decimal":
      return 16;
    case "bool":
    case "null":
      return 8;
    case "text":
    case "uuid":
      return 24 + value.value.length * 2;
    case "function":
      return 24 + value.symbol.length * 2;
    case "list":
      return 32 + value.values.reduce((sum, item) => sum + estimateRuntimeValueBytes(item), 0);
    case "record":
      return (
        48 +
        [...value.fields.entries()].reduce(
          (sum, [field, fieldValue]) =>
            sum + field.length * 2 + estimateRuntimeValueBytes(fieldValue),
          0
        )
      );
  }
}
