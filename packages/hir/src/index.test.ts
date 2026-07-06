import { describe, expect, it } from "vitest";
import { parseAnpl } from "@anpl/parser";
import { analyzeProgram } from "@anpl/semantic";
import { lowerProgramToHir } from "./index.js";

describe("HIR lowering", () => {
  it("preserves module-aware function IDs", () => {
    const parsed = parseAnpl(`module math

fn add(a: int, b: int) -> int {
  return a + b
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const hir = lowerProgramToHir(parsed.program);

    expect(hir.modules[0]?.functions[0]?.id).toBe("math.add");
    expect(hir.modules[0]?.functions[0]?.returnType).toBe("int");
  });

  it("preserves imports for downstream symbol resolution", () => {
    const parsed = parseAnpl(`module math

fn add(a: int, b: int) -> int {
  return a + b
}

module app

import math

fn main() -> int {
  return add(1, 2)
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const hir = lowerProgramToHir(parsed.program);

    expect(hir.modules.find((moduleDecl) => moduleDecl.name === "app")?.imports).toMatchObject([
      {
        module: "math"
      }
    ]);
  });

  it("uses semantic TypeIds when typed program data is provided", () => {
    const parsed = parseAnpl(`module crm

type Customer {
  name: text
  status: enum[active, archived]
}

fn createCustomer() -> Customer {
  return Customer {
    name: "Ada"
    status: active
  }
}

fn main() -> text {
  let customer = createCustomer()
  return customer.name
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }
    const semantic = analyzeProgram(parsed.program);
    if (!semantic.ok) {
      throw new Error(semantic.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const hir = lowerProgramToHir(parsed.program, semantic.typedProgram);
    const crm = hir.modules[0];
    const customer = crm?.types[0];
    const createCustomer = crm?.functions.find((fn) => fn.name === "createCustomer");

    expect(customer?.type).toBe("record:crm.Customer");
    expect(customer?.fields.find((field) => field.name === "status")?.type).toBe(
      "enum:active|archived"
    );
    expect(createCustomer?.returnType).toBe("record:crm.Customer");
    expect(Object.values(hir.typeFacts?.expressionTypes ?? {})).toContain("text");
  });

  it("carries imported module-qualified type IDs for colliding local type names", () => {
    const parsed = parseAnpl(`module crm

type Customer {
  name: text
}

fn createCustomer() -> Customer {
  return Customer {
    name: "Ada"
  }
}

module billing

type Customer {
  total: int
}

module app

import crm

fn main() -> Customer {
  return createCustomer()
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }
    const semantic = analyzeProgram(parsed.program);
    if (!semantic.ok) {
      throw new Error(semantic.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const hir = lowerProgramToHir(parsed.program, semantic.typedProgram);
    const crmCustomer = hir.modules
      .find((moduleDecl) => moduleDecl.name === "crm")
      ?.types.find((typeDecl) => typeDecl.name === "Customer");
    const billingCustomer = hir.modules
      .find((moduleDecl) => moduleDecl.name === "billing")
      ?.types.find((typeDecl) => typeDecl.name === "Customer");
    const appMain = hir.modules
      .find((moduleDecl) => moduleDecl.name === "app")
      ?.functions.find((fn) => fn.name === "main");

    expect(crmCustomer?.type).toBe("record:crm.Customer");
    expect(billingCustomer?.type).toBe("record:billing.Customer");
    expect(appMain?.returnType).toBe("record:crm.Customer");
  });
});
