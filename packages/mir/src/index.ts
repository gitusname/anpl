import type {
  BinaryOperator,
  BlockStmt,
  Expr,
  IfStmt,
  LiteralValue,
  Stmt,
  TypeRef
} from "@anpl/ast";
import type { HirFunction, HirModule, HirProgram, HirTypeFacts } from "@anpl/hir";
import type { Span } from "@anpl/core";
import type { SymbolId } from "@anpl/symbols";
import type { TypeId } from "@anpl/types";
import { primitiveTypeId } from "@anpl/types";

export type MirProgram = {
  functions: MirFunction[];
};

export type MirFunction = {
  id: SymbolId;
  params: MirLocal[];
  returnType: TypeId;
  blocks: MirBlock[];
};

export type MirLocal = {
  name: string;
  type: TypeId;
};

export type MirBlock = {
  id: string;
  instructions: MirInstruction[];
  terminator: MirTerminator;
};

export type MirInstruction =
  | { op: "const"; target: string; value: unknown; type: TypeId }
  | { op: "load"; target: string; symbol: SymbolId; type: TypeId }
  | { op: "store"; symbol: SymbolId; value: string }
  | { op: "binary"; target: string; operator: string; left: string; right: string; type: TypeId }
  | { op: "call"; target?: string; callee: SymbolId; args: string[]; type: TypeId }
  | { op: "record"; target: string; type: TypeId; fields: Record<string, string> }
  | { op: "member"; target: string; object: string; field: string; type: TypeId };

export type MirTerminator =
  | { kind: "return"; value?: string }
  | { kind: "jump"; target: string }
  | { kind: "branch"; condition: string; thenBlock: string; elseBlock: string };

type FunctionBinding = {
  id: SymbolId;
  moduleName: string;
  name: string;
  returnType: TypeId;
};

type TypeBinding = {
  id: TypeId;
  moduleName: string;
  name: string;
};

type LoweringContext = {
  typeFacts?: HirTypeFacts;
  functionsByQualifiedName: Map<string, FunctionBinding>;
  functionsByName: Map<string, FunctionBinding[]>;
  functionsByModule: Map<string, Map<string, FunctionBinding>>;
  visibleFunctionsByModule: Map<string, Map<string, FunctionBinding>>;
  typesByQualifiedName: Map<string, TypeBinding>;
  typesByName: Map<string, TypeBinding[]>;
  typesByModule: Map<string, Map<string, TypeBinding>>;
  visibleTypesByModule: Map<string, Map<string, TypeBinding>>;
};

type FunctionContext = {
  moduleName: string;
  functionId: SymbolId;
  returnType: TypeId;
  lowering: LoweringContext;
  localSymbols: Map<string, SymbolId>;
  localTypes: Map<string, TypeId>;
  blocks: MirBlock[];
  terminatedBlocks: Set<string>;
  current: MirBlock;
  tempIndex: number;
  blockIndex: number;
};

type LoweredExpr = {
  value: string;
  type: TypeId;
};

const builtinReturnTypes = new Map<string, TypeId>([
  ["uuid", primitiveTypeId("uuid")],
  ["now", primitiveTypeId("text")],
  ["print", primitiveTypeId("null")],
  ["len", primitiveTypeId("int")]
]);

export function lowerHirToMir(program: HirProgram): MirProgram {
  const context = buildLoweringContext(program);

  return {
    functions: program.modules.flatMap((moduleDecl) =>
      moduleDecl.functions.map((fn) => lowerFunction(moduleDecl, fn, context))
    )
  };
}

function buildLoweringContext(program: HirProgram): LoweringContext {
  const functionsByQualifiedName = new Map<string, FunctionBinding>();
  const functionsByName = new Map<string, FunctionBinding[]>();
  const functionsByModule = new Map<string, Map<string, FunctionBinding>>();
  const typesByQualifiedName = new Map<string, TypeBinding>();
  const typesByName = new Map<string, TypeBinding[]>();
  const typesByModule = new Map<string, Map<string, TypeBinding>>();

  for (const moduleDecl of program.modules) {
    const moduleFunctions = new Map<string, FunctionBinding>();
    const moduleTypes = new Map<string, TypeBinding>();

    for (const fn of moduleDecl.functions) {
      const binding: FunctionBinding = {
        id: fn.id,
        moduleName: moduleDecl.name,
        name: fn.name,
        returnType: fn.returnType
      };
      functionsByQualifiedName.set(fn.id, binding);
      moduleFunctions.set(fn.name, binding);
      const byName = functionsByName.get(fn.name) ?? [];
      byName.push(binding);
      functionsByName.set(fn.name, byName);
    }

    for (const typeDecl of moduleDecl.types) {
      const binding: TypeBinding = {
        id: typeDecl.type,
        moduleName: moduleDecl.name,
        name: typeDecl.name
      };
      typesByQualifiedName.set(typeDecl.id, binding);
      moduleTypes.set(typeDecl.name, binding);
      const byName = typesByName.get(typeDecl.name) ?? [];
      byName.push(binding);
      typesByName.set(typeDecl.name, byName);
    }

    functionsByModule.set(moduleDecl.name, moduleFunctions);
    typesByModule.set(moduleDecl.name, moduleTypes);
  }

  return {
    typeFacts: program.typeFacts,
    functionsByQualifiedName,
    functionsByName,
    functionsByModule,
    visibleFunctionsByModule: visibleBindingsByModule(program, functionsByModule),
    typesByQualifiedName,
    typesByName,
    typesByModule,
    visibleTypesByModule: visibleBindingsByModule(program, typesByModule)
  };
}

function visibleBindingsByModule<T>(
  program: HirProgram,
  bindingsByModule: Map<string, Map<string, T>>
): Map<string, Map<string, T>> {
  const visibleByModule = new Map<string, Map<string, T>>();

  for (const moduleDecl of program.modules) {
    const visible = new Map(bindingsByModule.get(moduleDecl.name));

    for (const importDecl of moduleDecl.imports) {
      const imported = bindingsByModule.get(importDecl.module);
      if (imported === undefined) {
        continue;
      }

      const names = importDecl.names ?? [...imported.keys()];
      for (const name of names) {
        const binding = imported.get(name);
        if (binding !== undefined && !visible.has(name)) {
          visible.set(name, binding);
        }
      }
    }

    visibleByModule.set(moduleDecl.name, visible);
  }

  return visibleByModule;
}

function lowerFunction(
  moduleDecl: HirModule,
  fn: HirFunction,
  lowering: LoweringContext
): MirFunction {
  const entry = createBlock(`${fn.id}.entry`);
  const context: FunctionContext = {
    moduleName: moduleDecl.name,
    functionId: fn.id,
    returnType: fn.returnType,
    lowering,
    localSymbols: new Map(),
    localTypes: new Map(),
    blocks: [entry],
    terminatedBlocks: new Set(),
    current: entry,
    tempIndex: 0,
    blockIndex: 0
  };

  for (const param of fn.params) {
    context.localSymbols.set(param.name, scopedSymbol(fn.id, param.name));
    context.localTypes.set(param.name, param.type);
  }

  lowerBlock(fn.body.statements, context);
  ensureTerminated(context);

  return {
    id: fn.id,
    params: fn.params.map((param) => ({
      name: param.name,
      type: param.type
    })),
    returnType: fn.returnType,
    blocks: context.blocks
  };
}

function lowerBlock(statements: Stmt[], context: FunctionContext): void {
  for (const stmt of statements) {
    if (isTerminated(context)) {
      context.current = pushBlock(context, "unreachable");
    }
    lowerStmt(stmt, context);
  }
}

function lowerStmt(stmt: Stmt, context: FunctionContext): void {
  switch (stmt.kind) {
    case "LetStmt": {
      const value = lowerExpr(stmt.value, context);
      const explicitType = stmt.type === undefined ? undefined : typeRefToTypeId(stmt.type, context);
      const localType = explicitType ?? value.type;
      const symbol = scopedSymbol(context.functionId, stmt.name);
      context.localSymbols.set(stmt.name, symbol);
      context.localTypes.set(stmt.name, localType);
      emit(context, {
        op: "store",
        symbol,
        value: value.value
      });
      return;
    }
    case "ReturnStmt": {
      const value = stmt.value === undefined ? undefined : lowerExpr(stmt.value, context);
      context.current.terminator =
        value === undefined ? { kind: "return" } : { kind: "return", value: value.value };
      markTerminated(context);
      return;
    }
    case "IfStmt":
      lowerIf(stmt, context);
      return;
    case "ExprStmt":
      lowerExpr(stmt.expression, context);
      return;
  }
}

function lowerIf(stmt: IfStmt, context: FunctionContext): void {
  const condition = lowerExpr(stmt.condition, context);
  const thenBlock = pushBlock(context, "then");
  const elseBlock = pushBlock(context, "else");
  const afterBlock = pushBlock(context, "after");

  context.current.terminator = {
    kind: "branch",
    condition: condition.value,
    thenBlock: thenBlock.id,
    elseBlock: elseBlock.id
  };
  markTerminated(context);

  context.current = thenBlock;
  lowerBlock(stmt.thenBranch.statements, context);
  if (!isTerminated(context)) {
    context.current.terminator = {
      kind: "jump",
      target: afterBlock.id
    };
    markTerminated(context);
  }

  context.current = elseBlock;
  if (stmt.elseBranch !== undefined) {
    lowerElseBranch(stmt.elseBranch, context);
  }
  if (!isTerminated(context)) {
    context.current.terminator = {
      kind: "jump",
      target: afterBlock.id
    };
    markTerminated(context);
  }

  context.current = afterBlock;
}

function lowerElseBranch(branch: BlockStmt | IfStmt, context: FunctionContext): void {
  if (branch.kind === "BlockStmt") {
    lowerBlock(branch.statements, context);
    return;
  }

  lowerStmt(branch, context);
}

function lowerExpr(expr: Expr, context: FunctionContext): LoweredExpr {
  switch (expr.kind) {
    case "LiteralExpr":
      return lowerLiteral(expr.value, context);
    case "IdentifierExpr":
      return lowerIdentifier(expr.name, context);
    case "BinaryExpr":
      return lowerBinary(expr, context);
    case "CallExpr":
      return lowerCall(expr, context);
    case "RecordExpr":
      return lowerRecord(expr, context);
    case "MemberExpr":
      return lowerMember(expr, context);
  }
}

function lowerLiteral(value: LiteralValue, context: FunctionContext): LoweredExpr {
  const type = literalType(value);
  const target = freshTemp(context);
  emit(context, {
    op: "const",
    target,
    value,
    type
  });
  return { value: target, type };
}

function lowerIdentifier(name: string, context: FunctionContext): LoweredExpr {
  if (!context.localSymbols.has(name)) {
    const target = freshTemp(context);
    const type = primitiveTypeId("text");
    emit(context, {
      op: "const",
      target,
      value: name,
      type
    });
    return { value: target, type };
  }

  const symbol = context.localSymbols.get(name) ?? scopedSymbol(context.functionId, name);
  const type = context.localTypes.get(name) ?? primitiveTypeId("unknown");
  const target = freshTemp(context);
  emit(context, {
    op: "load",
    target,
    symbol,
    type
  });
  return { value: target, type };
}

function lowerBinary(
  expr: Extract<Expr, { kind: "BinaryExpr" }>,
  context: FunctionContext
): LoweredExpr {
  const left = lowerExpr(expr.left, context);
  const right = lowerExpr(expr.right, context);
  const type =
    expressionType(expr.span, context) ?? binaryType(expr.operator, left.type, right.type);
  const target = freshTemp(context);
  emit(context, {
    op: "binary",
    target,
    operator: expr.operator,
    left: left.value,
    right: right.value,
    type
  });
  return { value: target, type };
}

function lowerCall(
  expr: Extract<Expr, { kind: "CallExpr" }>,
  context: FunctionContext
): LoweredExpr {
  const args = expr.args.map((arg) => lowerExpr(arg, context));
  const callee = resolveCallee(expr.callee, context);
  const type = returnTypeForCallee(callee, context);
  const target = type === primitiveTypeId("void") ? undefined : freshTemp(context);

  emit(context, {
    op: "call",
    target,
    callee,
    args: args.map((arg) => arg.value),
    type
  });

  return {
    value: target ?? freshVoidValue(context),
    type
  };
}

function lowerRecord(
  expr: Extract<Expr, { kind: "RecordExpr" }>,
  context: FunctionContext
): LoweredExpr {
  const loweredFields: Record<string, string> = {};

  for (const field of expr.fields) {
    loweredFields[field.name] = lowerExpr(field.value, context).value;
  }

  const type = expressionType(expr.span, context) ?? resolveTypeId(expr.typeName, context);
  const target = freshTemp(context);
  emit(context, {
    op: "record",
    target,
    type,
    fields: loweredFields
  });
  return { value: target, type };
}

function lowerMember(
  expr: Extract<Expr, { kind: "MemberExpr" }>,
  context: FunctionContext
): LoweredExpr {
  const object = lowerExpr(expr.object, context);
  const target = freshTemp(context);
  const type = expressionType(expr.span, context) ?? primitiveTypeId("unknown");
  emit(context, {
    op: "member",
    target,
    object: object.value,
    field: expr.property,
    type
  });
  return { value: target, type };
}

function resolveCallee(expr: Expr, context: FunctionContext): SymbolId {
  if (expr.kind !== "IdentifierExpr") {
    return "<expr>" as SymbolId;
  }

  const builtinReturn = builtinReturnTypes.get(expr.name);
  if (builtinReturn !== undefined) {
    return expr.name as SymbolId;
  }

  const visible = context.lowering.visibleFunctionsByModule
    .get(context.moduleName)
    ?.get(expr.name);
  if (visible !== undefined) {
    return visible.id;
  }

  const candidates = context.lowering.functionsByName.get(expr.name) ?? [];
  if (candidates.length === 1) {
    return candidates[0]!.id;
  }

  return scopedSymbol(context.moduleName, expr.name);
}

function returnTypeForCallee(callee: SymbolId, context: FunctionContext): TypeId {
  const builtinReturn = builtinReturnTypes.get(callee);
  if (builtinReturn !== undefined) {
    return builtinReturn;
  }

  return (
    context.lowering.functionsByQualifiedName.get(callee)?.returnType ??
    primitiveTypeId("unknown")
  );
}

function resolveTypeId(typeName: string, context: FunctionContext): TypeId {
  const visible = context.lowering.visibleTypesByModule.get(context.moduleName)?.get(typeName);
  if (visible !== undefined) {
    return visible.id;
  }

  const candidates = context.lowering.typesByName.get(typeName) ?? [];
  if (candidates.length === 1) {
    return candidates[0]!.id;
  }

  return typeNameToTypeId(typeName);
}

function typeRefToTypeId(typeRef: TypeRef, context: FunctionContext): TypeId {
  const resolved = context.lowering.typeFacts?.resolvedTypeRefs[spanKey(typeRef.span)];
  if (resolved !== undefined) {
    return resolved;
  }

  return resolveTypeId(typeRef.name, context);
}

function expressionType(span: Span, context: FunctionContext): TypeId | undefined {
  return context.lowering.typeFacts?.expressionTypes[spanKey(span)];
}

function spanKey(span: Span): string {
  return `${span.file ?? "<memory>"}:${span.start.offset}-${span.end.offset}`;
}

function literalType(value: LiteralValue): TypeId {
  if (typeof value === "number") {
    return Number.isInteger(value) ? primitiveTypeId("int") : primitiveTypeId("decimal");
  }
  if (typeof value === "boolean") {
    return primitiveTypeId("bool");
  }
  if (typeof value === "string") {
    return primitiveTypeId("text");
  }
  return primitiveTypeId("null");
}

function binaryType(operator: BinaryOperator, left: TypeId, right: TypeId): TypeId {
  switch (operator) {
    case "==":
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "and":
    case "or":
      return primitiveTypeId("bool");
    case "/":
      return primitiveTypeId("decimal");
    case "+":
    case "-":
    case "*":
    case "%":
      return left === primitiveTypeId("decimal") || right === primitiveTypeId("decimal")
        ? primitiveTypeId("decimal")
        : primitiveTypeId("int");
  }
}

function typeNameToTypeId(name: string): TypeId {
  switch (name) {
    case "int":
    case "decimal":
    case "text":
    case "string":
    case "bool":
    case "uuid":
    case "void":
    case "null":
      return primitiveTypeId(name);
    default:
      return name as TypeId;
  }
}

function freshTemp(context: FunctionContext): string {
  context.tempIndex += 1;
  return `%${context.tempIndex}`;
}

function freshVoidValue(context: FunctionContext): string {
  const target = freshTemp(context);
  emit(context, {
    op: "const",
    target,
    value: null,
    type: primitiveTypeId("null")
  });
  return target;
}

function pushBlock(context: FunctionContext, label: string): MirBlock {
  context.blockIndex += 1;
  const block = createBlock(`${context.functionId}.${label}${context.blockIndex}`);
  context.blocks.push(block);
  return block;
}

function createBlock(id: string): MirBlock {
  return {
    id,
    instructions: [],
    terminator: {
      kind: "return"
    }
  };
}

function emit(context: FunctionContext, instruction: MirInstruction): void {
  context.current.instructions.push(instruction);
}

function ensureTerminated(context: FunctionContext): void {
  if (!isTerminated(context)) {
    context.current.terminator = {
      kind: "return"
    };
    markTerminated(context);
  }
}

function markTerminated(context: FunctionContext): void {
  context.terminatedBlocks.add(context.current.id);
}

function isTerminated(context: FunctionContext): boolean {
  return context.terminatedBlocks.has(context.current.id);
}

function scopedSymbol(scope: string, name: string): SymbolId {
  return `${scope}.${name}` as SymbolId;
}
