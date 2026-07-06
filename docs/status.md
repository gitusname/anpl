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
  newline tokens, EOF tokens, source spans, and token trivia for comments plus
  whitespace.
- AST model for modules, imports, type declarations, fields, functions,
  parameters, blocks, statements, expressions, calls, records, members, and type
  references.
- Parser for the ANPL v0.1 grammar documented in
  [Grammar v0.1](./grammar-v0.1.md), with nested CST output, token
  interleaving, and parser recovery metadata attached to parse results.
- Compiler facade with host abstraction, timings, artifacts, and CLI delegation
  through `compileProject`.
- Source file hashing and line map primitives.
- Project manifest loading, source glob discovery, cross-file source loading,
  path-based external package dependencies, invalid manifest/source diagnostics,
  source-hash cache keys, and package-aware module graph primitives.
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
  evidence, sandbox effect checks, timeout checks, estimated memory checks,
  runtime built-ins, and module-qualified function lookup.
- JavaScript and TypeScript compiler targets for MIR with module namespace output.
- JavaScript and TypeScript backend source-map artifacts mapping generated module
  functions, MIR blocks, MIR instructions, and MIR terminators back to ANPL
  source spans.
- Generated JavaScript and TypeScript runtime policy guards for built-in effects,
  execution timeout checks, and estimated emitted-code memory accounting,
  configured through the compiler facade and backend context.
- Runtime built-ins: `uuid()`, `now()`, `print(value)`, and `len(value)`, all
  using tagged runtime values.
- CLI commands: `init`, `check`, `run`, `build`, `emit ast|hir|mir|ir`,
  `emit-ast`, `emit-hir`, `emit-mir`, `emit-ir` compatibility aliases,
  `format`, `diagnose`, `benchmark`, and `explain`.
- Structured diagnostic primitives with codes, severity, location data,
  categories, expected/received values, cause/fix hints, evidence, repair patch
  slots, and confidence.
- Diagnostic registry enrichment for machine-readable JSON output and diagnostic
  code explanations, including the current semantic diagnostic family.
- Parser expected-token diagnostics include insert repair patches for missing
  punctuation, and semantic diagnostics include phase-specific cause, fix, and
  evidence metadata.
- Canonical AST formatter with stable nested block indentation and fixture-level
  idempotency conformance over valid programs.
- Initial conformance fixture suite with valid programs, invalid diagnostic
  expectations, MIR execution checks, and a MIR golden snapshot.
- Offline benchmark fixture suite in `packages/benchmark` with 11 tasks, direct
  TypeScript fixture comparison, ANPL-first parse/semantic/build/run metrics,
  diagnostic token counts, generated-target token counts, and CLI
  `anpl benchmark`.

## Experimental

- The language syntax is intentionally small and may evolve.
- CST output now includes a nested AST-shaped skeleton with interleaved tokens
  and parser synchronization recovery metadata; punctuation-complete CST
  shaping and comment-preserving formatter integration are still future work.
- HIR and MIR now model real function bodies, and `run` plus JavaScript and
  TypeScript `build` execute through MIR.
- MIR optimization passes operate on the MIR shape and MIR lowering is
  deterministic, and backend builds now emit block/instruction-level
  MIR-to-source maps.
- Module imports work across files discovered from `anpl.json` source patterns
  and path-based external dependency packages. Project cache keys are derived
  from the effective manifest, external package manifests, and resolved source
  hashes.
- JavaScript and TypeScript output have module namespacing, MIR block lowering,
  function/block/instruction source-map artifacts, target runtime policy guards,
  and emitted-code memory accounting, but they do not yet implement
  ESM-per-module output.
- Runtime memory enforcement uses estimated runtime value allocation, not exact
  process heap measurement.
- The formatter is deterministic for the current AST surface, but comment/trivia
  preservation and broader CST-aware formatting are still future work.
- Diagnostic registry entries provide baseline cause/fix templates, but runtime
  and backend phases still need more specific repair suggestions at each call
  site.
- The `diagnose` CLI command enriches simple heuristic log classifications, but
  it is not yet a full AI-optimized error compression system.
- Benchmark utilities are offline fixtures; they do not yet prove real model
  success rate, provider-specific repair loop reduction, or production build
  reliability on large projects.
- Conformance coverage is still small; it is a starting suite, not yet a full
  language compatibility matrix or fuzzing system.

## Planned

- Deeper package model beyond path-based dependencies, including package
  registries, version constraints, and package-qualified imports.
- Deeper module namespace model for type IDs and HIR/MIR.
- Phase-specific repair patches and evidence across parser, semantic, runtime,
  and backend diagnostics.
- Deeper runtime module instance model and more precise memory accounting.
- Real benchmark suite comparing direct human-first target code generation with
  human intent -> ANPL -> compiler flows.
- Expanded type system and effect model.
- Additional compiler targets such as Python, WASM, or LLVM.
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
