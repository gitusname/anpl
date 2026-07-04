# ANPL Technical Architecture

## Overview

ANPL is an experimental AI-native programming language and diagnostics layer for coding agents.

The project is built around this idea:

```text
AI should not always generate production code directly.
AI should first generate a compact, validated software intent representation.
```

ANPL provides that representation.

## High-level pipeline

```text
.anpl source file
    ↓
Lexer
    ↓
Parser
    ↓
AST
    ↓
Validator
    ↓
Canonical IR
    ↓
Generator
    ↓
Generated project files
```

For diagnostics:

```text
Raw terminal log
    ↓
Rule matcher
    ↓
Evidence extractor
    ↓
Compact diagnostic
    ↓
AI coding agent
```

## Why ANPL separates AST and IR

The AST represents the source file structure.

The IR represents normalized software intent.

Example:

```anpl
entity Customer {
  id: uuid primary
  name: string required
}
```

AST preserves syntax-level information:

* line
* column
* original modifiers
* source structure

IR prepares generator-friendly information:

* entity name
* table name
* field metadata
* required/optional status
* primary key status
* relation metadata

This separation is important because parser output should not directly drive code generation.

## Package architecture

```text
packages/core
    Shared types and diagnostics

packages/parser
    Source code → AST

packages/validator
    AST → validation diagnostics

packages/normalizer
    AST → canonical IR

packages/generator-prisma
    IR → Prisma schema

packages/diagnostics
    Raw logs → compact diagnostics

packages/cli
    User-facing terminal interface
```

## Data flow

### 1. Source input

Input file:

```text
examples/crm.anpl
```

### 2. Lexer

The lexer converts source text into tokens.

Example tokens:

```text
keyword(app)
identifier(CRM)
keyword(entity)
identifier(Customer)
lbrace
identifier(id)
colon
keyword(uuid)
keyword(primary)
rbrace
```

### 3. Parser

The parser converts tokens into AST.

Example AST shape:

```json
{
  "kind": "Program",
  "app": {
    "kind": "App",
    "name": "CRM"
  },
  "entities": [
    {
      "kind": "Entity",
      "name": "Customer",
      "fields": []
    }
  ]
}
```

### 4. Validator

The validator checks semantic correctness.

Validation examples:

* Entity names must be unique.
* Field names inside an entity must be unique.
* Every entity should have a primary key.
* Reference fields must point to existing entities.
* API operations must reference existing entities.
* Database provider must be supported.

Validator output:

```ts
type ValidationResult = {
  ok: boolean;
  diagnostics: Diagnostic[];
};
```

### 5. Normalizer

The normalizer converts AST into canonical IR.

Example:

```json
{
  "appName": "CRM",
  "entities": [
    {
      "name": "Customer",
      "tableName": "customer",
      "fields": [
        {
          "name": "id",
          "type": "uuid",
          "primary": true,
          "required": true
        }
      ]
    }
  ]
}
```

### 6. Generator

The generator takes IR and produces files.

Example output:

```text
generated/prisma/schema.prisma
```

Generator interface:

```ts
type GeneratedFile = {
  path: string;
  content: string;
};
```

## CLI commands

### anpl check

```bash
anpl check examples/crm.anpl
```

Responsibilities:

1. Read file.
2. Parse source.
3. Validate AST.
4. Print diagnostics.
5. Exit with code `0` if valid, `1` if invalid.

### anpl compile

```bash
anpl compile examples/crm.anpl --target prisma --out generated
```

Responsibilities:

1. Read file.
2. Parse source.
3. Validate AST.
4. Stop if validation fails.
5. Normalize AST into IR.
6. Run generator.
7. Write generated files.
8. Print compact summary.

### anpl diagnose

```bash
anpl diagnose logs.txt
```

Responsibilities:

1. Read raw log file.
2. Match known error patterns.
3. Extract useful evidence.
4. Return compact diagnostic.

## Diagnostic format

All errors should use one shared diagnostic format.

```ts
type Diagnostic = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  file?: string;
  line?: number;
  column?: number;
  cause?: string;
  fix?: string;
  evidence?: string[];
  confidence?: "low" | "medium" | "high";
};
```

Example:

```json
{
  "code": "ANPL_UNKNOWN_ENTITY",
  "severity": "error",
  "message": "Entity 'Product' is referenced but not defined.",
  "file": "examples/crm.anpl",
  "line": 18,
  "cause": "API operation references a missing entity.",
  "fix": "Define entity Product or change the API operation.",
  "confidence": "high"
}
```

## v0.1 grammar draft

```text
program      := appDecl? block*
block        := entityDecl | apiDecl | authDecl | databaseDecl

appDecl      := "app" Identifier

entityDecl   := "entity" Identifier "{" fieldDecl* "}"
fieldDecl    := Identifier ":" fieldType modifier*

fieldType    := scalarType | refType | enumType
scalarType   := "string" | "int" | "uuid" | "datetime" | "decimal" | "boolean"
refType      := "ref" Identifier
enumType     := "enum" "[" Identifier ("," Identifier)* "]"

modifier     := "primary" | "required" | "optional" | "auto" | "unique" | defaultModifier
defaultModifier := "default" Identifier

apiDecl      := "api" Identifier "{" apiOperation* "}"
apiOperation := action Identifier apiFlag*
action       := "create" | "list" | "get" | "update" | "delete"
apiFlag      := "paginated" | "soft" | "by" Identifier

authDecl     := "auth" "{" authField* "}"
authField    := "type" ":" Identifier | "roles" ":" Identifier ("," Identifier)*

databaseDecl := "database" "{" databaseField* "}"
databaseField := "provider" ":" Identifier | "orm" ":" Identifier
```

## v0.1 target output

The first generator target is Prisma.

ANPL:

```anpl
entity Customer {
  id: uuid primary
  name: string required
  phone: string optional
}
```

Prisma:

```prisma
model Customer {
  id    String @id @default(uuid())
  name  String
  phone String?
}
```

## Project milestones

### Milestone 1: Foundation

* Set up TypeScript monorepo.
* Add core types.
* Add example ANPL file.
* Add basic docs.

### Milestone 2: Parser

* Implement lexer.
* Implement parser.
* Parse CRM example into AST.

### Milestone 3: Validator

* Add semantic validation.
* Return structured diagnostics.
* Stop compilation on errors.

### Milestone 4: Prisma generator

* Normalize AST to IR.
* Generate Prisma schema.
* Write output files.

### Milestone 5: Diagnostics

* Add log diagnostic engine.
* Support common npm, TypeScript, Docker, Prisma errors.
* Return compact AI-friendly diagnostics.

## Success definition for v0.1

ANPL v0.1 is successful when this command:

```bash
anpl compile examples/crm.anpl --target prisma --out generated
```

successfully generates:

```text
generated/prisma/schema.prisma
```

from a valid ANPL file.

And this command:

```bash
anpl diagnose examples/logs/prisma-error.log
```

compresses a noisy raw error log into a compact structured diagnostic.
