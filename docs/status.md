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
- HIR lowering with module import metadata, MIR lowering for function bodies,
  statements, expressions, locals, calls, records, members, returns, and
  conditional control-flow blocks, plus the current structured ANPL IR v0.1
  lowering from AST.
- Optimizer support for the current structured IR plus a MIR optimization pass
  architecture with constant folding, copy propagation, dead branch removal, and
  unused local elimination foundations.
- MIR interpreter support for `main()`, functions, `let`, `return`, `if`, records,
  member access, calls, basic operators, tagged runtime values, runtime stack
  evidence, sandbox effect checks, runtime built-ins, and module-qualified
  function lookup.
- JavaScript compiler target for MIR with module namespace output.
- Runtime built-ins: `uuid()`, `now()`, `print(value)`, and `len(value)`, all
  using tagged runtime values.
- CLI commands: `init`, `check`, `run`, `build`, `emit-ast`, `emit-hir`,
  `emit-mir`, `emit-ir` compatibility alias, `format`, `diagnose`,
  `benchmark`, and `explain`.
- Structured diagnostic primitives with codes, severity, location data,
  categories, expected/received values, cause/fix hints, evidence, repair patch
  slots, and confidence.
- Diagnostic registry enrichment for machine-readable JSON output and diagnostic
  code explanations.
- Canonical AST formatter foundation.
- Initial conformance fixture suite with valid programs, invalid diagnostic
  expectations, MIR execution checks, and a MIR golden snapshot.
- Offline benchmark fixture suite in `packages/benchmark` with 11 tasks, direct
  TypeScript fixture comparison, ANPL-first parse/semantic/build/run metrics,
  diagnostic token counts, generated-target token counts, and CLI
  `anpl benchmark`.

## Experimental

- The language syntax is intentionally small and may evolve.
- HIR and MIR now model real function bodies, and `run` plus JavaScript `build`
  execute through MIR.
- MIR optimization passes operate on the MIR shape and MIR lowering is
  deterministic, but deeper MIR-to-source mapping and source maps are still
  future work.
- Module imports work across files discovered from `anpl.json` source patterns,
  but ANPL does not yet have package boundaries or external dependency
  resolution.
- JavaScript output has module namespacing and MIR block lowering, but it does
  not yet implement source maps, target runtime policy, or ESM-per-module
  output.
- Runtime has tagged values and effect checks, but execution timeout and memory
  limits are not enforced yet.
- The formatter is deterministic for the current AST surface, but comment/trivia
  preservation is still future work.
- Diagnostic registry entries provide baseline cause/fix templates, but parser,
  semantic, runtime, and backend phases still need more specific evidence and
  repair suggestions at each call site.
- The `diagnose` CLI command enriches simple heuristic log classifications, but
  it is not yet a full AI-optimized error compression system.
- Benchmark utilities are offline fixtures; they do not yet prove real model
  success rate, provider-specific repair loop reduction, or production build
  reliability on large projects.
- Conformance coverage is still small; it is a starting suite, not yet a full
  language compatibility matrix or fuzzing system.

## Planned

- Package boundaries and external dependency resolution.
- Deeper module namespace model for type IDs, HIR/MIR, emitted source maps, and
  multi-package projects.
- Phase-specific repair patches and evidence across parser, semantic, runtime,
  and backend diagnostics.
- Runtime execution timeout/memory enforcement and deeper module instance model.
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
