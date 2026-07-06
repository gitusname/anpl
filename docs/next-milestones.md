# ANPL Next Milestones

These milestones focus on making ANPL a stronger machine-first programming
language for AI coding tools without drifting back into CRUD-generator or
schema-generator territory.

## 1. Module Namespace Fix

The first function-level namespace fix is implemented: semantic results expose
module-aware symbols, structured IR records qualified function names, the
interpreter resolves module-qualified calls, and JavaScript output uses
`__anpl_modules` by default. JavaScript and TypeScript builds can also emit one
ESM artifact per ANPL module.

Implemented foundation:

- Carry module-qualified record type IDs through semantic analysis, HIR, and
  MIR when same-named types exist in different modules.
- Preserve imported callee resolution when another module has the same local
  function name.
- Report import conflicts when two imported modules expose the same local type
  name.
- Require module-qualified MIR entry names when multiple modules define
  `main`.
- Preserve dependency package boundaries by namespacing external modules as
  `package.module` in the compiler pipeline.
- Support package-qualified imports such as `import mathlib.math`, while keeping
  unique unqualified dependency imports working.

Next hardening work:

- Extend package-qualified type/function identities into future package
  registry/versioned dependency scenarios.
- Add more package-level collision tests for types and entry functions.
- Keep ESM runtime artifact naming reserved and collision-safe as module/package
  naming grows.

## 2. Canonical Formatter

The grammar document defines canonical formatting as a future requirement for
stable AI repair loops.

Implemented foundation:

- Add `anpl format file.anpl`.
- Produce one stable formatted representation for any valid ANPL program.
- Keep nested block indentation stable across parse -> format -> parse ->
  format loops.
- Cover current valid conformance fixtures with formatter idempotency tests.
- Preserve lexer comment/whitespace trivia on tokens for future CST-aware
  formatting.

Next work:

- Preserve semantic meaning while normalizing whitespace and separators.
- Add broader formatter snapshots for nested expressions and future syntax.
- Preserve comments in formatted output once the formatter consumes CST trivia.

## 3. Project System Hardening

The compiler now loads `anpl.json`, expands source globs through the compiler
host, merges parsed project modules, and validates imports across source files.
`anpl init` creates a minimal manifest and starter `src/main.anpl` through the
compiler/project host abstraction.

Implemented foundation:

- Return structured project diagnostics for invalid manifests, missing entries,
  missing source files, unreadable source patterns, and source read failures.
- Expose project cache metadata from the effective manifest and resolved source
  hashes through the compiler result.
- Resolve path-based external package dependencies from `anpl.json`, load their
  source files through the compiler host, preserve package boundaries on source
  files and module graph records, and mark cross-package import edges.
- Resolve package-qualified dependency imports and report ambiguous unqualified
  imports when multiple packages export the same module name.

Next work:

- Add package registries and version constraints.
- Add incremental compilation cache storage on top of the current cache key
  metadata.

## 4. Structured Diagnostic Improvements

Diagnostics now have registry enrichment, category metadata, cause/fix
templates, repair patch slots, and `anpl explain CODE`.

Implemented foundation:

- Core diagnostic repair schema.
- Registry-level diagnostic category, cause, fix, and AI-repairable metadata.
- Enriched JSON output through `diagnosticsToJson`.
- CLI `anpl explain ANPL_TYPE_MISMATCH`.
- Parser expected-token diagnostics carry insert repair patches for missing
  punctuation.
- Semantic diagnostics carry phase-specific category, cause, fix, and evidence
  through the semantic diagnostic helper.
- Diagnostic registry covers the current semantic diagnostic family used by
  `anpl explain`.

Next work:

- Add phase-specific `repair` patches to more semantic, runtime, backend, and
  project diagnostics where a safe source edit can be inferred.
- Keep diagnostic codes stable and machine-readable.
- Improve runtime diagnostics for invalid calls, invalid member access, missing
  entrypoints, and unexpected values.

## 5. Real Benchmark Suite

The benchmark package now has an offline fixture harness.

Implemented foundation:

- 11 small software intent tasks.
- Direct TypeScript fixture comparison against
  human intent -> ANPL -> compiler flows.
- Metrics for source tokens, parse success, semantic success, build success,
  run success, repair loop count, diagnostic token count, and generated target
  token count.
- CLI `anpl benchmark` with human and JSON output.

Next work:

- Add Python/direct-language fixture variants.
- Add real model/provider runs and persist benchmark result artifacts.
- Add larger multi-file tasks and package-level benchmark projects.
- Keep benchmark claims separate from README positioning until provider data
  exists.

## 6. IR Evolution

The interpreter executable path and JavaScript backend now run on MIR. MIR has
a production-style lowering shape and optimizer pass contract.

Implemented foundation:

- `optimizeMir(program, passes)` with diagnostics, changed metadata, and pass
  results.
- Import-aware HIR metadata for downstream lowering.
- MIR function-body lowering for statements, expressions, locals, calls,
  records, members, returns, jumps, and branches.
- MIR interpreter execution for `anpl run` and conformance fixture runs.
- MIR JavaScript backend execution for `anpl build` and conformance fixture
  runs.
- JavaScript and TypeScript backend source-map artifacts for MIR functions,
  blocks, instructions, and terminators.
- Generated JavaScript and TypeScript runtime policy guards for built-in effects,
  execution timeout checks, and estimated emitted-code memory accounting.
- Optional ESM-per-module JavaScript and TypeScript backend output.
- Shared `anpl-runtime.js` and `anpl-runtime.ts` helper artifacts for ESM module
  builds, imported by generated module artifacts.
- Starter MIR passes for constant folding, copy propagation, dead branch
  removal, and unused local elimination.
- Documented current structured ANPL IR, HIR, and MIR v0.1 contract in
  `docs/ir-v0.1.md`.

Next work:

- Keep AST-to-IR/HIR/MIR lowering deterministic and easy for AI tools to
  inspect.

## 7. Conformance Tests

The first conformance fixture suite is in place.

Implemented foundation:

- Valid fixtures for math, records, imports, and enum field usage.
- Invalid fixtures for return type mismatch, missing return, and unknown
  symbol diagnostics.
- MIR interpreter execution checks for runnable valid fixtures.
- MIR JavaScript execution checks for runnable valid fixtures.
- A deterministic MIR golden snapshot for the math fixture.
- Parser CST output and synchronization recovery metadata tests.
- Parser/CST, AST, HIR, MIR, and JavaScript snapshots for every current valid
  fixture.
- Parser/CST, AST, and semantic diagnostic snapshots for every current invalid
  fixture.
- Process-level CLI integration conformance tests for `init`, `check`, `run`,
  `emit`, `build`, `format`, `diagnose`, and `explain`.

Next work:

- Broaden formatter idempotency coverage as new valid fixtures are added.
- Broaden parser robustness and recovery fixture coverage.
