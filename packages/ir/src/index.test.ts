import { describe, expect, it } from "vitest";
import { parseAnpl } from "@anpl/parser";
import { lowerProgram } from "./index.js";

describe("IR lowering", () => {
  it("lowers a math program", () => {
    const parsed = parseAnpl(`module math

fn add(a: int, b: int) -> int {
  return a + b
}`);

    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const ir = lowerProgram(parsed.program);

    expect(ir.modules[0]?.functions[0]).toMatchObject({
      name: "add",
      body: [
        {
          op: "return",
          value: {
            op: "binary",
            operator: "+"
          }
        }
      ]
    });
  });

  it("lowers enum record variants as literal values", () => {
    const parsed = parseAnpl(`module crm

type Customer {
  status: enum[active, archived]
}

fn createCustomer() -> Customer {
  return Customer {
    status: active
  }
}`);

    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const ir = lowerProgram(parsed.program);

    expect(ir.modules[0]?.functions[0]?.body[0]).toMatchObject({
      op: "return",
      value: {
        op: "record",
        fields: [
          {
            name: "status",
            value: {
              op: "literal",
              value: "active"
            }
          }
        ]
      }
    });
  });
});
