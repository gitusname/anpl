# ANPL Next Milestones

These milestones focus on making ANPL a stronger machine-first programming
language for AI coding tools without drifting back into CRUD-generator or
schema-generator territory.

## 1. Module Namespace Fix

Current v0.1 lowering and execution are vulnerable to function/type name
collisions across modules.

Next work:

- Define canonical symbol IDs, for example `moduleName.symbolName`.
- Preserve module context in semantic symbols and IR.
- Update interpreter function lookup to use module-aware names.
- Update JavaScript compiler output to avoid global function/type collisions.
- Add tests for two modules that define the same function name.

## 2. Canonical Formatter

The grammar document defines canonical formatting as a future requirement for
stable AI repair loops.

Next work:

- Add `anpl format file.anpl`.
- Produce one stable formatted representation for any valid ANPL program.
- Preserve semantic meaning while normalizing whitespace and separators.
- Add formatter tests for modules, types, functions, records, and nested
  expressions.

## 3. Structured Diagnostic Improvements

Diagnostics already have a structured shape, but many phases can provide richer
repair context.

Next work:

- Add `cause`, `fix`, and `evidence` consistently to parser, semantic, runtime,
  and CLI diagnostics.
- Keep diagnostic codes stable and machine-readable.
- Add tests that assert diagnostic shape, not only diagnostic code.
- Improve runtime diagnostics for invalid calls, invalid member access, missing
  entrypoints, and unexpected values.

## 4. Real Benchmark Suite

The current benchmark package provides source-size comparison utilities only.

Next work:

- Create 10-20 small software intent tasks.
- Compare direct TypeScript/Python generation against
  human intent -> ANPL -> compiler flows.
- Measure parse success, semantic success, build success, repair loop count,
  output token usage, diagnostic compactness, and final runnable output.
- Keep benchmark claims separate from README positioning until data exists.

## 5. IR Evolution

The current IR is a structured expression IR, which is appropriate for v0.1.

Next work:

- Document the current structured ANPL IR v0.1 contract.
- Decide when a lower-level instruction or SSA-like IR is needed.
- Keep AST-to-IR lowering deterministic and easy for AI tools to inspect.
