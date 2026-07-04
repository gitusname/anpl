export type Position = {
  offset: number;
  line: number;
  column: number;
};

export type Span = {
  file?: string;
  start: Position;
  end: Position;
};

export type DiagnosticSeverity = "info" | "warning" | "error";

export type DiagnosticConfidence = "low" | "medium" | "high";

export type SourceLocation = {
  file?: string;
  line?: number;
  column?: number;
  span?: Span;
};

export type Diagnostic = SourceLocation & {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  cause?: string;
  fix?: string;
  evidence?: string[];
  confidence?: DiagnosticConfidence;
};

export type AstNode<TKind extends string> = {
  kind: TKind;
  span: Span;
};

export type ProgramNode = AstNode<"Program"> & {
  app?: AppNode;
  entities: EntityNode[];
  apis: ApiNode[];
  auth?: AuthNode;
  database?: DatabaseNode;
};

export type AppNode = AstNode<"App"> & {
  name: string;
};

export type EntityNode = AstNode<"Entity"> & {
  name: string;
  fields: FieldNode[];
};

export type FieldNode = AstNode<"Field"> & {
  name: string;
  type: FieldTypeNode;
  modifiers: FieldModifier[];
};

export type ScalarFieldName =
  | "string"
  | "int"
  | "uuid"
  | "datetime"
  | "decimal"
  | "boolean";

export type FieldTypeNode =
  | (AstNode<"ScalarFieldType"> & {
      name: ScalarFieldName;
    })
  | (AstNode<"ReferenceFieldType"> & {
      entityName: string;
    })
  | (AstNode<"EnumFieldType"> & {
      values: string[];
    });

export type FieldModifier =
  | (AstNode<"PrimaryModifier"> & {
      value?: never;
    })
  | (AstNode<"RequiredModifier"> & {
      value?: never;
    })
  | (AstNode<"OptionalModifier"> & {
      value?: never;
    })
  | (AstNode<"AutoModifier"> & {
      value?: never;
    })
  | (AstNode<"UniqueModifier"> & {
      value?: never;
    })
  | (AstNode<"DefaultModifier"> & {
      value: string;
    });

export type ApiAction = "create" | "list" | "get" | "update" | "delete";

export type ApiOperationFlag =
  | (AstNode<"PaginatedFlag"> & {
      value?: never;
    })
  | (AstNode<"SoftFlag"> & {
      value?: never;
    })
  | (AstNode<"ByFlag"> & {
      fieldName: string;
    });

export type ApiNode = AstNode<"Api"> & {
  name: string;
  operations: ApiOperationNode[];
};

export type ApiOperationNode = AstNode<"ApiOperation"> & {
  action: ApiAction;
  entityName: string;
  flags: ApiOperationFlag[];
};

export type AuthNode = AstNode<"Auth"> & {
  type?: string;
  roles: string[];
};

export type DatabaseNode = AstNode<"Database"> & {
  provider?: string;
  orm?: string;
};

export type AnplIR = {
  appName?: string;
  entities: IREntity[];
  apis: IRApi[];
  auth?: IRAuth;
  database?: IRDatabase;
};

export type IREntity = {
  name: string;
  tableName: string;
  fields: IRField[];
};

export type IRFieldType =
  | {
      kind: "scalar";
      name: ScalarFieldName;
    }
  | {
      kind: "reference";
      entityName: string;
    }
  | {
      kind: "enum";
      values: string[];
    };

export type IRField = {
  name: string;
  columnName: string;
  type: IRFieldType;
  primary: boolean;
  required: boolean;
  unique: boolean;
  auto: boolean;
  default?: string;
};

export type IRApi = {
  name: string;
  operations: IRApiOperation[];
};

export type IRApiOperation = {
  action: ApiAction;
  entityName: string;
  paginated: boolean;
  softDelete: boolean;
  by?: string;
};

export type IRAuth = {
  type: string;
  roles: string[];
};

export type IRDatabase = {
  provider: string;
  orm: string;
};

export type GeneratedFile = {
  path: string;
  content: string;
};
