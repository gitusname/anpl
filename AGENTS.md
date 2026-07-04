# AGENTS.md

# ANPL Project Context

ANPL stands for **AI-Native Programming Language**.

ANPL is an experimental programming language designed primarily for AI systems, AI coding agents, and future machine-native software development workflows.

This project is **not** a CRUD generator, not a no-code tool, not a prompt format, and not a simple intermediate representation experiment.

ANPL is a serious attempt to explore what a programming language could look like if it were designed from the beginning for AI models to understand, generate, validate, debug, and optimize.

## Core Thesis

Most existing programming languages were designed for humans.

Python, JavaScript, Go, Rust, Java, and C++ are human-oriented languages. They optimize for human readability, historical ecosystem needs, and developer ergonomics.

AI systems have different needs.

AI coding agents need:

* compact syntax
* low ambiguity
* deterministic structure
* explicit semantics
* machine-readable errors
* structured diagnostics
* predictable compilation
* reduced token usage
* formal validation before execution
* easier reasoning about software intent
* safer transformation into target runtimes

ANPL explores the question:

```text
What would a programming language look like if it were designed for AI first?
```

## What ANPL Is

ANPL is intended to become:

* an AI-native programming language
* a formal language for AI coding agents
* a compiler-friendly language with explicit semantics
* a language with compact syntax and structured meaning
* a runtime and compiler toolchain
* a diagnostic system optimized for AI understanding
* a future target language for AI-generated software
* a foundation for AI-first software engineering

## What ANPL Is Not

ANPL is not:

* a toy language
* a CRUD generator
* a simple project scaffolder
* a prompt template format
* a chatbot framework
* a no-code builder
* a wrapper around OpenAI/Anthropic/Gemini
* a replacement for Python in v0.1
* a demo-only DSL

Generated backend code may be used as an early compiler target, but ANPL itself is a programming language project.

## Long-Term Vision

The long-term goal is to build a programming language that AI systems can use as a native software construction layer.

Possible future pipeline:

```text
Human requirement
    ↓
AI reasoning
    ↓
ANPL source code
    ↓
ANPL parser
    ↓
ANPL semantic analyzer
    ↓
ANPL IR
    ↓
ANPL compiler / interpreter
    ↓
Runtime execution or target language generation
    ↓
AI-native diagnostics
```

ANPL should eventually support:

* variables
* functions
* modules
* types
* control flow
* data models
* effects
* services
* APIs
* errors
* tests
* packages
* tools
* agent workflows
* runtime diagnostics

## Design Principles

ANPL must be designed around AI-first constraints.

### 1. Machine clarity over human tradition

Do not copy existing languages blindly.

Syntax should exist because it helps AI systems produce and understand reliable programs, not because humans are used to it.

### 2. Low ambiguity

ANPL should avoid syntax that creates multiple possible interpretations.

### 3. Compact expression

ANPL should represent common software concepts with fewer tokens than verbose natural language or boilerplate-heavy general-purpose languages.

### 4. Structured semantics

ANPL source code should map cleanly into AST, semantic graph, IR, and compiler output.

### 5. AI-readable diagnostics

All compiler, runtime, and toolchain errors must be structured.

Bad:

```text
Something went wrong.
```

Good:

```json
{
  "code": "ANPL_TYPE_MISMATCH",
  "severity": "error",
  "symbol": "customerId",
  "expected": "uuid",
  "received": "string",
  "cause": "Function createOrder expects a UUID customerId.",
  "fix": "Convert customerId to uuid or change the function signature.",
  "confidence": "high"
}
```

### 6. Compiler-first architecture

ANPL must have a real parser, AST, semantic analyzer, IR, and compiler/runtime path.

### 7. AI-agent compatibility

ANPL should be easy for coding agents to generate, inspect, transform, repair, and benchmark.

## Architecture

ANPL is organized as a TypeScript monorepo during early development.

Main packages:

```text
packages/core
packages/lexer
packages/parser
packages/semantic
packages/ir
packages/compiler
packages/runtime
packages/diagnostics
packages/cli
```

The current repository may still contain earlier package names such as `validator`, `normalizer`, or `generator-prisma`. These can be gradually renamed or repurposed.

## Core Compiler Pipeline

```text
ANPL source
    ↓
Lexer
    ↓
Parser
    ↓
AST
    ↓
Semantic Analyzer
    ↓
ANPL IR
    ↓
Compiler / Interpreter
    ↓
Runtime or target output
```

## Early Language Scope

ANPL v0.1 should not try to implement every feature of a general-purpose programming language.

However, it must be designed as the seed of a real language.

Early ANPL should support:

* program/module declaration
* typed data structures
* functions/actions
* imports/modules
* basic scalar types
* records/entities
* simple control flow
* explicit effects
* structured errors
* compiler diagnostics
* at least one executable or compilable target

## Important Distinction

A backend generator may be used only as an early proof that ANPL code can compile into useful software.

It must not define the identity of the project.

The identity of ANPL is:

```text
AI-native programming language
```

not:

```text
backend app generator
```

## Current Development Priority

The next development work should move toward a real language foundation:

1. Define ANPL language philosophy.
2. Define grammar v0.1.
3. Define AST.
4. Define semantic model.
5. Define ANPL IR.
6. Implement lexer.
7. Implement parser.
8. Implement semantic analyzer.
9. Implement structured diagnostics.
10. Implement a small interpreter or compiler target.

## What Coding Agents Must Avoid

Do not reduce ANPL into:

* a CRUD-only DSL
* a Prisma generator
* a NestJS generator
* a schema generator
* a config format

Those may be temporary compiler targets, but they are not the project.

Do not invent unrelated features without updating the language specification.

Do not implement large boilerplate without explaining how it advances ANPL as a programming language.

Do not treat ANPL as a toy language.

## Definition of Success for Early ANPL

The first serious version of ANPL should prove that:

1. AI can generate ANPL more consistently than verbose application code.
2. ANPL can be parsed and semantically validated.
3. ANPL compiler diagnostics are compact and AI-readable.
4. ANPL can compile or interpret a meaningful program.
5. ANPL reduces ambiguity and debugging loops for AI coding agents.

## Project Identity

ANPL is a research-oriented open-source programming language project.

It is intended to explore the future of AI-native software engineering.

Every implementation decision should be evaluated against this question:

```text
Does this make programming easier, clearer, safer, or more efficient for AI systems?
```
