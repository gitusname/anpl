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
  name: string;
  fields: IRField[];
};

export type IRField = {
  name: string;
  type: string;
  optional: boolean;
};

export type IRFunction = {
  name: string;
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
  types: Map<string, TypeDecl>;
  functions: Map<string, FunctionDecl>;
};

export function lowerProgram(program: Program): IRProgram {
  const context: LoweringContext = {
    types: collectTypes(program),
    functions: collectFunctions(program)
  };

  return {
    modules: program.modules.map((moduleDecl) => ({
      name: moduleDecl.name,
      functions: moduleDecl.body
        .filter((decl): decl is FunctionDecl => decl.kind === "FunctionDecl")
        .map((fn) => lowerFunction(fn, context)),
      types: moduleDecl.body
        .filter((decl): decl is TypeDecl => decl.kind === "TypeDecl")
        .map(lowerType)
    }))
  };
}

function collectTypes(program: Program): Map<string, TypeDecl> {
  const types = new Map<string, TypeDecl>();

  for (const moduleDecl of program.modules) {
    for (const decl of moduleDecl.body) {
      if (decl.kind === "TypeDecl") {
        types.set(decl.name, decl);
      }
    }
  }

  return types;
}

function collectFunctions(program: Program): Map<string, FunctionDecl> {
  const functions = new Map<string, FunctionDecl>();

  for (const moduleDecl of program.modules) {
    for (const decl of moduleDecl.body) {
      if (decl.kind === "FunctionDecl") {
        functions.set(decl.name, decl);
      }
    }
  }

  return functions;
}

function lowerType(typeDecl: TypeDecl): IRType {
  return {
    name: typeDecl.name,
    fields: typeDecl.fields.map((field) => ({
      name: field.name,
      type: field.type.name,
      optional: field.optional
    }))
  };
}

function lowerFunction(fn: FunctionDecl, context: LoweringContext): IRFunction {
  return {
    name: fn.name,
    params: fn.params.map((param) => ({
      name: param.name,
      type: param.type.name
    })),
    returnType: fn.returnType.name,
    body: lowerBlock(fn.body, context, fn.returnType)
  };
}

function lowerBlock(
  block: BlockStmt,
  context: LoweringContext,
  returnType?: TypeRef
): IRStmt[] {
  return block.statements.map((stmt) => lowerStmt(stmt, context, returnType));
}

function lowerStmt(
  stmt: Stmt,
  context: LoweringContext,
  returnType?: TypeRef
): IRStmt {
  switch (stmt.kind) {
    case "LetStmt":
      return {
        op: "let",
        name: stmt.name,
        value: lowerExpr(stmt.value, context, stmt.type)
      };
    case "ReturnStmt":
      return {
        op: "return",
        value: stmt.value ? lowerExpr(stmt.value, context, returnType) : undefined
      };
    case "IfStmt":
      return {
        op: "if",
        condition: lowerExpr(stmt.condition, context),
        thenBody: lowerBlock(stmt.thenBranch, context, returnType),
        elseBody:
          stmt.elseBranch?.kind === "BlockStmt"
            ? lowerBlock(stmt.elseBranch, context, returnType)
            : stmt.elseBranch
              ? [lowerStmt(stmt.elseBranch, context, returnType)]
              : undefined
      };
    case "ExprStmt":
      return {
        op: "expr",
        expression: lowerExpr(stmt.expression, context)
      };
  }
}

function lowerExpr(
  expr: Expr,
  context: LoweringContext,
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
        left: lowerExpr(expr.left, context),
        right: lowerExpr(expr.right, context)
      };
    case "CallExpr":
      const signature =
        expr.callee.kind === "IdentifierExpr"
          ? context.functions.get(expr.callee.name)
          : undefined;

      return {
        op: "call",
        callee: expr.callee.kind === "IdentifierExpr" ? expr.callee.name : "<expr>",
        args: expr.args.map((arg, index) =>
          lowerExpr(arg, context, signature?.params[index]?.type)
        )
      };
    case "RecordExpr": {
      const typeDecl = context.types.get(expr.typeName);
      return {
        op: "record",
        typeName: expr.typeName,
        fields: expr.fields.map((field) => {
          const expectedField = typeDecl?.fields.find(
            (candidate) => candidate.name === field.name
          );

          return {
            name: field.name,
            value: lowerExpr(field.value, context, expectedField?.type)
          };
        })
      };
    }
    case "MemberExpr":
      return {
        op: "member",
        object: lowerExpr(expr.object, context),
        property: expr.property
      };
  }
}

function enumVariants(typeRef: TypeRef): string[] {
  return (typeRef.typeArgs ?? []).map((variant) => variant.name);
}

export function collectDecls(moduleBody: Decl[]): Decl[] {
  return moduleBody;
}
