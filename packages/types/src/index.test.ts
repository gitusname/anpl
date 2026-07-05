import { describe, expect, it } from "vitest";
import { createTypeRegistry, primitiveTypeId } from "./index.js";

describe("type registry", () => {
  it("interns primitive and enum types", () => {
    const types = createTypeRegistry();
    const enumId = types.intern({
      kind: "EnumType",
      variants: ["active", "archived"]
    });

    expect(types.display(primitiveTypeId("int"))).toBe("int");
    expect(types.display(enumId)).toBe("enum[active, archived]");
    expect(types.isAssignable(primitiveTypeId("int"), primitiveTypeId("int"))).toBe(true);
  });

  it("updates an existing canonical type when re-interned with resolved fields", () => {
    const types = createTypeRegistry();
    const first = types.intern({
      kind: "RecordType",
      name: "crm.Customer",
      fields: new Map([["status", primitiveTypeId("unknown")]])
    });
    const enumId = types.intern({
      kind: "EnumType",
      variants: ["active", "archived"]
    });
    const second = types.intern({
      kind: "RecordType",
      name: "crm.Customer",
      fields: new Map([["status", enumId]])
    });
    const record = types.get(first);

    expect(second).toBe(first);
    expect(record.kind).toBe("RecordType");
    if (record.kind !== "RecordType") {
      throw new Error("Expected record type");
    }
    expect(record.fields.get("status")).toBe(enumId);
  });
});
