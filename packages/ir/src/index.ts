import type {
  BinaryOperator,
  BlockStmt,
  Decl,
  Expr,
  FunctionDecl,
  Program,
  Stmt,
  TypeDecl
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

export function lowerProgram(program: Program): IRProgram {
  return {
    modules: program.modules.map((moduleDecl) => ({
      name: moduleDecl.name,
      functions: moduleDecl.body
        .filter((decl): decl is FunctionDecl => decl.kind === "FunctionDecl")
        .map(lowerFunction),
      types: moduleDecl.body
        .filter((decl): decl is TypeDecl => decl.kind === "TypeDecl")
        .map(lowerType)
    }))
  };
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

function lowerFunction(fn: FunctionDecl): IRFunction {
  return {
    name: fn.name,
    params: fn.params.map((param) => ({
      name: param.name,
      type: param.type.name
    })),
    returnType: fn.returnType.name,
    body: lowerBlock(fn.body)
  };
}

function lowerBlock(block: BlockStmt): IRStmt[] {
  return block.statements.map(lowerStmt);
}

function lowerStmt(stmt: Stmt): IRStmt {
  switch (stmt.kind) {
    case "LetStmt":
      return {
        op: "let",
        name: stmt.name,
        value: lowerExpr(stmt.value)
      };
    case "ReturnStmt":
      return {
        op: "return",
        value: stmt.value ? lowerExpr(stmt.value) : undefined
      };
    case "IfStmt":
      return {
        op: "if",
        condition: lowerExpr(stmt.condition),
        thenBody: lowerBlock(stmt.thenBranch),
        elseBody:
          stmt.elseBranch?.kind === "BlockStmt"
            ? lowerBlock(stmt.elseBranch)
            : stmt.elseBranch
              ? [lowerStmt(stmt.elseBranch)]
              : undefined
      };
    case "ExprStmt":
      return {
        op: "expr",
        expression: lowerExpr(stmt.expression)
      };
  }
}

function lowerExpr(expr: Expr): IRExpr {
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
        left: lowerExpr(expr.left),
        right: lowerExpr(expr.right)
      };
    case "CallExpr":
      return {
        op: "call",
        callee: expr.callee.kind === "IdentifierExpr" ? expr.callee.name : "<expr>",
        args: expr.args.map(lowerExpr)
      };
    case "RecordExpr":
      return {
        op: "record",
        typeName: expr.typeName,
        fields: expr.fields.map((field) => ({
          name: field.name,
          value: lowerExpr(field.value)
        }))
      };
    case "MemberExpr":
      return {
        op: "member",
        object: lowerExpr(expr.object),
        property: expr.property
      };
  }
}

export function collectDecls(moduleBody: Decl[]): Decl[] {
  return moduleBody;
}
