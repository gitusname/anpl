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

Next work:

- Preserve semantic meaning while normalizing whitespace and separators.
- Add formatter tests for modules, types, functions, records, and nested
  expressions.
- Preserve comments/trivia once CST trivia is wired into the parser.

## 3. Project System Hardening

The compiler now loads `anpl.json`, expands source globs through the compiler
host, merges parsed project modules, and validates imports across source files.

Next work:

- Add project-level diagnostics for invalid manifests and unreadable source
  patterns.
- Add package boundaries and external dependency resolution.
- Add cache keys from source hashes and manifest content.
- Add CLI `anpl init` for a minimal project manifest.

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

The current benchmark package provides source-size comparison utilities only.

Next work:

- Create 10-20 small software intent tasks.
- Compare direct TypeScript/Python generation against
  human intent -> ANPL -> compiler flows.
- Measure parse success, semantic success, build success, repair loop count,
  output token usage, diagnostic compactness, and final runnable output.
- Keep benchmark claims separate from README positioning until data exists.

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
- Add formatter idempotency coverage over all valid fixtures.
- Add parser robustness and recovery tests.
