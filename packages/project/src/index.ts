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

export type LoadProjectOptions = {
  entry?: string;
};

export type InitProjectOptions = {
  name?: string;
  moduleName?: string;
  force?: boolean;
};

export type InitProjectResult = {
  ok: boolean;
  files: ProjectFileArtifact[];
  diagnostics: Diagnostic[];
};

export type ProjectFileArtifact = {
  path: string;
  content: string;
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

export type ProjectDirEntry = {
  name: string;
  path: string;
  kind: "file" | "directory";
};

export type ProjectHost = {
  readFile(path: string): Promise<string>;
  writeFile?(path: string, content: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  resolvePath(from: string, specifier: string): Promise<string>;
  readDir?(path: string): Promise<ProjectDirEntry[]>;
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

export async function loadProject(
  root: string,
  host: ProjectHost,
  options: LoadProjectOptions = {}
): Promise<AnplProject> {
  const manifestPath = await host.resolvePath(root, "anpl.json");
  const loadedManifest = (await host.fileExists(manifestPath))
    ? parseManifest(await host.readFile(manifestPath))
    : defaultManifest;
  const manifest = {
    ...loadedManifest,
    entry: options.entry ?? loadedManifest.entry
  };
  const sourcePaths = await discoverSourcePaths(root, manifest, host);
  const files = await Promise.all(
    sourcePaths.map(async (sourcePath) =>
      createSourceFile(sourcePath, await host.readFile(sourcePath))
    )
  );

  return {
    root,
    manifest,
    files,
    moduleGraph: emptyModuleGraph()
  };
}

export async function initProject(
  root: string,
  host: ProjectHost,
  options: InitProjectOptions = {}
): Promise<InitProjectResult> {
  const files = await createProjectFiles(root, host, options);
  const diagnostics: Diagnostic[] = [];

  for (const file of files) {
    if (!options.force && (await host.fileExists(file.path))) {
      diagnostics.push(
        createDiagnostic({
          code: "ANPL_PROJECT_INIT_EXISTS",
          severity: "error",
          category: "project",
          message: `Project file '${file.path}' already exists.`,
          file: file.path,
          cause: "Project initialization would overwrite an existing file.",
          fix: "Choose an empty directory or pass --force to overwrite generated project files.",
          confidence: "high"
        })
      );
    }
  }

  if (diagnostics.length > 0 || host.writeFile === undefined) {
    if (host.writeFile === undefined) {
      diagnostics.push(
        createDiagnostic({
          code: "ANPL_PROJECT_INIT_HOST_READONLY",
          severity: "error",
          category: "project",
          message: "Project host does not support writing files.",
          cause: "Project initialization requires a writable compiler host.",
          fix: "Use a compiler host that implements writeFile.",
          confidence: "high"
        })
      );
    }

    return {
      ok: false,
      files,
      diagnostics
    };
  }

  for (const file of files) {
    await host.writeFile(file.path, file.content);
  }

  return {
    ok: true,
    files,
    diagnostics: []
  };
}

export async function createProjectFiles(
  root: string,
  host: ProjectHost,
  options: InitProjectOptions = {}
): Promise<ProjectFileArtifact[]> {
  const projectName = normalizeProjectName(options.name ?? defaultManifest.name);
  const moduleName = normalizeModuleName(options.moduleName ?? projectName);
  const manifest: AnplManifest = {
    ...defaultManifest,
    name: projectName
  };

  return [
    {
      path: await host.resolvePath(root, "anpl.json"),
      content: `${JSON.stringify(manifest, null, 2)}\n`
    },
    {
      path: await host.resolvePath(root, manifest.entry),
      content: initialMainSource(moduleName)
    }
  ];
}

export async function discoverSourcePaths(
  root: string,
  manifest: AnplManifest,
  host: ProjectHost
): Promise<string[]> {
  const sourcePaths = new Set<string>();
  const entryPath = await host.resolvePath(root, manifest.entry);

  for (const pattern of manifest.source) {
    if (isGlobPattern(pattern)) {
      if (host.readDir === undefined) {
        continue;
      }
      const base = await host.resolvePath(root, staticBaseForGlob(pattern));
      if (!(await host.fileExists(base))) {
        continue;
      }
      for (const candidate of await walkFiles(base, host)) {
        const relative = relativePath(root, candidate);
        if (matchesGlob(relative, pattern)) {
          sourcePaths.add(candidate);
        }
      }
      continue;
    }

    const sourcePath = await host.resolvePath(root, pattern);
    if (await host.fileExists(sourcePath)) {
      sourcePaths.add(sourcePath);
    }
  }

  if (await host.fileExists(entryPath)) {
    sourcePaths.add(entryPath);
  }

  return [...sourcePaths].sort((left, right) => relativePath(root, left).localeCompare(relativePath(root, right)));
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
    const record = moduleRecord(moduleDecl, moduleDecl.span.file || file);
    if (modules.has(record.id)) {
      diagnostics.push(
        createDiagnostic({
            code: "ANPL_PROJECT_DUPLICATE_MODULE",
            severity: "error",
            message: `Module '${moduleDecl.name}' is already defined in the project graph.`,
          file: record.file,
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
            file: importDecl.span.file || record.file,
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

async function walkFiles(root: string, host: ProjectHost): Promise<string[]> {
  const entries = await host.readDir?.(root);
  if (entries === undefined) {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (entry.kind === "directory") {
      if (shouldSkipDirectory(entry.name)) {
        continue;
      }
      files.push(...(await walkFiles(entry.path, host)));
    } else {
      files.push(entry.path);
    }
  }
  return files;
}

function shouldSkipDirectory(name: string): boolean {
  return [".git", "node_modules", "dist", "generated"].includes(name);
}

function isGlobPattern(pattern: string): boolean {
  return /[*?[\]]/.test(pattern);
}

function staticBaseForGlob(pattern: string): string {
  const globIndex = pattern.search(/[*?[\]]/);
  if (globIndex === -1) {
    return dirnameLike(pattern);
  }

  const prefix = normalizePath(pattern.slice(0, globIndex));
  if (prefix.endsWith("/")) {
    return prefix.replace(/\/+$/, "") || ".";
  }
  return dirnameLike(prefix);
}

function dirnameLike(path: string): string {
  const normalized = normalizePath(path).replace(/\/+$/, "");
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex === -1) {
    return ".";
  }
  return normalized.slice(0, slashIndex) || ".";
}

function matchesGlob(path: string, pattern: string): boolean {
  return globToRegExp(pattern).test(normalizePath(path));
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePath(pattern);
  let source = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === "*" && next === "*") {
      const afterNext = normalized[index + 2];
      if (afterNext === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += escapeRegExp(char ?? "");
  }

  return new RegExp(`^${source}$`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$+?.()|{}[\]]/g, "\\$&");
}

function relativePath(root: string, path: string): string {
  const normalizedRoot = normalizePath(root).replace(/\/+$/, "");
  const normalizedPath = normalizePath(path);
  if (normalizedPath === normalizedRoot) {
    return "";
  }
  if (normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }
  return normalizedPath;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
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

function normalizeProjectName(name: string): string {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length === 0 ? defaultManifest.name : normalized;
}

function normalizeModuleName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const withPrefix = /^[a-z_]/.test(normalized) ? normalized : `app_${normalized}`;
  return withPrefix.length === 0 ? "app" : withPrefix;
}

function initialMainSource(moduleName: string): string {
  return `module ${moduleName}

fn main() -> int {
  return 0
}
`;
}
