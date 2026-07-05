export type LspCapability =
  | "diagnostics"
  | "formatting"
  | "hover"
  | "completion"
  | "semanticTokens";

export type LspStatus = {
  package: "@anpl/lsp";
  implemented: false;
  plannedCapabilities: LspCapability[];
};

export const lspStatus: LspStatus = {
  package: "@anpl/lsp",
  implemented: false,
  plannedCapabilities: ["diagnostics", "formatting", "hover", "completion", "semanticTokens"]
};
