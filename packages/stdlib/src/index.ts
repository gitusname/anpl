import type { Effect, RuntimeBuiltin } from "@anpl/runtime";

export type StdlibModule = {
  name: string;
  builtins: Record<string, RuntimeBuiltin>;
  effects: Effect[];
};

export const coreStdlibModule: StdlibModule = {
  name: "anpl.core",
  effects: ["time.now", "random.uuid", "console.print"],
  builtins: {
    uuid: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
    print: (value) => {
      console.log(value);
      return null;
    },
    len: (value) => {
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

export function listStdlibModules(): StdlibModule[] {
  return [coreStdlibModule];
}
