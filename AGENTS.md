# AGENTS.md

# ANPL Project Context

ANPL stands for **AI-Native Programming Language**.

ANPL is an experimental language, intermediate representation, and diagnostics layer designed for AI coding agents.

The goal is not to replace Python, TypeScript, Go, or Rust. The goal is to create a compact, structured, validated format that AI coding agents can use before generating real production code.

## Why this project exists

Modern AI coding agents can generate code, but they often struggle with:

* ambiguous natural language requirements
* inconsistent project structure
* long terminal logs
* noisy stack traces
* repeated fix loops
* high token usage during debugging
* generating large amounts of code before validating the actual software intent

ANPL explores a different pipeline:

```text
Human intent
    ↓
AI-generated ANPL
    ↓
Parser
    ↓
Validator
    ↓
Canonical IR
    ↓
Code generator
    ↓
Real project files
    ↓
AI-friendly diagnostics
```

Instead of asking an AI model to directly generate 50 files of TypeScript or Python, ANPL lets the model first generate a compact, formal software intent description.

That intent can then be validated, normalized, compiled, benchmarked, and debugged.

## Core idea

ANPL is designed to be easy for AI systems to produce and understand.

A typical ANPL file describes:

* app name
* entities
* fields
* API operations
* auth rules
* database settings
* later: workflows, tools, agents, deployment, diagnostics

Example:

```anpl
app CRM

entity Customer {
  id: uuid primary
  name: string required
  phone: string optional
  createdAt: datetime auto
}

entity Order {
  id: uuid primary
  customerId: ref Customer required
  amount: decimal required
  status: enum[pending, paid, cancelled] default pending
}

api CustomerAPI {
  create Customer
  list Customer paginated
  get Customer by id
  update Customer
  delete Customer soft
}

auth {
  type: jwt
  roles: admin, user
}

database {
  provider: postgres
  orm: prisma
}
```

## What ANPL is

ANPL is:

* an experimental AI-native specification language
* an intermediate representation for AI coding agents
* a validation layer before code generation
* a compiler-friendly software intent format
* a diagnostics layer for compressing logs and errors into AI-readable output

## What ANPL is not

ANPL is not:

* a Python replacement
* a JavaScript replacement
* a general-purpose programming language yet
* a natural language prompt format
* a chatbot framework
* an AI model
* a no-code builder

## MVP scope

The first MVP must focus on one narrow use case:

```text
ANPL backend intent
    ↓
Validation
    ↓
Prisma schema generation
```

The first successful demo should be:

```bash
anpl check examples/crm.anpl
anpl compile examples/crm.anpl --target prisma --out generated
```

Expected result:

```text
✓ Parsed examples/crm.anpl
✓ Validated 2 entities
✓ Generated prisma/schema.prisma
```

Do not try to implement the whole vision at once.

## v0.1 supported features

ANPL v0.1 supports:

* app declaration
* entity declarations
* scalar fields
* enum fields
* reference fields
* primary key modifier
* required/optional modifiers
* auto modifier
* default modifier
* API declarations
* basic CRUD operations
* auth block
* database block
* Prisma schema generation

## v0.1 not supported yet

Do not implement these yet unless explicitly asked:

* frontend generation
* React generation
* mobile generation
* deployment generation
* Kubernetes
* queues
* microservices
* payments
* advanced workflows
* real AI model integration
* VS Code extension
* OpenAI/Anthropic/Gemini provider integration

## Architecture modules

The project is organized as a TypeScript monorepo.

Main packages:

```text
packages/core
packages/parser
packages/validator
packages/normalizer
packages/generator-prisma
packages/diagnostics
packages/cli
```

### packages/core

Contains shared types:

* AST types
* IR types
* Diagnostic types
* GeneratedFile types
* shared errors

This package must not depend on other ANPL packages.

### packages/parser

Converts `.anpl` source code into an AST.

Responsibilities:

* tokenize source code
* parse app/entity/api/auth/database blocks
* preserve line and column information
* return structured parse diagnostics on failure

### packages/validator

Validates parsed AST.

Responsibilities:

* detect duplicate entities
* detect duplicate fields
* ensure every entity has a primary key
* ensure ref fields point to existing entities
* ensure API operations reference existing entities
* validate database provider
* validate auth configuration

### packages/normalizer

Converts AST into canonical IR.

Responsibilities:

* normalize entity names
* normalize field metadata
* normalize API operations
* prepare data for generators

### packages/generator-prisma

Converts canonical IR into Prisma schema files.

Responsibilities:

* generate datasource block
* generate Prisma client generator block
* generate models
* generate scalar fields
* generate enum blocks
* generate basic relations

### packages/diagnostics

Compresses terminal logs and errors into structured AI-friendly diagnostics.

This is part of the long-term ANPL vision.

Example:

```text
Raw log: 300 lines
    ↓
ANPL diagnostic: 10 structured lines
```

### packages/cli

Provides terminal commands.

Planned commands:

```bash
anpl init
anpl check <file>
anpl compile <file> --target prisma --out generated
anpl diagnose <file>
```

## Diagnostic philosophy

All errors should be structured.

Bad:

```text
Something went wrong.
```

Good:

```json
{
  "code": "ANPL_UNKNOWN_ENTITY",
  "severity": "error",
  "message": "Entity 'Product' is referenced but not defined.",
  "line": 24,
  "cause": "API operation references a missing entity.",
  "fix": "Define entity Product or change the API operation.",
  "confidence": "high"
}
```

Diagnostics must be:

* compact
* structured
* useful for AI agents
* useful for humans
* easy to serialize as JSON/YAML

## Development principles

1. Keep v0.1 small.
2. Prefer deterministic code over AI-dependent behavior.
3. Parser, validator, normalizer, and generator must be separate.
4. Do not mix parsing and validation.
5. Do not generate code if validation fails.
6. Always return structured diagnostics.
7. Every package should be testable independently.
8. Every feature should have at least one example.
9. Avoid over-engineering.
10. The first goal is a working `.anpl → schema.prisma` pipeline.

## Preferred technology

Use:

* TypeScript
* Node.js
* pnpm
* Vitest
* tsup
* commander

Avoid unless explicitly requested:

* Babel
* Webpack
* heavy frameworks
* database runtime dependencies
* real AI API calls in core packages

## First milestone

Milestone 1 is complete when this works:

```bash
pnpm install
pnpm build
pnpm test
pnpm anpl check examples/crm.anpl
pnpm anpl compile examples/crm.anpl --target prisma --out generated
```

And produces:

```text
generated/prisma/schema.prisma
```

## Important instruction for coding agents

Do not implement the full future vision.

Focus only on the current milestone.

When asked to implement a package, only modify that package and the minimum required shared types.

Do not invent new syntax without updating `docs/spec-v0.1.md`.

Do not introduce external AI provider dependencies.

Do not generate large unrelated boilerplate.

Keep the project small, understandable, and testable.
