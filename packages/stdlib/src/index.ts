import type { Effect, RuntimeBuiltin, RuntimeValue } from "@anpl/runtime";
import {
  runtimeInt,
  runtimeNull,
  runtimeText,
  runtimeUuid,
  runtimeValueToDisplay
} from "@anpl/runtime";

export type StdlibModule = {
  name: string;
  builtins: Record<string, RuntimeBuiltin>;
  effects: Effect[];
};

export const coreStdlibModule: StdlibModule = {
  name: "anpl.core",
  effects: ["time.now", "random.uuid", "console.print"],
  builtins: {
    uuid: () => runtimeUuid(crypto.randomUUID()),
    now: () => runtimeText(new Date().toISOString()),
    print: (value) => {
      console.log(runtimeValueToDisplay(value));
      return runtimeNull();
    },
    len: (value) => runtimeInt(stdlibLength(value))
  }
};

export function listStdlibModules(): StdlibModule[] {
  return [coreStdlibModule];
}

function stdlibLength(value: RuntimeValue): number {
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
