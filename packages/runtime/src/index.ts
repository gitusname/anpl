export type RuntimeValue =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | RuntimeValue[];

export type RuntimeBuiltin = (...args: RuntimeValue[]) => RuntimeValue;

export type RuntimeHost = {
  builtins: Record<string, RuntimeBuiltin>;
  output: string[];
};

export function createRuntimeHost(): RuntimeHost {
  const output: string[] = [];

  return {
    output,
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
