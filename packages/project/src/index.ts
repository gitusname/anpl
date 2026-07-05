import type { ImportDecl, ModuleDecl, Program } from "@anpl/ast";
import type { Diagnostic, Span } from "@anpl/core";
import { createDiagnostic } from "@anpl/core";
import type { ProductionSourceFile } from "@anpl/source";
import { createSourceFile } from "@anpl/source";
import type { ModuleId } from "@anpl/symbols";
import { createModuleId } from "@anpl/symbols";

export type AnplManifest = {
  name: string;
  version: string;
  entry: string;
  source: string[];
  target: {
    default: "js" | "ts" | "interpreter";
    outDir: string;
  };
  language: {
    version: "0.1";
    strict: boolean;
    canonical: boolean;
  };
};

export type AnplProject = {
  root: string;
  manifest: AnplManifest;
  files: ProductionSourceFile[];
  moduleGraph: ModuleGraph;
};

export type ModuleGraph = {
  modules: Map<ModuleId, ModuleRecord>;
  edges: ModuleEdge[];
  diagnostics: Diagnostic[];
};

export type ModuleRecord = {
  id: ModuleId;
  name: string;
  file: string;
  imports: ImportRecord[];
  span: Span;
};

export type ImportRecord = {
  module: string;
  span: Span;
};

export type ModuleEdge = {
  from: ModuleId;
  to: ModuleId;
  kind: "import";
};

export type ProjectHost = {
  readFile(path: string): Promise<string>;
  fileExists(path: string): Promise<boolean>;
  resolvePath(from: string, specifier: string): Promise<string>;
};

export const defaultManifest: AnplManifest = {
  name: "anpl-project",
  version: "0.1.0",
  entry: "src/main.anpl",
  source: ["src/**/*.anpl"],
  target: {
    default: "js",
    outDir: "dist"
  },
  language: {
    version: "0.1",
    strict: true,
    canonical: true
  }
};

export async function loadProject(root: string, host: ProjectHost): Promise<AnplProject> {
  const manifestPath = await host.resolvePath(root, "anpl.json");
  const manifest = (await host.fileExists(manifestPath))
    ? parseManifest(await host.readFile(manifestPath))
    : defaultManifest;
  const entryPath = await host.resolvePath(root, manifest.entry);
  const entryContent = await host.readFile(entryPath);
  const files = [createSourceFile(entryPath, entryContent)];

  return {
    root,
    manifest,
    files,
    moduleGraph: emptyModuleGraph()
  };
}

export function parseManifest(content: string): AnplManifest {
  const parsed = JSON.parse(content) as Partial<AnplManifest>;

  return {
    ...defaultManifest,
    ...parsed,
    target: {
      ...defaultManifest.target,
      ...parsed.target
    },
    language: {
      ...defaultManifest.language,
      ...parsed.language
    }
  };
}

export function buildModuleGraph(program: Program, file = "<memory>"): ModuleGraph {
  const modules = new Map<ModuleId, ModuleRecord>();
  const edges: ModuleEdge[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const moduleDecl of program.modules) {
    const record = moduleRecord(moduleDecl, file);
    if (modules.has(record.id)) {
      diagnostics.push(
        createDiagnostic({
          code: "ANPL_PROJECT_DUPLICATE_MODULE",
          severity: "error",
          message: `Module '${moduleDecl.name}' is already defined in the project graph.`,
          file,
          line: moduleDecl.span.start.line,
          column: moduleDecl.span.start.column,
          span: moduleDecl.span,
          symbol: moduleDecl.name,
          confidence: "high"
        })
      );
    }
    modules.set(record.id, record);
  }

  for (const record of modules.values()) {
    for (const importDecl of record.imports) {
      const target = createModuleId(importDecl.module);
      if (modules.has(target)) {
        edges.push({
          from: record.id,
          to: target,
          kind: "import"
        });
      } else {
        diagnostics.push(
          createDiagnostic({
            code: "ANPL_PROJECT_UNKNOWN_MODULE",
            severity: "error",
            message: `Imported module '${importDecl.module}' was not found in the project graph.`,
            file,
            line: importDecl.span.start.line,
            column: importDecl.span.start.column,
            span: importDecl.span,
            symbol: importDecl.module,
            confidence: "high"
          })
        );
      }
    }
  }

  return {
    modules,
    edges,
    diagnostics
  };
}

function moduleRecord(moduleDecl: ModuleDecl, file: string): ModuleRecord {
  return {
    id: createModuleId(moduleDecl.name),
    name: moduleDecl.name,
    file,
    imports: moduleDecl.body
      .filter((decl): decl is ImportDecl => decl.kind === "ImportDecl")
      .map((decl) => ({
        module: decl.module,
        span: decl.span
      })),
    span: moduleDecl.span
  };
}

function emptyModuleGraph(): ModuleGraph {
  return {
    modules: new Map(),
    edges: [],
    diagnostics: []
  };
}
