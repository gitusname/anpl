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
  name: string
  phone?: string
}

type Order {
  id: uuid
  customer: Customer
  amount: decimal
  status: enum[pending, paid, cancelled]
}

action createOrder(customer: Customer, amount: decimal) -> Order {
  require amount > 0
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

Current focus:

* language philosophy
* grammar v0.1
* lexer
* parser
* AST
* semantic analyzer
* ANPL IR
* structured diagnostics
* first compiler or interpreter target

## Roadmap

### Phase 1: Language Foundation

* [ ] Define ANPL language philosophy
* [ ] Define grammar v0.1
* [ ] Define AST
* [ ] Implement lexer
* [ ] Implement parser
* [ ] Add structured syntax diagnostics

### Phase 2: Semantics

* [ ] Define type system v0.1
* [ ] Implement semantic analyzer
* [ ] Add symbol table
* [ ] Add type checking
* [ ] Add structured semantic diagnostics

### Phase 3: Execution

* [ ] Define ANPL IR
* [ ] Build interpreter or compiler target
* [ ] Execute small ANPL programs
* [ ] Add runtime diagnostics

### Phase 4: AI-Native Tooling

* [ ] AI-readable documentation format
* [ ] AI-optimized error compression
* [ ] Benchmark ANPL against direct code generation
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
