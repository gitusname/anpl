import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  AnplIR,
  ApiNode,
  ApiOperationNode,
  AppNode,
  AuthNode,
  DatabaseNode,
  Diagnostic,
  EntityNode,
  FieldModifier,
  FieldNode,
  FieldTypeNode,
  GeneratedFile,
  IRApi,
  IRAuth,
  IRDatabase,
  IREntity,
  IRField,
  ProgramNode,
  Span
} from "./index.js";

const span: Span = {
  file: "examples/crm.anpl",
  start: {
    offset: 0,
    line: 1,
    column: 1
  },
  end: {
    offset: 7,
    line: 1,
    column: 8
  }
};

describe("core exports", () => {
  it("exposes AST types", () => {
    const fieldType: FieldTypeNode = {
      kind: "ScalarFieldType",
      name: "uuid",
      span
    };
    const modifier: FieldModifier = {
      kind: "PrimaryModifier",
      span
    };
    const field: FieldNode = {
      kind: "Field",
      name: "id",
      type: fieldType,
      modifiers: [modifier],
      span
    };
    const entity: EntityNode = {
      kind: "Entity",
      name: "Customer",
      fields: [field],
      span
    };
    const app: AppNode = {
      kind: "App",
      name: "CRM",
      span
    };
    const operation: ApiOperationNode = {
      kind: "ApiOperation",
      action: "list",
      entityName: "Customer",
      flags: [{ kind: "PaginatedFlag", span }],
      span
    };
    const api: ApiNode = {
      kind: "Api",
      name: "CustomerAPI",
      operations: [operation],
      span
    };
    const auth: AuthNode = {
      kind: "Auth",
      type: "jwt",
      roles: ["admin", "user"],
      span
    };
    const database: DatabaseNode = {
      kind: "Database",
      provider: "postgres",
      orm: "prisma",
      span
    };
    const program: ProgramNode = {
      kind: "Program",
      app,
      entities: [entity],
      apis: [api],
      auth,
      database,
      span
    };

    expect(program.entities[0]?.fields[0]?.name).toBe("id");
    expectTypeOf(program).toMatchTypeOf<ProgramNode>();
  });

  it("exposes IR and generated file types", () => {
    const field: IRField = {
      name: "id",
      columnName: "id",
      type: {
        kind: "scalar",
        name: "uuid"
      },
      primary: true,
      required: true,
      unique: false,
      auto: false
    };
    const entity: IREntity = {
      name: "Customer",
      tableName: "customer",
      fields: [field]
    };
    const api: IRApi = {
      name: "CustomerAPI",
      operations: [
        {
          action: "list",
          entityName: "Customer",
          paginated: true,
          softDelete: false
        }
      ]
    };
    const auth: IRAuth = {
      type: "jwt",
      roles: ["admin", "user"]
    };
    const database: IRDatabase = {
      provider: "postgres",
      orm: "prisma"
    };
    const ir: AnplIR = {
      appName: "CRM",
      entities: [entity],
      apis: [api],
      auth,
      database
    };
    const generatedFile: GeneratedFile = {
      path: "generated/prisma/schema.prisma",
      content: "model Customer {}"
    };

    expect(ir.entities[0]?.tableName).toBe("customer");
    expect(generatedFile.path).toBe("generated/prisma/schema.prisma");
    expectTypeOf(ir).toMatchTypeOf<AnplIR>();
  });

  it("exposes diagnostic types", () => {
    const diagnostic: Diagnostic = {
      code: "ANPL_TEST",
      severity: "info",
      message: "Core diagnostic type is available.",
      span,
      confidence: "high"
    };

    expect(diagnostic.code).toBe("ANPL_TEST");
    expectTypeOf(diagnostic).toMatchTypeOf<Diagnostic>();
  });
});
