# ANPL IR v0.1 Contract

ANPL v0.1 currently has three related intermediate representations:

- structured ANPL IR in `@anpl/ir`
- HIR in `@anpl/hir`
- MIR in `@anpl/mir`

The production pipeline uses HIR and MIR for executable paths. The structured
IR remains a serializable v0.1 compatibility layer for inspection and simple
AST-shaped transformations.

## Pipeline Position

```text
AST
  -> Semantic analyzer
  -> Typed semantic facts
  -> HIR
  -> MIR
  -> Optimizer
  -> Interpreter or backend
```

Lowering must stay deterministic. Given the same AST and semantic facts, ANPL
must produce the same HIR and MIR JSON shape, block names, temp names, and
source-span references.

## Structured IR

Package: `packages/ir`

Structured IR is intentionally close to the AST. It is useful for early
inspection, JSON artifacts, simple source-size comparisons, and compatibility
with earlier tools.

Public shape:

```ts
export type IRProgram = {
  modules: IRModule[];
};

export type IRModule = {
  name: string;
  functions: IRFunction[];
  types: IRType[];
};

export type IRType = {
  moduleName: string;
  name: string;
  qualifiedName: string;
  fields: IRField[];
};

export type IRFunction = {
  moduleName: string;
  name: string;
  qualifiedName: string;
  params: IRParam[];
  returnType: string;
  body: IRStmt[];
};
```

Structured IR invariants:

- module order follows source module order
- declaration order follows source declaration order
- function and type names include `moduleName`, local `name`, and
  `qualifiedName`
- call lowering resolves visible imported functions to qualified names when a
  unique visible binding exists
- enum variant identifiers in an expected enum position lower to string
  literals
- it is not the authoritative executable representation

## HIR

Package: `packages/hir`

HIR is the high-level representation used after semantic analysis. It preserves
module structure and source-level statements while replacing public function,
type, and module identities with stable IDs.

Public shape:

```ts
export type HirProgram = {
  modules: HirModule[];
  typeFacts?: HirTypeFacts;
};

export type HirModule = {
  id: ModuleId;
  name: string;
  imports: HirImport[];
  functions: HirFunction[];
  types: HirTypeDecl[];
};

export type HirFunction = {
  id: SymbolId;
  name: string;
  params: HirParam[];
  returnType: TypeId;
  body: HirBlock;
  span: Span;
};
```

HIR invariants:

- module IDs come from `createModuleId(moduleName)`
- function and type IDs come from `createSymbolId(moduleName, name)`
- params, returns, and type fields use `TypeId`
- source spans are preserved on imports, type declarations, functions, params,
  and blocks
- `typeFacts.resolvedTypeRefs` and `typeFacts.expressionTypes` are keyed by
  source-span keys in the form `file:startOffset-endOffset`
- HIR may still contain AST statements in function bodies; MIR performs the
  compiler-friendly lowering

## MIR

Package: `packages/mir`

MIR is the executable compiler representation. The interpreter, optimizer, and
JavaScript/TypeScript backends use MIR.

Public shape:

```ts
export type MirProgram = {
  functions: MirFunction[];
};

export type MirFunction = {
  id: SymbolId;
  params: MirLocal[];
  returnType: TypeId;
  span?: Span;
  blocks: MirBlock[];
};

export type MirBlock = {
  id: string;
  span?: Span;
  instructions: MirInstruction[];
  terminator: MirTerminator;
};
```

Supported MIR instructions:

```ts
| { op: "const"; target: string; value: unknown; type: TypeId }
| { op: "load"; target: string; symbol: SymbolId; type: TypeId }
| { op: "store"; symbol: SymbolId; value: string }
| { op: "binary"; target: string; operator: string; left: string; right: string; type: TypeId }
| { op: "call"; target?: string; callee: SymbolId; args: string[]; type: TypeId }
| { op: "record"; target: string; type: TypeId; fields: Record<string, string> }
| { op: "member"; target: string; object: string; field: string; type: TypeId }
```

Supported MIR terminators:

```ts
| { kind: "return"; value?: string }
| { kind: "jump"; target: string }
| { kind: "branch"; condition: string; thenBlock: string; elseBlock: string }
```

MIR invariants:

- every function has at least one block
- the first block is the entry block named `${functionId}.entry`
- every block has exactly one terminator
- temporary value registers are named `%1`, `%2`, and so on within a function
- local symbols are scoped as `${functionId}.${localName}`
- block IDs are deterministic and scoped by function ID
- calls to user functions use module-aware `SymbolId`
- calls to built-ins use builtin symbol names such as `uuid`, `now`, `print`,
  and `len`
- value-producing instructions write to a temp register
- `void` calls do not require a call target; current expression lowering may
  synthesize a null temp when a value slot is needed downstream
- source spans are preserved on instructions and terminators when the AST node
  provides them

## Optimizer Contract

Package: `packages/optimizer`

MIR optimization is pass-oriented:

```ts
export type OptimizationPass = {
  name: string;
  run(program: MirProgram, context: OptimizationContext): MirProgram;
};
```

The default pass order is:

1. constant folding
2. copy propagation
3. dead branch removal
4. unused local elimination

Optimizer invariants:

- passes must return a valid `MirProgram`
- passes must preserve function IDs, source spans, and block identity unless a
  pass explicitly rewrites a block
- pass results record `name` and `changed`
- diagnostics are accumulated through `OptimizationContext`

## Backend Contract

Packages: `packages/compiler-js`, `packages/interpreter`

Backends consume MIR, not structured IR, for production build/run paths.

Backend invariants:

- namespace JavaScript/TypeScript output exports `__anpl_modules`
- ESM output emits one artifact per ANPL module plus a shared
  `anpl-runtime.js` or `anpl-runtime.ts` helper artifact
- generated source maps map MIR functions, blocks, instructions, and
  terminators back to ANPL source spans
- runtime policy guards are embedded in namespace output or shared through the
  ESM runtime artifact
- module-qualified function IDs must not collapse to global function names

## Serialization

All three IR layers must remain JSON-serializable for compiler artifacts,
diagnostics, tests, benchmarks, and AI repair loops.

Do not add non-serializable fields such as functions, class instances, symbols,
cyclic references, or host objects to public IR nodes.

## Stability Rules

Changes to this contract must update:

- this document
- type definitions in `packages/ir`, `packages/hir`, or `packages/mir`
- source-map and backend tests when MIR shapes change
- conformance snapshots when deterministic output changes
- `docs/status.md` and `docs/next-milestones.md` when implementation status
  changes
