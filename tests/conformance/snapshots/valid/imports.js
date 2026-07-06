const __anpl_runtime_policy = {"allowFileSystem":false,"allowNetwork":false,"allowProcess":false,"maxExecutionMs":3000,"maxMemoryMb":128,"allowedEffects":["time.now","random.uuid","console.print"]};
const __anpl_runtime_started_at = Date.now();
let __anpl_runtime_memory_bytes = 0;

function __anpl_effect_allowed(effect) {
  if (effect.startsWith("io.")) {
    return __anpl_runtime_policy.allowFileSystem && __anpl_runtime_policy.allowedEffects.includes(effect);
  }
  if (effect === "net.request") {
    return __anpl_runtime_policy.allowNetwork && __anpl_runtime_policy.allowedEffects.includes(effect);
  }
  if (effect === "process.spawn") {
    return __anpl_runtime_policy.allowProcess && __anpl_runtime_policy.allowedEffects.includes(effect);
  }
  return __anpl_runtime_policy.allowedEffects.includes(effect);
}

function __anpl_require_effect(effect, builtin) {
  if (!__anpl_effect_allowed(effect)) {
    throw new Error(`ANPL runtime policy blocked builtin '${builtin}' effect '${effect}'.`);
  }
}

function __anpl_check_runtime_limits() {
  const elapsed = Date.now() - __anpl_runtime_started_at;
  if (elapsed > __anpl_runtime_policy.maxExecutionMs) {
    throw new Error(`ANPL runtime policy exceeded maxExecutionMs ${__anpl_runtime_policy.maxExecutionMs}.`);
  }
  const maxBytes = __anpl_runtime_policy.maxMemoryMb * 1024 * 1024;
  if (__anpl_runtime_memory_bytes > maxBytes) {
    throw new Error(`ANPL runtime policy exceeded maxMemoryMb ${__anpl_runtime_policy.maxMemoryMb}.`);
  }
}

function __anpl_estimate_value_bytes(value) {
  if (typeof value === "number") return 16;
  if (typeof value === "boolean" || value === null || value === undefined) return 8;
  if (typeof value === "string") return 24 + value.length * 2;
  if (typeof value === "function") return 24;
  if (Array.isArray(value)) {
    return 32 + value.reduce((sum, item) => sum + __anpl_estimate_value_bytes(item), 0);
  }
  if (typeof value === "object") {
    return 48 + Object.entries(value).reduce(
      (sum, [key, item]) => sum + key.length * 2 + __anpl_estimate_value_bytes(item),
      0
    );
  }
  return 8;
}

function __anpl_track_value(value) {
  __anpl_runtime_memory_bytes += __anpl_estimate_value_bytes(value);
  __anpl_check_runtime_limits();
  return value;
}

function uuid() {
  __anpl_require_effect("random.uuid", "uuid");
  return crypto.randomUUID();
}

function now() {
  __anpl_require_effect("time.now", "now");
  return new Date().toISOString();
}

function print(value) {
  __anpl_require_effect("console.print", "print");
  console.log(value);
  return null;
}

function len(value) {
  if (typeof value === "string" || Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

const __anpl_modules = {};

__anpl_modules["math"] = {
  add(a, b) {
    const __locals = Object.create(null);
    const __values = Object.create(null);
    __locals["math.add.a"] = __anpl_track_value(a);
    __locals["math.add.b"] = __anpl_track_value(b);
    let __block = "math.add.entry";
    while (true) {
      __anpl_check_runtime_limits();
      switch (__block) {
        case "math.add.entry": {
          __values["%1"] = __anpl_track_value(__locals["math.add.a"]);
          __values["%2"] = __anpl_track_value(__locals["math.add.b"]);
          __values["%3"] = __anpl_track_value((__values["%1"] + __values["%2"]));
          return __values["%3"];
        }
      default:
        throw new Error(`Unknown ANPL MIR block ${__block}`);
      }
    }
  }
};

__anpl_modules["app"] = {
  main() {
    const __locals = Object.create(null);
    const __values = Object.create(null);
    let __block = "app.main.entry";
    while (true) {
      __anpl_check_runtime_limits();
      switch (__block) {
        case "app.main.entry": {
          __values["%1"] = __anpl_track_value(2);
          __values["%2"] = __anpl_track_value(3);
          __values["%3"] = __anpl_track_value(__anpl_modules["math"].add(__values["%1"], __values["%2"]));
          return __values["%3"];
        }
      default:
        throw new Error(`Unknown ANPL MIR block ${__block}`);
      }
    }
  }
};

export { __anpl_modules };
