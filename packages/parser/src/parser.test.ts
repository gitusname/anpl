import { describe, expect, it } from "vitest";
import { parseAnpl } from "./parser.js";

function parseOk(source: string) {
  const result = parseAnpl(source, "test.anpl");

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(
      result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")
    );
  }

  return result.program;
}

describe("real language parser", () => {
  it("parses module and function declarations", () => {
    const program = parseOk(`module math

fn add(a: int, b: int) -> int {
  return a + b
}`);
    const moduleDecl = program.modules[0];
    const fn = moduleDecl?.body[0];

    expect(moduleDecl?.name).toBe("math");
    expect(fn).toMatchObject({
      kind: "FunctionDecl",
      name: "add"
    });
  });

  it("parses let, calls, and returns", () => {
    const program = parseOk(`module math

fn add(a: int, b: int) -> int {
  return a + b
}

fn main() -> int {
  let result = add(2, 3)
  return result
}`);
    const main = program.modules[0]?.body[1];

    expect(main).toMatchObject({
      kind: "FunctionDecl",
      name: "main"
    });
    if (main?.kind !== "FunctionDecl") {
      throw new Error("Expected FunctionDecl");
    }
    expect(main.body.statements[0]).toMatchObject({
      kind: "LetStmt",
      name: "result"
    });
  });

  it("parses type declarations and record literals", () => {
    const program = parseOk(`module crm

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
}`);
    const typeDecl = program.modules[0]?.body[0];
    const fn = program.modules[0]?.body[1];

    expect(typeDecl).toMatchObject({
      kind: "TypeDecl",
      name: "Customer"
    });
    if (typeDecl?.kind !== "TypeDecl") {
      throw new Error("Expected TypeDecl");
    }
    expect(typeDecl.fields[2]).toMatchObject({
      name: "age",
      optional: true
    });
    if (fn?.kind !== "FunctionDecl") {
      throw new Error("Expected FunctionDecl");
    }
    expect(fn.body.statements[0]).toMatchObject({
      kind: "ReturnStmt",
      value: {
        kind: "RecordExpr",
        typeName: "Customer"
      }
    });
  });

  it("returns structured diagnostics for invalid syntax", () => {
    const result = parseAnpl(`module math

fn add(a int) -> int {
  return a
}`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ANPL_PARSE_EXPECTED_COLON"
        })
      ])
    );
  });
});
