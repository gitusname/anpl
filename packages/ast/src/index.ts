import type { Span } from "@anpl/core";

export type AstNode<TKind extends string> = {
  kind: TKind;
  span: Span;
};

export type Program = AstNode<"Program"> & {
  modules: ModuleDecl[];
};

export type ModuleDecl = AstNode<"ModuleDecl"> & {
  name: string;
  body: Decl[];
};

export type Decl = ImportDecl | TypeDecl | FunctionDecl;

export type ImportDecl = AstNode<"ImportDecl"> & {
  module: string;
  names?: string[];
};

export type TypeDecl = AstNode<"TypeDecl"> & {
  name: string;
  fields: FieldDecl[];
};

export type FieldDecl = AstNode<"FieldDecl"> & {
  name: string;
  type: TypeRef;
  optional: boolean;
};

export type FunctionDecl = AstNode<"FunctionDecl"> & {
  name: string;
  params: Param[];
  returnType: TypeRef;
  body: BlockStmt;
};

export type Param = AstNode<"Param"> & {
  name: string;
  type: TypeRef;
};

export type TypeRef = AstNode<"TypeRef"> & {
  name: string;
  optional?: boolean;
  typeArgs?: TypeRef[];
};

export type BlockStmt = AstNode<"BlockStmt"> & {
  statements: Stmt[];
};

export type Stmt = LetStmt | ReturnStmt | IfStmt | ExprStmt;

export type LetStmt = AstNode<"LetStmt"> & {
  name: string;
  type?: TypeRef;
  value: Expr;
};

export type ReturnStmt = AstNode<"ReturnStmt"> & {
  value?: Expr;
};

export type IfStmt = AstNode<"IfStmt"> & {
  condition: Expr;
  thenBranch: BlockStmt;
  elseBranch?: BlockStmt | IfStmt;
};

export type ExprStmt = AstNode<"ExprStmt"> & {
  expression: Expr;
};

export type Expr =
  | LiteralExpr
  | IdentifierExpr
  | BinaryExpr
  | CallExpr
  | RecordExpr
  | MemberExpr;

export type LiteralValue = string | number | boolean | null;

export type LiteralExpr = AstNode<"LiteralExpr"> & {
  value: LiteralValue;
};

export type IdentifierExpr = AstNode<"IdentifierExpr"> & {
  name: string;
};

export type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "and"
  | "or";

export type BinaryExpr = AstNode<"BinaryExpr"> & {
  operator: BinaryOperator;
  left: Expr;
  right: Expr;
};

export type CallExpr = AstNode<"CallExpr"> & {
  callee: Expr;
  args: Expr[];
};

export type RecordExpr = AstNode<"RecordExpr"> & {
  typeName: string;
  fields: RecordFieldExpr[];
};

export type RecordFieldExpr = AstNode<"RecordFieldExpr"> & {
  name: string;
  value: Expr;
};

export type MemberExpr = AstNode<"MemberExpr"> & {
  object: Expr;
  property: string;
};
