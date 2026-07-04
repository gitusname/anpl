import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@anpl/ast": new URL("./packages/ast/src/index.ts", import.meta.url).pathname,
      "@anpl/compiler-js": new URL(
        "./packages/compiler-js/src/index.ts",
        import.meta.url
      ).pathname,
      "@anpl/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@anpl/diagnostics": new URL(
        "./packages/diagnostics/src/index.ts",
        import.meta.url
      ).pathname,
      "@anpl/interpreter": new URL(
        "./packages/interpreter/src/index.ts",
        import.meta.url
      ).pathname,
      "@anpl/ir": new URL("./packages/ir/src/index.ts", import.meta.url).pathname,
      "@anpl/lexer": new URL("./packages/lexer/src/index.ts", import.meta.url).pathname,
      "@anpl/optimizer": new URL(
        "./packages/optimizer/src/index.ts",
        import.meta.url
      ).pathname,
      "@anpl/parser": new URL("./packages/parser/src/index.ts", import.meta.url).pathname,
      "@anpl/runtime": new URL(
        "./packages/runtime/src/index.ts",
        import.meta.url
      ).pathname,
      "@anpl/semantic": new URL(
        "./packages/semantic/src/index.ts",
        import.meta.url
      ).pathname
    }
  },
  test: {
    include: ["tests/**/*.test.ts", "packages/**/*.test.ts"]
  }
});
