import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("parser", () => {
  it("parses app declaration", () => {
    const program = parseOk("app CRM");

    expect(program.app?.name).toBe("CRM");
    expect(program.span.start).toMatchObject({ line: 1, column: 1, offset: 0 });
  });

  it("parses Customer entity with fields", () => {
    const program = parseOk(`entity Customer {
  id: uuid primary
  name: string required
  phone: string optional
}`);
    const customer = program.entities[0];

    expect(customer?.name).toBe("Customer");
    expect(customer?.fields).toHaveLength(3);
    expect(customer?.fields.map((field) => field.name)).toEqual([
      "id",
      "name",
      "phone"
    ]);
    expect(customer?.fields[0]?.modifiers[0]?.kind).toBe("PrimaryModifier");
  });

  it("parses ref field", () => {
    const program = parseOk(`entity Order {
  customerId: ref Customer required
}`);
    const field = program.entities[0]?.fields[0];

    expect(field?.type).toMatchObject({
      kind: "ReferenceFieldType",
      entityName: "Customer"
    });
    expect(field?.modifiers[0]?.kind).toBe("RequiredModifier");
  });

  it("parses enum field with default", () => {
    const program = parseOk(`entity Order {
  status: enum[pending, paid, cancelled] default pending
}`);
    const field = program.entities[0]?.fields[0];

    expect(field?.type).toMatchObject({
      kind: "EnumFieldType",
      values: ["pending", "paid", "cancelled"]
    });
    expect(field?.modifiers[0]).toMatchObject({
      kind: "DefaultModifier",
      value: "pending"
    });
  });

  it("parses API operations", () => {
    const program = parseOk(`api CustomerAPI {
  create Customer
  list Customer paginated
  get Customer by id
  update Customer
  delete Customer soft
}`);
    const api = program.apis[0];

    expect(api?.name).toBe("CustomerAPI");
    expect(api?.operations.map((operation) => operation.action)).toEqual([
      "create",
      "list",
      "get",
      "update",
      "delete"
    ]);
    expect(api?.operations[1]?.flags).toEqual(["paginated"]);
    expect(api?.operations[2]?.flags).toEqual(["by", "id"]);
    expect(api?.operations[4]?.flags).toEqual(["soft"]);
  });

  it("parses auth block", () => {
    const program = parseOk(`auth {
  type: jwt
  roles: admin, user
}`);

    expect(program.auth?.type).toBe("jwt");
    expect(program.auth?.roles).toEqual(["admin", "user"]);
  });

  it("parses database block", () => {
    const program = parseOk(`database {
  provider: postgres
  orm: prisma
}`);

    expect(program.database?.provider).toBe("postgres");
    expect(program.database?.orm).toBe("prisma");
  });

  it("parses examples/crm.anpl successfully", () => {
    const source = readFileSync(
      join(process.cwd(), "examples", "crm.anpl"),
      "utf8"
    );
    const result = parseAnpl(source, "examples/crm.anpl");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(
        result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")
      );
    }

    expect(result.program.app?.name).toBe("CRM");
    expect(result.program.entities).toHaveLength(2);
    expect(result.program.entities.some((entity) => entity.name === "Customer")).toBe(
      true
    );
    expect(result.program.entities.some((entity) => entity.name === "Order")).toBe(
      true
    );
    expect(result.program.apis).toHaveLength(2);
    expect(result.program.auth?.type).toBe("jwt");
    expect(result.program.database?.provider).toBe("postgres");
    expect(result.program.database?.orm).toBe("prisma");
  });

  it("returns diagnostics for invalid syntax", () => {
    const result = parseAnpl(`entity Customer {
  id uuid primary
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
