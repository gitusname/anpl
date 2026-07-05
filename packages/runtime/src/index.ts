export type RuntimeValue =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | RuntimeValue[];

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
  output: string[];
  sandbox: SandboxPolicy;
};

export function createRuntimeHost(): RuntimeHost {
  const output: string[] = [];

  return {
    output,
    sandbox: defaultSandboxPolicy,
    builtins: {
      uuid: () => crypto.randomUUID(),
      now: () => new Date().toISOString(),
      print: (value: RuntimeValue) => {
        output.push(String(value));
        return null;
      },
      len: (value: RuntimeValue) => {
        if (typeof value === "string" || Array.isArray(value)) {
          return value.length;
        }
        if (value !== null && typeof value === "object") {
          return Object.keys(value).length;
        }
        return 0;
      }
    }
  };
}
