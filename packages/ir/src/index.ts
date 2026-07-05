import type {
  BinaryOperator,
  BlockStmt,
  Decl,
  Expr,
  FunctionDecl,
  Program,
  Stmt,
  TypeDecl,
  TypeRef
} from "@anpl/ast";

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

export type IRField = {
  name: string;
  type: string;
  optional: boolean;
};

export type IRFunction = {
  moduleName: string;
  name: string;
  qualifiedName: string;
  params: IRParam[];
  returnType: string;
  body: IRStmt[];
};

export type IRParam = {
  name: string;
  type: string;
};

export type IRStmt = IRLetStmt | IRReturnStmt | IRIfStmt | IRExprStmt;

export type IRLetStmt = {
  op: "let";
  name: string;
  value: IRExpr;
};

export type IRReturnStmt = {
  op: "return";
  value?: IRExpr;
};

export type IRIfStmt = {
  op: "if";
  condition: IRExpr;
  thenBody: IRStmt[];
  elseBody?: IRStmt[];
};

export type IRExprStmt = {
  op: "expr";
  expression: IRExpr;
};

export type IRExpr =
  | IRLiteralExpr
  | IRLoadExpr
  | IRBinaryExpr
  | IRCallExpr
  | IRRecordExpr
  | IRMemberExpr;

export type IRLiteralExpr = {
  op: "literal";
  value: string | number | boolean | null;
};

export type IRLoadExpr = {
  op: "load";
  name: string;
};

export type IRBinaryExpr = {
  op: "binary";
  operator: BinaryOperator;
  left: IRExpr;
  right: IRExpr;
};

export type IRCallExpr = {
  op: "call";
  callee: string;
  args: IRExpr[];
};

export type IRRecordExpr = {
  op: "record";
  typeName: string;
  fields: Array<{
    name: string;
    value: IRExpr;
  }>;
};

export type IRMemberExpr = {
  op: "member";
  object: IRExpr;
  property: string;
};

type LoweringContext = {
  functionsByModule: Map<string, Map<string, FunctionBinding>>;
  typesByModule: Map<string, Map<string, TypeBinding>>;
  visibleFunctions: Map<string, Map<string, FunctionBinding>>;
  visibleTypes: Map<string, Map<string, TypeBinding>>;
};

type FunctionBinding = {
  moduleName: string;
  qualifiedName: string;
  decl: FunctionDecl;
};

type TypeBinding = {
  moduleName: string;
  qualifiedName: string;
  decl: TypeDecl;
};

const builtins = new Set(["uuid", "now", "print", "len"]);

export function lowerProgram(program: Program): IRProgram {
  const context = buildLoweringContext(program);

  return {
    modules: program.modules.map((moduleDecl) => ({
      name: moduleDecl.name,
      functions: moduleDecl.body
        .filter((decl): decl is FunctionDecl => decl.kind === "FunctionDecl")
        .map((fn) => lowerFunction(moduleDecl.name, fn, context)),
      types: moduleDecl.body
        .filter((decl): decl is TypeDecl => decl.kind === "TypeDecl")
        .map((typeDecl) => lowerType(moduleDecl.name, typeDecl))
    }))
  };
}

function buildLoweringContext(program: Program): LoweringContext {
  const functionsByModule = new Map<string, Map<string, FunctionBinding>>();
  const typesByModule = new Map<string, Map<string, TypeBinding>>();

  for (const moduleDecl of program.modules) {
    const functions = new Map<string, FunctionBinding>();
    const types = new Map<string, TypeBinding>();

    for (const decl of moduleDecl.body) {
      if (decl.kind === "FunctionDecl") {
        functions.set(decl.name, {
          moduleName: moduleDecl.name,
          qualifiedName: qualifiedName(moduleDecl.name, decl.name),
          decl
        });
      }
      if (decl.kind === "TypeDecl") {
        types.set(decl.name, {
          moduleName: moduleDecl.name,
          qualifiedName: qualifiedName(moduleDecl.name, decl.name),
          decl
        });
      }
    }

    functionsByModule.set(moduleDecl.name, functions);
    typesByModule.set(moduleDecl.name, types);
  }

  const context: LoweringContext = {
    functionsByModule,
    typesByModule,
    visibleFunctions: new Map(),
    visibleTypes: new Map()
  };

  for (const moduleDecl of program.modules) {
    context.visibleFunctions.set(
      moduleDecl.name,
      visibleBindingsForModule(moduleDecl, functionsByModule)
    );
    context.visibleTypes.set(
      moduleDecl.name,
      visibleBindingsForModule(moduleDecl, typesByModule)
    );
  }

  return context;
}

function visibleBindingsForModule<T extends FunctionBinding | TypeBinding>(
  moduleDecl: Extract<Program["modules"][number], { kind: "ModuleDecl" }>,
  bindingsByModule: Map<string, Map<string, T>>
): Map<string, T> {
  const visible = new Map(bindingsByModule.get(moduleDecl.name));

  for (const decl of moduleDecl.body) {
    if (decl.kind !== "ImportDecl") {
      continue;
    }

    const imported = bindingsByModule.get(decl.module);
    if (imported === undefined) {
      continue;
    }

    const names = decl.names ?? [...imported.keys()];
    for (const name of names) {
      const binding = imported.get(name);
      if (binding !== undefined && !visible.has(name)) {
        visible.set(name, binding);
      }
    }
  }

  return visible;
}

function lowerType(moduleName: string, typeDecl: TypeDecl): IRType {
  return {
    moduleName,
    name: typeDecl.name,
    qualifiedName: qualifiedName(moduleName, typeDecl.name),
    fields: typeDecl.fields.map((field) => ({
      name: field.name,
      type: field.type.name,
      optional: field.optional
    }))
  };
}

function lowerFunction(
  moduleName: string,
  fn: FunctionDecl,
  context: LoweringContext
): IRFunction {
  return {
    moduleName,
    name: fn.name,
    qualifiedName: qualifiedName(moduleName, fn.name),
    params: fn.params.map((param) => ({
      name: param.name,
      type: param.type.name
    })),
    returnType: fn.returnType.name,
    body: lowerBlock(fn.body, context, moduleName, fn.returnType)
  };
}

function lowerBlock(
  block: BlockStmt,
  context: LoweringContext,
  moduleName: string,
  returnType?: TypeRef
): IRStmt[] {
  return block.statements.map((stmt) => lowerStmt(stmt, context, moduleName, returnType));
}

function lowerStmt(
  stmt: Stmt,
  context: LoweringContext,
  moduleName: string,
  returnType?: TypeRef
): IRStmt {
  switch (stmt.kind) {
    case "LetStmt":
      return {
        op: "let",
        name: stmt.name,
        value: lowerExpr(stmt.value, context, moduleName, stmt.type)
      };
    case "ReturnStmt":
      return {
        op: "return",
        value: stmt.value ? lowerExpr(stmt.value, context, moduleName, returnType) : undefined
      };
    case "IfStmt":
      return {
        op: "if",
        condition: lowerExpr(stmt.condition, context, moduleName),
        thenBody: lowerBlock(stmt.thenBranch, context, moduleName, returnType),
        elseBody:
          stmt.elseBranch?.kind === "BlockStmt"
            ? lowerBlock(stmt.elseBranch, context, moduleName, returnType)
            : stmt.elseBranch
              ? [lowerStmt(stmt.elseBranch, context, moduleName, returnType)]
              : undefined
      };
    case "ExprStmt":
      return {
        op: "expr",
        expression: lowerExpr(stmt.expression, context, moduleName)
      };
  }
}

function lowerExpr(
  expr: Expr,
  context: LoweringContext,
  moduleName: string,
  expectedType?: TypeRef
): IRExpr {
  if (
    expectedType?.name === "enum" &&
    expr.kind === "IdentifierExpr" &&
    enumVariants(expectedType).includes(expr.name)
  ) {
    return {
      op: "literal",
      value: expr.name
    };
  }

  switch (expr.kind) {
    case "LiteralExpr":
      return {
        op: "literal",
        value: expr.value
      };
    case "IdentifierExpr":
      return {
        op: "load",
        name: expr.name
      };
    case "BinaryExpr":
      return {
        op: "binary",
        operator: expr.operator,
        left: lowerExpr(expr.left, context, moduleName),
        right: lowerExpr(expr.right, context, moduleName)
      };
    case "CallExpr": {
      const binding =
        expr.callee.kind === "IdentifierExpr"
          ? resolveFunction(context, moduleName, expr.callee.name)
          : undefined;
      const callee =
        expr.callee.kind === "IdentifierExpr"
          ? binding?.qualifiedName ?? expr.callee.name
          : "<expr>";

      return {
        op: "call",
        callee,
        args: expr.args.map((arg, index) =>
          lowerExpr(arg, context, moduleName, binding?.decl.params[index]?.type)
        )
      };
    }
    case "RecordExpr": {
      const typeDecl = resolveType(context, moduleName, expr.typeName)?.decl;
      return {
        op: "record",
        typeName: expr.typeName,
        fields: expr.fields.map((field) => {
          const expectedField = typeDecl?.fields.find(
            (candidate) => candidate.name === field.name
          );

          return {
            name: field.name,
            value: lowerExpr(field.value, context, moduleName, expectedField?.type)
          };
        })
      };
    }
    case "MemberExpr":
      return {
        op: "member",
        object: lowerExpr(expr.object, context, moduleName),
        property: expr.property
      };
  }
}

function resolveFunction(
  context: LoweringContext,
  moduleName: string,
  name: string
): FunctionBinding | undefined {
  if (builtins.has(name)) {
    return undefined;
  }
  return context.visibleFunctions.get(moduleName)?.get(name);
}

function resolveType(
  context: LoweringContext,
  moduleName: string,
  name: string
): TypeBinding | undefined {
  return context.visibleTypes.get(moduleName)?.get(name);
}

function qualifiedName(moduleName: string, name: string): string {
  return `${moduleName}.${name}`;
}

function enumVariants(typeRef: TypeRef): string[] {
  return (typeRef.typeArgs ?? []).map((variant) => variant.name);
}

export function collectDecls(moduleBody: Decl[]): Decl[] {
  return moduleBody;
}
