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
});
