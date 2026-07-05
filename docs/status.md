# ANPL Project Status

ANPL is an experimental machine-first programming language for AI coding tools.

The current repository is best described as a v0.1 seed language: it has a small
but real compiler pipeline, while many research claims and production features
remain planned.

## Implemented

- Monorepo packages for `core`, `source`, `project`, `lexer`, `syntax`, `ast`,
  `parser`, `formatter`, `symbols`, `types`, `semantic`, `hir`, `mir`, `ir`,
  `optimizer`, `interpreter`, `compiler-js`, `runtime`, `diagnostics`,
  `stdlib`, `compiler`, `cli`, `lsp`, `benchmark`, and `testkit`.
- Lexer with keywords, identifiers, numbers, strings, comments, operators,
  newline tokens, EOF tokens, and source spans.
- AST model for modules, imports, type declarations, fields, functions,
  parameters, blocks, statements, expressions, calls, records, members, and type
  references.
- Parser for the ANPL v0.1 grammar documented in
  [Grammar v0.1](./grammar-v0.1.md).
- Compiler facade with host abstraction, timings, artifacts, and CLI delegation
  through `compileProject`.
- Source file hashing and line map primitives.
- Project manifest loading, source glob discovery, cross-file source loading,
  and same-project module graph primitives.
- Semantic analyzer split into early production passes for module collection,
  declaration collection, import resolution, type checks, expression checks,
  module-aware symbol tables, type registry output, and structured diagnostics.
- HIR and MIR package foundations, plus the current structured ANPL IR v0.1
  lowering from AST.
- Optimizer support for the current structured IR plus a MIR optimization pass
  architecture with constant folding, copy propagation, dead branch removal, and
  unused local elimination foundations.
- Interpreter support for `main()`, functions, `let`, `return`, `if`, records,
  member access, calls, basic operators, runtime built-ins, and module-qualified
  function lookup.
- JavaScript compiler target for the current structured IR with module namespace
  output.
- Runtime built-ins: `uuid()`, `now()`, `print(value)`, and `len(value)`.
- CLI commands: `check`, `run`, `build`, `emit-ast`, `emit-hir`, `emit-mir`,
  `emit-ir` compatibility alias, `format`, `diagnose`, and `explain`.
- Structured diagnostic primitives with codes, severity, location data,
  categories, expected/received values, cause/fix hints, evidence, repair patch
  slots, and confidence.
- Diagnostic registry enrichment for machine-readable JSON output and diagnostic
  code explanations.
- Canonical AST formatter foundation.
- Initial source-size comparison utilities in `packages/benchmark`.

## Experimental

- The language syntax is intentionally small and may evolve.
- HIR and MIR are early structural foundations; executable lowering still uses
  the current structured expression IR.
- MIR optimization passes operate on the MIR shape, but MIR lowering is still
  skeletal and not yet the executable backend input.
- Module imports work across files discovered from `anpl.json` source patterns,
  but ANPL does not yet have package boundaries or external dependency
  resolution.
- JavaScript output has module namespacing, but it does not yet implement source
  maps, target runtime policy, or ESM-per-module output.
- The formatter is deterministic for the current AST surface, but comment/trivia
  preservation is still future work.
- Diagnostic registry entries provide baseline cause/fix templates, but parser,
  semantic, runtime, and backend phases still need more specific evidence and
  repair suggestions at each call site.
- The `diagnose` CLI command enriches simple heuristic log classifications, but
  it is not yet a full AI-optimized error compression system.
- Benchmark utilities currently measure source-size style metrics only; they do
  not yet prove model success rate, repair loop reduction, or production build
  reliability.

## Planned

- Package boundaries and external dependency resolution.
- Deeper module namespace model for type IDs, HIR/MIR, emitted source maps, and
  multi-package projects.
- Phase-specific repair patches and evidence across parser, semantic, runtime,
  and backend diagnostics.
- Real benchmark suite comparing direct human-first target code generation with
  human intent -> ANPL -> compiler flows.
- Expanded type system and effect model.
- Additional compiler targets such as TypeScript, Python, WASM, or LLVM.
- More complete runtime and standard library primitives.

## Removed Legacy Scaffolding

These retired early scaffolding packages were removed from the active workspace:

- `validator`
- `normalizer`
- `generator-prisma`

They are preserved only in Git history while the project direction settles
around the compiler pipeline.

Do not reintroduce or expand these packages. Do not add CRUD, Prisma, NestJS,
schema-generator, or backend-generator work unless it is explicitly framed as a
temporary compiler target and does not define ANPL's identity.
