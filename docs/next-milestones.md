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

Diagnostics already have a structured shape, but many phases can provide richer
repair context.

Next work:

- Add `cause`, `fix`, and `evidence` consistently to parser, semantic, runtime,
  and CLI diagnostics.
- Keep diagnostic codes stable and machine-readable.
- Add tests that assert diagnostic shape, not only diagnostic code.
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

The current executable IR is a structured expression IR, while MIR now has a
production-style optimizer pass contract.

Implemented foundation:

- `optimizeMir(program, passes)` with diagnostics, changed metadata, and pass
  results.
- Starter MIR passes for constant folding, copy propagation, dead branch
  removal, and unused local elimination.

Next work:

- Document the current structured ANPL IR v0.1 contract.
- Lower real function bodies into MIR instructions instead of MIR shells.
- Move interpreter and JavaScript backend input from structured IR to HIR/MIR.
- Keep AST-to-IR/HIR/MIR lowering deterministic and easy for AI tools to
  inspect.
