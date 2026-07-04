# ANPL Project Status

ANPL is an experimental machine-first programming language for AI coding tools.

The current repository is best described as a v0.1 seed language: it has a small
but real compiler pipeline, while many research claims and production features
remain planned.

## Implemented

- Monorepo packages for `core`, `ast`, `lexer`, `parser`, `semantic`, `ir`,
  `optimizer`, `interpreter`, `compiler-js`, `runtime`, `diagnostics`, `cli`,
  and `benchmark`.
- Lexer with keywords, identifiers, numbers, strings, comments, operators,
  newline tokens, EOF tokens, and source spans.
- AST model for modules, imports, type declarations, fields, functions,
  parameters, blocks, statements, expressions, calls, records, members, and type
  references.
- Parser for the ANPL v0.1 grammar documented in
  [Grammar v0.1](./grammar-v0.1.md).
- Semantic analyzer with symbol collection, simple same-file module imports,
  scope checks, type checks, function call checks, return checks, record field
  checks, enum field checks, and structured diagnostics.
- Structured ANPL IR v0.1 lowering from AST.
- Constant-folding optimizer for simple IR expressions.
- Interpreter support for `main()`, functions, `let`, `return`, `if`, records,
  member access, calls, basic operators, and runtime built-ins.
- JavaScript compiler target for the current structured IR.
- Runtime built-ins: `uuid()`, `now()`, `print(value)`, and `len(value)`.
- CLI commands: `check`, `run`, `build`, `emit-ast`, `emit-ir`, and `diagnose`.
- Structured diagnostic primitives with codes, severity, location data,
  expected/received values, fix hints, evidence, and confidence.
- Initial source-size comparison utilities in `packages/benchmark`.

## Experimental

- The language syntax is intentionally small and may evolve.
- The current IR is a structured expression IR, not a low-level SSA or LLVM-like
  IR.
- Module imports are simple same-file semantic imports, not a package or
  cross-file module system.
- JavaScript output is useful for v0.1 demos, but it does not yet implement
  robust module namespacing, source maps, or target runtime policy.
- Runtime diagnostics exist, but cause/fix/evidence quality needs improvement.
- The `diagnose` CLI command is a simple heuristic log classifier, not yet an
  AI-optimized error compression system.
- Benchmark utilities currently measure source-size style metrics only; they do
  not yet prove model success rate, repair loop reduction, or production build
  reliability.

## Planned

- Module namespace model for functions, types, imports, IR, interpreter, and
  generated JavaScript.
- Canonical formatter: `anpl format file.anpl`.
- Stronger structured diagnostics with cause, fix, evidence, and repair-oriented
  context across all compiler/runtime phases.
- Real benchmark suite comparing direct human-first target code generation with
  human intent -> ANPL -> compiler flows.
- Cross-file modules and package boundaries.
- Expanded type system and effect model.
- Additional compiler targets such as TypeScript, Python, WASM, or LLVM.
- More complete runtime and standard library primitives.

## Legacy Scaffolding

The repository still contains these retired early scaffolding packages:

- `packages/validator`
- `packages/normalizer`
- `packages/generator-prisma`

They are kept only as historical scaffolding while the project direction settles
around the compiler pipeline.

Do not expand these packages.

Do not add CRUD, Prisma, NestJS, schema-generator, or backend-generator work
unless it is explicitly framed as a temporary compiler target and does not
define ANPL's identity.
