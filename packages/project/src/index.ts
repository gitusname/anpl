import type { ImportDecl, ModuleDecl, Program } from "@anpl/ast";
import type { Diagnostic, Span } from "@anpl/core";
import { createDiagnostic } from "@anpl/core";
import type { ProductionSourceFile } from "@anpl/source";
import { createSourceFile, hashSource } from "@anpl/source";
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
  diagnostics: Diagnostic[];
  cache: ProjectCacheMetadata;
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

export type ParseManifestResult = {
  manifest: AnplManifest;
  diagnostics: Diagnostic[];
};

export type ProjectCacheMetadata = {
  manifestHash: string;
  sourceHashes: Record<string, string>;
  cacheKey: string;
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
  const manifestFileExists = await host.fileExists(manifestPath);
  const loadedManifest = manifestFileExists
    ? await readManifest(manifestPath, host)
    : {
        manifest: defaultManifest,
        diagnostics: []
      };
  const manifest = {
    ...loadedManifest.manifest,
    entry: options.entry ?? loadedManifest.manifest.entry
  };
  const discovery = await discoverSourcePathsDetailed(root, manifest, host, {
    reportPatternDiagnostics: manifestFileExists
  });
  const diagnostics = [...loadedManifest.diagnostics, ...discovery.diagnostics];
  const files: ProductionSourceFile[] = [];

  for (const sourcePath of discovery.paths) {
    try {
      files.push(createSourceFile(sourcePath, await host.readFile(sourcePath)));
    } catch (error) {
      diagnostics.push(
        projectDiagnostic({
          code: "ANPL_PROJECT_SOURCE_READ_ERROR",
          message: `Could not read ANPL source file '${sourcePath}'.`,
          file: sourcePath,
          symbol: sourcePath,
          cause: "The project loader resolved a source path, but the compiler host could not read it.",
          fix: "Make the file readable or remove it from the manifest source patterns.",
          evidence: [error instanceof Error ? error.message : String(error)]
        })
      );
    }
  }

  return {
    root,
    manifest,
    files,
    moduleGraph: emptyModuleGraph(),
    diagnostics,
    cache: createProjectCache(manifest, files)
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
  return (await discoverSourcePathsDetailed(root, manifest, host)).paths;
}

type SourceDiscoveryResult = {
  paths: string[];
  diagnostics: Diagnostic[];
};

async function discoverSourcePathsDetailed(
  root: string,
  manifest: AnplManifest,
  host: ProjectHost,
  options: { reportPatternDiagnostics?: boolean } = {}
): Promise<SourceDiscoveryResult> {
  const sourcePaths = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  const entryPath = await host.resolvePath(root, manifest.entry);

  for (const pattern of manifest.source) {
    if (isGlobPattern(pattern)) {
      if (host.readDir === undefined) {
        if (options.reportPatternDiagnostics === true) {
          diagnostics.push(sourcePatternDiagnostic(pattern, "Compiler host does not support directory reads."));
        }
        continue;
      }
      const base = await host.resolvePath(root, staticBaseForGlob(pattern));
      if (!(await host.fileExists(base))) {
        if (options.reportPatternDiagnostics === true) {
          diagnostics.push(sourcePatternDiagnostic(pattern, `Source pattern base '${base}' does not exist.`));
        }
        continue;
      }
      let candidates: string[];
      try {
        candidates = await walkFiles(base, host);
      } catch (error) {
        if (options.reportPatternDiagnostics === true) {
          diagnostics.push(
            sourcePatternDiagnostic(pattern, error instanceof Error ? error.message : String(error))
          );
        }
        continue;
      }
      for (const candidate of candidates) {
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
    } else if (options.reportPatternDiagnostics === true) {
      diagnostics.push(
        projectDiagnostic({
          code: "ANPL_PROJECT_SOURCE_NOT_FOUND",
          message: `Source file '${pattern}' from anpl.json was not found.`,
          symbol: pattern,
          expected: "readable ANPL source file",
          received: "missing file",
          cause: "The manifest source list references a file that the compiler host cannot find.",
          fix: "Create the source file or remove the path from anpl.json."
        })
      );
    }
  }

  if (await host.fileExists(entryPath)) {
    sourcePaths.add(entryPath);
  } else {
    diagnostics.push(
      projectDiagnostic({
        code: "ANPL_PROJECT_ENTRY_NOT_FOUND",
        message: `Project entry '${manifest.entry}' was not found.`,
        symbol: manifest.entry,
        expected: "readable ANPL entry file",
        received: "missing file",
        cause: "The compiler could not resolve the project entry file before parsing.",
        fix: "Create the entry file, update anpl.json, or pass a valid entry path."
      })
    );
  }

  return {
    paths: [...sourcePaths].sort((left, right) =>
      relativePath(root, left).localeCompare(relativePath(root, right))
    ),
    diagnostics
  };
}

export function parseManifest(content: string): AnplManifest {
  return parseManifestResult(content).manifest;
}

export function parseManifestResult(content: string, file = "anpl.json"): ParseManifestResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return {
      manifest: defaultManifest,
      diagnostics: [
        projectDiagnostic({
          code: "ANPL_PROJECT_INVALID_MANIFEST",
          message: `Invalid ANPL manifest '${file}'.`,
          file,
          expected: "valid JSON object",
          received: "invalid JSON",
          cause: "The project manifest could not be parsed as JSON.",
          fix: "Fix the JSON syntax in anpl.json.",
          evidence: [error instanceof Error ? error.message : String(error)]
        })
      ]
    };
  }

  return normalizeManifest(parsed, file);
}

async function readManifest(
  manifestPath: string,
  host: ProjectHost
): Promise<ParseManifestResult> {
  try {
    return parseManifestResult(await host.readFile(manifestPath), manifestPath);
  } catch (error) {
    return {
      manifest: defaultManifest,
      diagnostics: [
        projectDiagnostic({
          code: "ANPL_PROJECT_INVALID_MANIFEST",
          message: `Could not read ANPL manifest '${manifestPath}'.`,
          file: manifestPath,
          expected: "readable anpl.json",
          received: "unreadable manifest",
          cause: "The project manifest exists, but the compiler host could not read it.",
          fix: "Make anpl.json readable or run the compiler from the correct project root.",
          evidence: [error instanceof Error ? error.message : String(error)]
        })
      ]
    };
  }
}

function normalizeManifest(parsed: unknown, file: string): ParseManifestResult {
  if (!isRecord(parsed)) {
    return {
      manifest: defaultManifest,
      diagnostics: [
        projectDiagnostic({
          code: "ANPL_PROJECT_INVALID_MANIFEST",
          message: `Invalid ANPL manifest '${file}'.`,
          file,
          expected: "JSON object",
          received: describeValue(parsed),
          cause: "The project manifest root must be an object.",
          fix: "Replace anpl.json with an object containing name, entry, source, target, and language fields."
        })
      ]
    };
  }

  const diagnostics: Diagnostic[] = [];
  const target = isRecord(parsed.target) ? parsed.target : undefined;
  const language = isRecord(parsed.language) ? parsed.language : undefined;

  if (parsed.target !== undefined && target === undefined) {
    diagnostics.push(invalidManifestField(file, "target", "object", describeValue(parsed.target)));
  }

  if (parsed.language !== undefined && language === undefined) {
    diagnostics.push(invalidManifestField(file, "language", "object", describeValue(parsed.language)));
  }

  return {
    manifest: {
      name: optionalString(parsed.name, defaultManifest.name, file, "name", diagnostics),
      version: optionalString(parsed.version, defaultManifest.version, file, "version", diagnostics),
      entry: optionalString(parsed.entry, defaultManifest.entry, file, "entry", diagnostics),
      source: optionalStringArray(parsed.source, defaultManifest.source, file, "source", diagnostics),
      target: {
        default: optionalTargetDefault(
          target?.default,
          defaultManifest.target.default,
          file,
          "target.default",
          diagnostics
        ),
        outDir: optionalString(
          target?.outDir,
          defaultManifest.target.outDir,
          file,
          "target.outDir",
          diagnostics
        )
      },
      language: {
        version: optionalLanguageVersion(
          language?.version,
          defaultManifest.language.version,
          file,
          "language.version",
          diagnostics
        ),
        strict: optionalBoolean(
          language?.strict,
          defaultManifest.language.strict,
          file,
          "language.strict",
          diagnostics
        ),
        canonical: optionalBoolean(
          language?.canonical,
          defaultManifest.language.canonical,
          file,
          "language.canonical",
          diagnostics
        )
      }
    },
    diagnostics
  };
}

function createProjectCache(
  manifest: AnplManifest,
  files: ProductionSourceFile[]
): ProjectCacheMetadata {
  const manifestHash = hashSource(JSON.stringify(manifest));
  const sourceHashes = Object.fromEntries(
    files
      .map((file) => [file.path, file.hash] as const)
      .sort(([left], [right]) => left.localeCompare(right))
  );
  const cacheKey = hashSource(
    [manifestHash, ...Object.entries(sourceHashes).map(([path, hash]) => `${path}:${hash}`)].join("\n")
  );

  return {
    manifestHash,
    sourceHashes,
    cacheKey
  };
}

function optionalString(
  value: unknown,
  fallback: string,
  file: string,
  field: string,
  diagnostics: Diagnostic[]
): string {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  diagnostics.push(invalidManifestField(file, field, "non-empty string", describeValue(value)));
  return fallback;
}

function optionalStringArray(
  value: unknown,
  fallback: string[],
  file: string,
  field: string,
  diagnostics: Diagnostic[]
): string[] {
  if (value === undefined) {
    return fallback;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)) {
    return value;
  }

  diagnostics.push(invalidManifestField(file, field, "array of non-empty strings", describeValue(value)));
  return fallback;
}

function optionalBoolean(
  value: unknown,
  fallback: boolean,
  file: string,
  field: string,
  diagnostics: Diagnostic[]
): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  diagnostics.push(invalidManifestField(file, field, "boolean", describeValue(value)));
  return fallback;
}

function optionalTargetDefault(
  value: unknown,
  fallback: AnplManifest["target"]["default"],
  file: string,
  field: string,
  diagnostics: Diagnostic[]
): AnplManifest["target"]["default"] {
  if (value === undefined) {
    return fallback;
  }

  if (value === "js" || value === "ts" || value === "interpreter") {
    return value;
  }

  diagnostics.push(invalidManifestField(file, field, "'js', 'ts', or 'interpreter'", describeValue(value)));
  return fallback;
}

function optionalLanguageVersion(
  value: unknown,
  fallback: AnplManifest["language"]["version"],
  file: string,
  field: string,
  diagnostics: Diagnostic[]
): AnplManifest["language"]["version"] {
  if (value === undefined) {
    return fallback;
  }

  if (value === "0.1") {
    return value;
  }

  diagnostics.push(invalidManifestField(file, field, "'0.1'", describeValue(value)));
  return fallback;
}

function invalidManifestField(
  file: string,
  field: string,
  expected: string,
  received: string
): Diagnostic {
  return projectDiagnostic({
    code: "ANPL_PROJECT_INVALID_MANIFEST",
    message: `Invalid anpl.json field '${field}'.`,
    file,
    symbol: field,
    expected,
    received,
    cause: "The project manifest field does not match the ANPL manifest schema.",
    fix: `Update '${field}' to use ${expected}.`
  });
}

function sourcePatternDiagnostic(pattern: string, evidence: string): Diagnostic {
  return projectDiagnostic({
    code: "ANPL_PROJECT_SOURCE_PATTERN_UNREADABLE",
    message: `Source pattern '${pattern}' could not be read.`,
    symbol: pattern,
    expected: "readable source pattern",
    received: "unreadable source pattern",
    cause: "The project loader could not enumerate files for a manifest source pattern.",
    fix: "Create the pattern base directory, fix the source pattern, or use a host with readDir support.",
    evidence: [evidence]
  });
}

function projectDiagnostic(input: {
  code: string;
  message: string;
  file?: string;
  symbol?: string;
  expected?: string;
  received?: string;
  cause?: string;
  fix?: string;
  evidence?: string[];
}): Diagnostic {
  return createDiagnostic({
    code: input.code,
    severity: "error",
    category: "project",
    message: input.message,
    file: input.file,
    symbol: input.symbol,
    expected: input.expected,
    received: input.received,
    cause: input.cause,
    fix: input.fix,
    evidence: input.evidence,
    confidence: "high"
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
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
