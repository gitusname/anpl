import { describe, expect, it } from "vitest";
import { parseAnpl } from "@anpl/parser";
import {
  buildModuleGraph,
  createProjectFiles,
  discoverSourcePaths,
  initProject,
  loadProject,
  parseManifest,
  parseManifestResult,
  type ProjectHost
} from "./index.js";

function memoryHost(files: Record<string, string>): ProjectHost {
  return {
    readFile: async (path) => {
      const content = files[normalizePath(path)];
      if (content === undefined) {
        throw new Error(`Missing file ${path}`);
      }
      return content;
    },
    writeFile: async (path, content) => {
      files[normalizePath(path)] = content;
    },
    fileExists: async (path) => {
      const normalizedPath = normalizePath(path).replace(/\/$/, "");
      return (
        files[normalizedPath] !== undefined ||
        Object.keys(files).some((filePath) => filePath.startsWith(`${normalizedPath}/`))
      );
    },
    resolvePath: async (from, specifier) =>
      specifier.startsWith("/")
        ? normalizePath(specifier)
        : normalizePath(`${from.replace(/\/$/, "")}/${specifier}`),
    readDir: async (path) => {
      const normalizedPath = normalizePath(path).replace(/\/$/, "");
      const prefix = `${normalizedPath}/`;
      const children = new Map<string, "file" | "directory">();

      for (const filePath of Object.keys(files)) {
        if (!filePath.startsWith(prefix)) {
          continue;
        }
        const parts = filePath.slice(prefix.length).split("/");
        const name = parts[0];
        if (name === undefined || name.length === 0) {
          continue;
        }
        children.set(name, parts.length > 1 ? "directory" : "file");
      }

      return [...children.entries()].map(([name, kind]) => ({
        name,
        path: normalizePath(`${normalizedPath}/${name}`),
        kind
      }));
    }
  };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/\.$/, "");
}

describe("project system", () => {
  it("parses manifests with defaults", () => {
    const manifest = parseManifest(
      JSON.stringify({
        name: "crm",
        entry: "main.anpl"
      })
    );

    expect(manifest.name).toBe("crm");
    expect(manifest.entry).toBe("main.anpl");
    expect(manifest.target.outDir).toBe("dist");
  });

  it("reports invalid manifest JSON as structured diagnostics", () => {
    const result = parseManifestResult("{", "/project/anpl.json");

    expect(result.manifest.entry).toBe("src/main.anpl");
    expect(result.diagnostics).toMatchObject([
      {
        code: "ANPL_PROJECT_INVALID_MANIFEST",
        category: "project",
        file: "/project/anpl.json",
        expected: "valid JSON object",
        received: "invalid JSON"
      }
    ]);
  });

  it("reports invalid manifest fields without throwing", () => {
    const result = parseManifestResult(
      JSON.stringify({
        name: 42,
        source: ["src/main.anpl", ""],
        target: {
          default: "wasm"
        }
      }),
      "/project/anpl.json"
    );

    expect(result.manifest.name).toBe("anpl-project");
    expect(result.manifest.target.default).toBe("js");
    expect(result.diagnostics.map((diagnostic) => diagnostic.symbol)).toEqual([
      "name",
      "source",
      "target.default"
    ]);
  });

  it("discovers manifest source globs and always includes the entry file", async () => {
    const host = memoryHost({
      "/project/anpl.json": JSON.stringify({
        name: "crm",
        entry: "app/main.anpl",
        source: ["src/**/*.anpl"]
      }),
      "/project/app/main.anpl": "module app",
      "/project/src/math.anpl": "module math",
      "/project/src/nested/crm.anpl": "module crm"
    });

    const manifest = parseManifest(await host.readFile("/project/anpl.json"));
    const sources = await discoverSourcePaths("/project", manifest, host);
    const project = await loadProject("/project", host);

    expect(sources).toEqual([
      "/project/app/main.anpl",
      "/project/src/math.anpl",
      "/project/src/nested/crm.anpl"
    ]);
    expect(project.files.map((file) => file.path)).toEqual(sources);
    expect([...project.moduleGraph.modules.keys()]).toEqual(["app", "math", "crm"]);
  });

  it("reports missing manifest source patterns and entry files", async () => {
    const project = await loadProject(
      "/project",
      memoryHost({
        "/project/anpl.json": JSON.stringify({
          name: "missing-sources",
          entry: "src/main.anpl",
          source: ["src/**/*.anpl", "extra.anpl"]
        })
      })
    );

    expect(project.files).toEqual([]);
    expect(project.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "ANPL_PROJECT_SOURCE_PATTERN_UNREADABLE",
      "ANPL_PROJECT_SOURCE_NOT_FOUND",
      "ANPL_PROJECT_ENTRY_NOT_FOUND"
    ]);
  });

  it("reports unreadable manifest source patterns when directory walking fails", async () => {
    const host = memoryHost({
      "/project/anpl.json": JSON.stringify({
        name: "unreadable",
        entry: "src/main.anpl",
        source: ["src/**/*.anpl"]
      }),
      "/project/src/main.anpl": "module app"
    });
    host.readDir = async () => {
      throw new Error("permission denied");
    };

    const project = await loadProject("/project", host);

    expect(project.files.map((file) => file.path)).toEqual(["/project/src/main.anpl"]);
    expect(project.diagnostics).toMatchObject([
      {
        code: "ANPL_PROJECT_SOURCE_PATTERN_UNREADABLE",
        evidence: ["permission denied"]
      }
    ]);
  });

  it("computes cache metadata from effective manifest and source hashes", async () => {
    const host = memoryHost({
      "/project/anpl.json": JSON.stringify({
        name: "cache-demo",
        entry: "src/main.anpl",
        source: ["src/main.anpl"]
      }),
      "/project/src/main.anpl": `module app

fn main() -> int {
  return 1
}`
    });

    const first = await loadProject("/project", host);
    await host.writeFile?.(
      "/project/src/main.anpl",
      `module app

fn main() -> int {
  return 2
}`
    );
    const second = await loadProject("/project", host);
    const third = await loadProject("/project", host, {
      entry: "src/other.anpl"
    });

    expect(first.cache.sourceHashes["/project/src/main.anpl"]).toBe(first.files[0]?.hash);
    expect(second.cache.sourceHashes["/project/src/main.anpl"]).toBe(second.files[0]?.hash);
    expect(second.cache.cacheKey).not.toBe(first.cache.cacheKey);
    expect(third.cache.manifestHash).not.toBe(second.cache.manifestHash);
  });

  it("builds a module graph from parsed modules", () => {
    const parsed = parseAnpl(`module math

fn add(a: int, b: int) -> int {
  return a + b
}

module app

import math

fn main() -> int {
  return add(2, 3)
}`);
    if (!parsed.ok) {
      throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    const graph = buildModuleGraph(parsed.program, "main.anpl");

    expect(graph.modules.size).toBe(2);
    expect(graph.edges).toEqual([
      {
        from: "app",
        to: "math",
        kind: "import"
      }
    ]);
    expect(graph.diagnostics).toEqual([]);
  });

  it("builds a module graph while loading project sources", async () => {
    const project = await loadProject(
      "/project",
      memoryHost({
        "/project/anpl.json": JSON.stringify({
          name: "graph",
          entry: "src/app.anpl",
          source: ["src/**/*.anpl"]
        }),
        "/project/src/math.anpl": `module math

fn add(a: int, b: int) -> int {
  return a + b
}`,
        "/project/src/app.anpl": `module app

import math

fn main() -> int {
  return add(2, 3)
}`
      })
    );

    expect(project.diagnostics).toEqual([]);
    expect(project.moduleGraph.edges).toEqual([
      {
        from: "app",
        to: "math",
        kind: "import"
      }
    ]);
  });

  it("reports missing project graph imports from loaded sources", async () => {
    const project = await loadProject(
      "/project",
      memoryHost({
        "/project/anpl.json": JSON.stringify({
          name: "missing-import",
          entry: "src/app.anpl",
          source: ["src/**/*.anpl"]
        }),
        "/project/src/app.anpl": `module app

import missing

fn main() -> int {
  return 1
}`
      })
    );

    expect(project.moduleGraph.diagnostics).toMatchObject([
      {
        code: "ANPL_PROJECT_UNKNOWN_MODULE",
        category: "project",
        symbol: "missing",
        expected: "module declared in resolved project sources",
        received: "missing module"
      }
    ]);
    expect(project.diagnostics).toEqual(project.moduleGraph.diagnostics);
  });

  it("creates deterministic project initialization files", async () => {
    const host = memoryHost({});
    const files = await createProjectFiles("/project", host, {
      name: "CRM System"
    });

    expect(files.map((file) => file.path)).toEqual([
      "/project/anpl.json",
      "/project/src/main.anpl"
    ]);
    expect(JSON.parse(files[0]?.content ?? "{}")).toMatchObject({
      name: "crm-system",
      entry: "src/main.anpl",
      source: ["src/**/*.anpl"]
    });
    expect(files[1]?.content).toContain("module crm_system");
  });

  it("initializes a project and protects existing files", async () => {
    const files: Record<string, string> = {};
    const host = memoryHost(files);

    const first = await initProject("/project", host, {
      name: "demo"
    });
    const second = await initProject("/project", host, {
      name: "demo"
    });

    expect(first.ok).toBe(true);
    expect(files["/project/anpl.json"]).toContain("\"name\": \"demo\"");
    expect(files["/project/src/main.anpl"]).toContain("module demo");
    expect(second.ok).toBe(false);
    expect(second.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "ANPL_PROJECT_INIT_EXISTS"
    );
  });
});
