# ANPL Technical Architecture

ANPL is a machine-first programming language, AI-native software intent layer,
and compiler toolchain.

It is not a CRUD generator. The project direction is a real language pipeline
that AI coding tools can generate, validate, execute, transform, repair, and
debug before producing production code.

## System Boundary

ANPL is designed to sit between human intent and target production code.

```text
Human intent
    -> AI coding tool / planner
    -> ANPL machine-first program
    -> ANPL compiler pipeline
    -> Runtime execution or target code
```

ANPL programs are expected to be generated mostly by AI systems.

Humans may inspect ANPL, but the primary producer is an AI coding tool.

## Compiler Pipeline

```text
ANPL machine-first program
    -> Lexer
    -> Parser
    -> AST
    -> Semantic analyzer
    -> ANPL IR
    -> Optimizer
    -> Backend
       -> Interpreter
       -> JavaScript / TypeScript target
       -> later: WASM, LLVM, Python
    -> Runtime
    -> AI-native diagnostics
```

## Package Structure

The target monorepo structure is:

```text
packages/core
packages/source
packages/project
packages/lexer
packages/syntax
packages/parser
packages/ast
packages/formatter
packages/symbols
packages/types
packages/semantic
packages/hir
packages/mir
packages/ir
packages/optimizer
packages/compiler-js
packages/interpreter
packages/runtime
packages/diagnostics
packages/stdlib
packages/compiler
packages/cli
packages/lsp
packages/benchmark
packages/testkit
```

Older package names such as `validator`, `normalizer`, and `generator-prisma`
were retired early scaffolding. They have been removed from the active workspace
and must not define the project identity.

## Dependency Rules

```text
core
  <- ast
  <- lexer
  <- diagnostics
  <- runtime
  <- parser <- lexer + ast + core
  <- symbols <- core + types
  <- types
  <- semantic <- ast + core + symbols + types
  <- hir <- ast + symbols + types
  <- mir <- hir + symbols + types
  <- ir <- ast
  <- optimizer <- ir
  <- compiler-js <- ir + core
  <- interpreter <- ir + runtime + core
  <- compiler <- parser + semantic + project + source + formatter + hir + mir + ir + optimizer + interpreter + compiler-js
  <- cli <- compiler + diagnostics
benchmark
```

Rules:

- `core` must not depend on other ANPL packages.
- `ast` may depend on `core`.
- `lexer` may depend on `core`.
- `parser` may depend on `lexer`, `ast`, and `core`.
- `semantic` may depend on `ast`, `core`, `symbols`, and `types`.
- `compiler` owns the production pipeline orchestration.
- `ir` may depend on `ast`.
- `optimizer` may depend on `ir`.
- `compiler-js` and `interpreter` may depend on `ir`, `runtime`, and `core`.
- `cli` may orchestrate the full pipeline.
- `benchmark` stays independent unless a benchmark needs to call a specific
  pipeline stage.

## Language v0.1 Scope

ANPL v0.1 should be small, but it must be a real language seed.
The implemented grammar is documented in [Grammar v0.1](./grammar-v0.1.md).

The scope is optimized for reliable AI generation first. Human authoring is
allowed, but it is not the primary design target.

Supported language concepts:

- `module`
- `import`
- `type`
- `fn`
- `let`
- `return`
- `if` / `else`
- basic expressions
- function calls
- records
- enums
- structured errors

Current implementation status:

- Implemented: modules, simple module imports, type declarations, functions,
  `let`, `return`, `if` / `else`, binary expressions, function calls, records,
  member access, enum type references, structured compiler/runtime diagnostics.
- Implemented execution paths: semantic check, IR emission, optimization,
  interpreter, JavaScript build target.
- Still intentionally small: no package manager, no cross-file module loader,
  no advanced generics, no WASM/LLVM/Python backend, and no self-hosted runtime.

Example:

```anpl
module math

fn add(a: int, b: int) -> int {
  return a + b
}

fn main() -> int {
  let result = add(2, 3)
  return result
}
```

Record example:

```anpl
module crm

type Customer {
  id: uuid
  name: text
  age?: int
}

fn createCustomer(name: text) -> Customer {
  return Customer {
    id: uuid()
    name: name
  }
}
```

## Core

`packages/core` owns shared primitives:

- `Span`
- `Diagnostic`
- `Result`
- `SourceFile`
- generated file metadata

It should stay dependency-free.

## AST

`packages/ast` owns syntax tree definitions for the real ANPL language.

Core AST model:

```ts
type Program = {
  kind: "Program";
  modules: ModuleDecl[];
};

type ModuleDecl = {
  kind: "ModuleDecl";
  name: string;
  body: Decl[];
  span: Span;
};

type Decl = FunctionDecl | TypeDecl | ImportDecl;
type Stmt = LetStmt | ReturnStmt | IfStmt | ExprStmt;
type Expr =
  | LiteralExpr
  | IdentifierExpr
  | BinaryExpr
  | CallExpr
  | RecordExpr
  | MemberExpr;
```

## Lexer

The lexer converts source text into tokens with source location metadata.

Responsibilities:

- identify keywords
- identify identifiers
- identify numbers and strings
- identify punctuation and operators
- ignore comments
- preserve line, column, and offset
- return structured lexical diagnostics

## Parser

The parser converts tokens into AST.

Responsibilities:

- parse modules
- parse imports
- parse type declarations
- parse function declarations
- parse statements
- parse expressions
- preserve spans on AST nodes
- return structured parse diagnostics

The parser must not perform semantic validation.

## Semantic Analyzer

The semantic analyzer runs after parsing.

Responsibilities:

- build symbol tables
- resolve scopes
- check undefined variables
- check function calls
- check return types
- check record fields
- produce structured semantic diagnostics

Example diagnostic:

```json
{
  "code": "ANPL_TYPE_MISMATCH",
  "severity": "error",
  "message": "Cannot add int and text.",
  "expected": "int",
  "received": "text",
  "fix": "Convert text to int or change the expression.",
  "confidence": "high"
}
```

## ANPL IR

AST is syntax-oriented. IR is compiler-oriented.

The current v0.1 IR is a structured expression IR. It preserves function,
record, statement, and expression boundaries so the interpreter and JavaScript
compiler can run meaningful programs. A lower-level SSA-like instruction IR can
be introduced later without changing the AST contract.

Example IR shape:

```ts
type IRProgram = {
  modules: IRModule[];
};

type IRInstruction =
  | { op: "const"; target: string; value: unknown }
  | { op: "load"; target: string; name: string }
  | { op: "store"; name: string; value: string }
  | { op: "binary"; target: string; operator: string; left: string; right: string }
  | { op: "call"; target: string; fn: string; args: string[] }
  | { op: "return"; value: string }
  | { op: "branch"; condition: string; thenBlock: string; elseBlock?: string };
```

## Backends

The first backend target is JavaScript.

ANPL:

```anpl
fn add(a: int, b: int) -> int {
  return a + b
}
```

Generated JavaScript:

```js
function add(a, b) {
  return a + b;
}
```

Future targets:

- v0.2: TypeScript
- v0.3: Python
- v0.4: WASM
- v1.0: self-hosted runtime and advanced compiler

## Runtime

The initial runtime should stay small:

```text
stdlib/text
stdlib/int
stdlib/bool
stdlib/list
stdlib/map
stdlib/uuid
stdlib/time
stdlib/result
stdlib/error
```

Initial built-ins:

- `uuid()`
- `now()`
- `print(value)`
- `len(value)`

## Diagnostics

All compiler, runtime, and toolchain errors should use one structured format:

```ts
type Diagnostic = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  file?: string;
  line?: number;
  column?: number;
  symbol?: string;
  expected?: string;
  received?: string;
  cause?: string;
  fix?: string;
  evidence?: string[];
  confidence: "low" | "medium" | "high";
};
```

Diagnostic families:

- `ANPL_LEX_INVALID_CHAR`
- `ANPL_PARSE_UNEXPECTED_TOKEN`
- `ANPL_SEMANTIC_UNKNOWN_SYMBOL`
- `ANPL_TYPE_MISMATCH`
- `ANPL_RETURN_TYPE_MISMATCH`
- `ANPL_CALL_ARG_COUNT_MISMATCH`
- `ANPL_FIELD_NOT_FOUND`
- `ANPL_RUNTIME_ERROR`

## CLI

Target commands:

```bash
anpl check file.anpl
anpl run file.anpl
anpl build file.anpl --target js
anpl emit-ast file.anpl
anpl emit-hir file.anpl
anpl emit-mir file.anpl
anpl emit-ir file.anpl # compatibility alias for MIR
anpl format file.anpl
anpl diagnose logs.txt
```

Flows:

```text
check:
  compiler facade -> lexer -> parser -> semantic analyzer -> diagnostics

run:
  compiler facade -> lexer -> parser -> semantic analyzer -> IR -> interpreter

build:
  compiler facade -> lexer -> parser -> semantic analyzer -> IR -> backend compiler
```

## Milestones

1. Foundation: monorepo, core, basic CLI, tests, build.
2. Real language AST: `module`, `type`, `fn`, statements, expressions.
3. Lexer update: real-language tokens, operators, strings, numbers, comments.
4. Parser: modules, declarations, statements, expressions, calls, records.
5. Semantic analyzer: symbols, scopes, type checking, returns, records.
6. IR: AST to ANPL IR, basic instructions, control flow.
7. Interpreter: run `main()`, evaluate expressions, call functions.
8. JavaScript compiler: generate runnable JS.
9. AI diagnostics: compiler/runtime diagnostics and log compression.
