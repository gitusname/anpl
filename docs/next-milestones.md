# ANPL Next Milestones

These milestones focus on making ANPL a stronger machine-first programming
language for AI coding tools without drifting back into CRUD-generator or
schema-generator territory.

## 1. Module Namespace Fix

The first function-level namespace fix is implemented: semantic results expose
module-aware symbols, structured IR records qualified function names, the
interpreter resolves module-qualified calls, and JavaScript output uses
`__anpl_modules`.

Next hardening work:

- Carry module-qualified type IDs through HIR and MIR.
- Extend namespace handling from same-project cross-file modules to
  multi-package projects.
- Decide whether emitted JavaScript should stay object-namespaced or become
  one ESM file per ANPL module.
- Add more collision tests for types, imported symbols, and multiple `main`
  functions.

## 2. Canonical Formatter

The grammar document defines canonical formatting as a future requirement for
stable AI repair loops.

Implemented foundation:

- Add `anpl format file.anpl`.
- Produce one stable formatted representation for any valid ANPL program.
- Keep nested block indentation stable across parse -> format -> parse ->
  format loops.
- Cover current valid conformance fixtures with formatter idempotency tests.

Next work:

- Preserve semantic meaning while normalizing whitespace and separators.
- Add broader formatter snapshots for nested expressions and future syntax.
- Preserve comments/trivia once CST trivia is wired into the parser.

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

Next work:

- Add package boundaries and external dependency resolution.
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

Next work:

- Add phase-specific `cause`, `fix`, `evidence`, and `repair` consistently to
  parser, semantic, runtime, backend, and project diagnostics.
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
- Starter MIR passes for constant folding, copy propagation, dead branch
  removal, and unused local elimination.

Next work:

- Document the current structured ANPL IR v0.1 contract.
- Add MIR-to-JavaScript source maps and target runtime policy.
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

Next work:

- Add parser, AST, HIR, MIR, JavaScript, and diagnostic snapshots for every
  valid/invalid fixture.
- Add broader CLI integration conformance tests.
- Broaden formatter idempotency coverage as new valid fixtures are added.
- Add parser robustness and recovery tests.
