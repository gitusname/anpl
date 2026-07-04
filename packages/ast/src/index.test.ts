import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  BinaryExpr,
  BlockStmt,
  FunctionDecl,
  IdentifierExpr,
  ModuleDecl,
  Param,
  Program,
  ReturnStmt,
  TypeRef
} from "./index.js";
import type { Span } from "@anpl/core";

const span: Span = {
  file: "examples/math.anpl",
  start: {
    offset: 0,
    line: 1,
    column: 1
  },
  end: {
    offset: 1,
    line: 1,
    column: 2
  }
};

function typeRef(name: string): TypeRef {
  return {
    kind: "TypeRef",
    name,
    span
  };
}

function identifier(name: string): IdentifierExpr {
  return {
    kind: "IdentifierExpr",
    name,
    span
  };
}

describe("language AST", () => {
  it("models a math module with an add function", () => {
    const intType = typeRef("int");
    const params: Param[] = [
      {
        kind: "Param",
        name: "a",
        type: intType,
        span
      },
      {
        kind: "Param",
        name: "b",
        type: intType,
        span
      }
    ];
    const expression: BinaryExpr = {
      kind: "BinaryExpr",
      operator: "+",
      left: identifier("a"),
      right: identifier("b"),
      span
    };
    const returnStmt: ReturnStmt = {
      kind: "ReturnStmt",
      value: expression,
      span
    };
    const body: BlockStmt = {
      kind: "BlockStmt",
      statements: [returnStmt],
      span
    };
    const addFunction: FunctionDecl = {
      kind: "FunctionDecl",
      name: "add",
      params,
      returnType: intType,
      body,
      span
    };
    const moduleDecl: ModuleDecl = {
      kind: "ModuleDecl",
      name: "math",
      body: [addFunction],
      span
    };
    const program: Program = {
      kind: "Program",
      modules: [moduleDecl],
      span
    };

    expect(program.modules[0]?.name).toBe("math");
    expect(addFunction.params.map((param) => param.name)).toEqual(["a", "b"]);
    expect(returnStmt.value).toMatchObject({
      kind: "BinaryExpr",
      operator: "+"
    });
    expectTypeOf(program).toMatchTypeOf<Program>();
  });
});
