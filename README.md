# ANPL

**ANPL** stands for **AI-Native Programming Language**.

ANPL is an experimental programming language designed for AI coding agents and future AI-native software engineering.

The project explores a simple but important question:

> What would a programming language look like if it were designed for AI systems first?

Most programming languages were designed for humans. ANPL takes a different direction: it is designed to be compact, structured, low-ambiguity, compiler-friendly, and easier for AI models to generate, validate, debug, and transform.

## Why ANPL?

AI coding agents today usually generate software in human-first languages such as Python, JavaScript, TypeScript, Go, Rust, or Java.

These languages are powerful, but they were not designed for AI models.

AI agents often struggle with:

* ambiguous natural language requirements
* large amounts of boilerplate
* long terminal logs
* noisy stack traces
* inconsistent code structure
* repeated debugging loops
* high token usage
* weak intermediate validation before code generation

ANPL explores a different approach.

Instead of forcing AI to directly write large codebases in human-first languages, ANPL gives AI systems a compact programming language designed around machine understanding and structured compilation.

## Core Idea

```text
Human requirement
    ↓
AI reasoning
    ↓
ANPL source code
    ↓
Parser
    ↓
Semantic analyzer
    ↓
ANPL IR
    ↓
Compiler / interpreter
    ↓
Runtime or target language output
    ↓
AI-native diagnostics
```

ANPL is not just a prompt format.
ANPL is not just a code generator.
ANPL is not just a schema language.

ANPL is an experimental AI-native programming language.

## Design Goals

ANPL aims to provide:

* compact syntax for AI generation
* low ambiguity
* explicit semantics
* structured diagnostics
* AI-readable compiler errors
* reduced debugging noise
* formal validation before execution
* compiler-friendly program representation
* future support for AI-native tooling, runtimes, and benchmarks

## Example Direction

Early ANPL syntax may look like this:

```anpl
module crm

type Customer {
  id: uuid
  name: text
  phone?: text
}

type Order {
  id: uuid
  customer: Customer
  amount: decimal
  status: enum[pending, paid, cancelled]
}

fn createOrder(customer: Customer, amount: decimal) -> Order {
  let order = Order {
    id: uuid()
    customer: customer
    amount: amount
    status: pending
  }
  return order
}
```

This is only an early language direction. The syntax and semantics are expected to evolve.

## What ANPL Is

ANPL is intended to become:

* an AI-native programming language
* a compiler toolchain
* a structured semantic layer for AI coding agents
* an AI-readable diagnostics system
* a research project for AI-first software engineering

## What ANPL Is Not

ANPL is not:

* a CRUD generator
* a no-code builder
* a chatbot framework
* a prompt collection
* a simple schema-to-code tool
* a wrapper around existing AI providers

ANPL may compile to existing languages during early development, but the long-term goal is to develop a serious programming language designed for AI-first software creation.

## Status

ANPL is currently experimental and in early development.

Current implemented foundation:

* language philosophy and technical architecture
* ANPL v0.1 grammar and AST for modules, imports, types, functions, statements, and expressions
* lexer with keywords, operators, strings, numbers, comments, and source spans
* parser for modules, imports, type declarations, functions, blocks, control flow, calls, records, members, and enum type references
* semantic analyzer with module imports, symbol tables, scope checks, type checks, return checks, record checks, enum field checks, and structured diagnostics
* ANPL IR lowering and constant-folding optimizer
* interpreter that runs `main()`
* JavaScript compiler target
* runtime built-ins: `uuid()`, `now()`, `print(value)`, `len(value)`
* CLI commands: `check`, `run`, `build`, `emit-ast`, `emit-ir`, `diagnose`
* initial benchmark metrics for ANPL-vs-target source comparison

## Roadmap

Technical references:

* [Architecture](docs/architecture.md)
* [Grammar v0.1](docs/grammar-v0.1.md)

### Phase 1: Language Foundation

* [x] Define ANPL language philosophy
* [x] Define grammar v0.1 direction
* [x] Define AST
* [x] Implement lexer
* [x] Implement parser
* [x] Add structured syntax diagnostics

### Phase 2: Semantics

* [x] Define type system v0.1
* [x] Implement semantic analyzer
* [x] Add symbol table
* [x] Add type checking
* [x] Add structured semantic diagnostics

### Phase 3: Execution

* [x] Define ANPL IR
* [x] Build interpreter and JavaScript compiler target
* [x] Execute small ANPL programs
* [x] Add runtime diagnostics

### Phase 4: AI-Native Tooling

* [ ] AI-readable documentation format
* [ ] AI-optimized error compression
* [x] Initial benchmark metrics package
* [ ] Benchmark ANPL against direct code generation across real tasks
* [ ] Measure token usage and debugging iterations

## Research Questions

ANPL is built around several research questions:

* Can AI models generate a dedicated AI-native language more reliably than human-first programming languages?
* Can compact structured syntax reduce token usage?
* Can semantic validation reduce repeated debugging loops?
* Can AI-readable diagnostics improve coding agent repair accuracy?
* Can a programming language be optimized for machine understanding without becoming unreadable to humans?

## License

Apache License 2.0.
