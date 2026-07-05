export type TypeId = string & { readonly __brand: "TypeId" };

export type Type =
  | PrimitiveType
  | LiteralType
  | FunctionType
  | RecordType
  | EnumType
  | OptionalType
  | ListType
  | ResultType
  | UnknownType
  | ErrorType;

export type PrimitiveName =
  | "int"
  | "decimal"
  | "text"
  | "string"
  | "bool"
  | "uuid"
  | "void"
  | "null";

export type PrimitiveType = {
  kind: "PrimitiveType";
  id: TypeId;
  name: PrimitiveName;
};

export type LiteralType = {
  kind: "LiteralType";
  id: TypeId;
  value: string | number | boolean | null;
};

export type FunctionType = {
  kind: "FunctionType";
  id: TypeId;
  params: TypeId[];
  returnType: TypeId;
};

export type RecordType = {
  kind: "RecordType";
  id: TypeId;
  name: string;
  fields: Map<string, TypeId>;
};

export type EnumType = {
  kind: "EnumType";
  id: TypeId;
  variants: string[];
};

export type OptionalType = {
  kind: "OptionalType";
  id: TypeId;
  inner: TypeId;
};

export type ListType = {
  kind: "ListType";
  id: TypeId;
  item: TypeId;
};

export type ResultType = {
  kind: "ResultType";
  id: TypeId;
  ok: TypeId;
  error: TypeId;
};

export type UnknownType = {
  kind: "UnknownType";
  id: TypeId;
};

export type ErrorType = {
  kind: "ErrorType";
  id: TypeId;
  message: string;
};

export type TypeRegistry = {
  get(id: TypeId): Type;
  intern(type: TypeInput): TypeId;
  isAssignable(from: TypeId, to: TypeId): boolean;
  display(id: TypeId): string;
};

export type TypeInput =
  | (Omit<PrimitiveType, "id"> & { id?: TypeId })
  | (Omit<LiteralType, "id"> & { id?: TypeId })
  | (Omit<FunctionType, "id"> & { id?: TypeId })
  | (Omit<RecordType, "id"> & { id?: TypeId })
  | (Omit<EnumType, "id"> & { id?: TypeId })
  | (Omit<OptionalType, "id"> & { id?: TypeId })
  | (Omit<ListType, "id"> & { id?: TypeId })
  | (Omit<ResultType, "id"> & { id?: TypeId })
  | (Omit<UnknownType, "id"> & { id?: TypeId })
  | (Omit<ErrorType, "id"> & { id?: TypeId });

const primitiveNames: PrimitiveName[] = [
  "int",
  "decimal",
  "text",
  "string",
  "bool",
  "uuid",
  "void",
  "null"
];

export function createTypeRegistry(): TypeRegistry {
  const types = new Map<TypeId, Type>();
  const canonical = new Map<string, TypeId>();

  function store(input: TypeInput): TypeId {
    const key = keyForType(input);
    const existing = canonical.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const id = (input.id ?? key) as TypeId;
    const type = {
      ...input,
      id
    } as Type;
    canonical.set(key, id);
    types.set(id, type);
    return id;
  }

  for (const name of primitiveNames) {
    store({
      kind: "PrimitiveType",
      name
    });
  }
  store({ kind: "UnknownType" });

  return {
    get(id) {
      const type = types.get(id);
      if (type === undefined) {
        return types.get("unknown" as TypeId)!;
      }
      return type;
    },
    intern: store,
    isAssignable(from, to) {
      if (from === to) {
        return true;
      }

      const fromType = this.get(from);
      const toType = this.get(to);
      if (fromType.kind === "UnknownType" || toType.kind === "UnknownType") {
        return true;
      }
      return (
        fromType.kind === "PrimitiveType" &&
        toType.kind === "PrimitiveType" &&
        fromType.name === "text" &&
        toType.name === "string"
      );
    },
    display(id) {
      const type = this.get(id);
      switch (type.kind) {
        case "PrimitiveType":
          return type.name;
        case "LiteralType":
          return JSON.stringify(type.value);
        case "FunctionType":
          return `fn(${type.params.map((param) => this.display(param)).join(", ")}) -> ${this.display(type.returnType)}`;
        case "RecordType":
          return type.name;
        case "EnumType":
          return `enum[${type.variants.join(", ")}]`;
        case "OptionalType":
          return `${this.display(type.inner)}?`;
        case "ListType":
          return `list[${this.display(type.item)}]`;
        case "ResultType":
          return `result[${this.display(type.ok)}, ${this.display(type.error)}]`;
        case "UnknownType":
          return "unknown";
        case "ErrorType":
          return "error";
      }
    }
  };
}

export function primitiveTypeId(name: PrimitiveName | "unknown"): TypeId {
  return name as TypeId;
}

function keyForType(type: TypeInput): string {
  switch (type.kind) {
    case "PrimitiveType":
      return type.name;
    case "LiteralType":
      return `literal:${JSON.stringify(type.value)}`;
    case "FunctionType":
      return `fn:${type.params.join(",")}->${type.returnType}`;
    case "RecordType":
      return `record:${type.name}`;
    case "EnumType":
      return `enum:${type.variants.join("|")}`;
    case "OptionalType":
      return `optional:${type.inner}`;
    case "ListType":
      return `list:${type.item}`;
    case "ResultType":
      return `result:${type.ok}:${type.error}`;
    case "UnknownType":
      return "unknown";
    case "ErrorType":
      return `error:${type.message}`;
  }
}
