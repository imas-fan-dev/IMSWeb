import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceOnly = process.argv.includes("--source");
const packageJson = readJson("package.json");
const inventory = readJson("entrypoints.json");
const readme = fs.readFileSync(path.join(packageRoot, "README.md"), "utf8");
const failures = [];
const runtimeClasses = new Set(["schema", "z-adapter", "zod-free"]);

function packagePath(relativePath) {
  return path.join(packageRoot, relativePath);
}

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(packagePath(relativePath), "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${relativePath}`, { cause: error });
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expectedTarget(source, extension) {
  return `./dist/${source.slice("src/".length).replace(/\.ts$/, extension)}`;
}

function sourceImportSpecifier(source) {
  return `./${source.slice("src/".length).replace(/\.ts$/, ".js")}`;
}

function resolveRelativeSource(sourceFile, specifier) {
  const base = path.resolve(path.dirname(sourceFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    base.replace(/\.js$/, ".ts"),
    path.join(base, "index.ts"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function moduleSpecifiers(source) {
  const specifiers = [];
  const expression = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(expression)) specifiers.push(match[1]);
  return specifiers;
}

function publicModuleName(subpath) {
  return subpath === "." ? "@imsweb/contracts" : `@imsweb/contracts${subpath.slice(1)}`;
}

const entries = inventory?.entrypoints;
if (!Array.isArray(entries) || entries.length === 0) {
  failures.push("packages/contracts/entrypoints.json must contain a non-empty entrypoints array");
}

const entryBySubpath = new Map();
const entryBySource = new Map();
for (const entry of entries ?? []) {
  if (
    !entry ||
    typeof entry.subpath !== "string" ||
    typeof entry.source !== "string" ||
    !runtimeClasses.has(entry.runtime) ||
    !(typeof entry.namespace === "string" || entry.namespace === null)
  ) {
    failures.push(`invalid entrypoint inventory record: ${JSON.stringify(entry)}`);
    continue;
  }
  if (entryBySubpath.has(entry.subpath)) {
    failures.push(`duplicate entrypoint inventory subpath: ${entry.subpath}`);
  }
  if (entryBySource.has(entry.source)) {
    failures.push(`duplicate entrypoint inventory source: ${entry.source}`);
  }
  entryBySubpath.set(entry.subpath, entry);
  entryBySource.set(entry.source, entry);
}

const exportSubpaths = Object.keys(packageJson.exports ?? {});
for (const subpath of exportSubpaths) {
  if (!entryBySubpath.has(subpath)) {
    failures.push(`package.json export is not listed by inventory: ${subpath}`);
  }
}
for (const subpath of entryBySubpath.keys()) {
  if (!exportSubpaths.includes(subpath)) {
    failures.push(`inventory subpath is missing from package.json exports: ${subpath}`);
  }
}

const indexSourcePath = packagePath("src/index.ts");
const indexSource = fs.existsSync(indexSourcePath)
  ? fs.readFileSync(indexSourcePath, "utf8")
  : "";
for (const entry of entryBySubpath.values()) {
  const sourcePath = packagePath(entry.source);
  if (!fs.existsSync(sourcePath)) {
    failures.push(`${entry.subpath}: source module does not exist: ${entry.source}`);
  }

  const exportTarget = packageJson.exports?.[entry.subpath];
  if (exportTarget) {
    const requireTarget = expectedTarget(entry.source, ".js");
    const typeTarget = expectedTarget(entry.source, ".d.ts");
    if (
      exportTarget.require !== requireTarget ||
      exportTarget.default !== requireTarget ||
      exportTarget.types !== typeTarget
    ) {
      failures.push(
        `${entry.subpath}: package.json export must target ${requireTarget} and ${typeTarget}`,
      );
    }
  }

  const moduleName = publicModuleName(entry.subpath);
  if (!readme.includes(moduleName)) {
    failures.push(`${entry.subpath}: README must list ${moduleName}`);
  }

  if (entry.namespace !== null) {
    const expression = new RegExp(
      `export\\s+\\*\\s+as\\s+${escapeRegex(entry.namespace)}\\s+from\\s+["']${escapeRegex(sourceImportSpecifier(entry.source))}["']`,
    );
    if (!expression.test(indexSource)) {
      failures.push(
        `${entry.subpath}: root namespace ${entry.namespace} must export ${sourceImportSpecifier(entry.source)}`,
      );
    }
  }
}

function checkZodFreeGraph(entry) {
  const pending = [packagePath(entry.source)];
  const visited = new Set();
  while (pending.length) {
    const sourcePath = pending.pop();
    if (!sourcePath || visited.has(sourcePath) || !fs.existsSync(sourcePath)) continue;
    visited.add(sourcePath);

    const source = fs.readFileSync(sourcePath, "utf8");
    for (const specifier of moduleSpecifiers(source)) {
      if (specifier === "zod" || specifier.startsWith("zod/")) {
        failures.push(
          `${entry.subpath}: zod-free source graph reaches ${specifier} through ${path.relative(packageRoot, sourcePath)}`,
        );
        continue;
      }

      if (specifier.startsWith("@imsweb/contracts")) {
        const subpath = specifier === "@imsweb/contracts" ? "." : `.${specifier.slice("@imsweb/contracts".length)}`;
        const importedEntry = entryBySubpath.get(subpath);
        if (!importedEntry || importedEntry.runtime !== "zod-free") {
          failures.push(
            `${entry.subpath}: zod-free source graph imports non-runtime entrypoint ${specifier}`,
          );
        }
        continue;
      }

      if (!specifier.startsWith(".")) continue;
      const dependency = resolveRelativeSource(sourcePath, specifier);
      if (!dependency) {
        failures.push(
          `${entry.subpath}: cannot resolve relative import ${specifier} from ${path.relative(packageRoot, sourcePath)}`,
        );
        continue;
      }
      const relativeDependency = path.relative(packageRoot, dependency).split(path.sep).join("/");
      const importedEntry = entryBySource.get(relativeDependency);
      if (importedEntry && importedEntry.runtime !== "zod-free") {
        failures.push(
          `${entry.subpath}: zod-free source graph imports ${importedEntry.runtime} entrypoint ${importedEntry.subpath}`,
        );
        continue;
      }
      pending.push(dependency);
    }
  }
}

for (const entry of entryBySubpath.values()) {
  if (entry.runtime === "zod-free") checkZodFreeGraph(entry);
}

function checkBuildOutput(entry) {
  const exportTarget = packageJson.exports[entry.subpath];
  for (const target of [exportTarget.require, exportTarget.types]) {
    const outputPath = packagePath(target.replace(/^\.\//, ""));
    if (!fs.existsSync(outputPath)) {
      failures.push(`${entry.subpath}: build output is missing: ${target}`);
    }
  }
}

function checkZodFreeLoader(entry) {
  const probe = `
    const Module = require("node:module");
    const path = require("node:path");
    const { createRequire } = require("node:module");
    const packageRequire = createRequire(path.join(process.cwd(), "package.json"));
    const zodRoot = path.dirname(packageRequire.resolve("zod/package.json"));
    const loads = [];
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (request === "zod" || request.startsWith("zod/")) loads.push(request);
      return originalLoad.call(this, request, parent, isMain);
    };
    packageRequire(process.env.IMS_CONTRACT_ENTRYPOINT);
    const cachedZod = Object.keys(require.cache).filter((file) => file.startsWith(zodRoot));
    if (loads.length || cachedZod.length) {
      throw new Error("loaded zod: " + [...loads, ...cachedZod].join(", "));
    }
  `;
  const result = spawnSync(process.execPath, ["--input-type=commonjs", "-e", probe], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...process.env, IMS_CONTRACT_ENTRYPOINT: publicModuleName(entry.subpath) },
  });
  if (result.status !== 0) {
    failures.push(
      `${entry.subpath}: zod-free loader probe failed: ${(result.stderr || result.stdout).trim()}`,
    );
  }
}

if (!sourceOnly) {
  for (const entry of entryBySubpath.values()) checkBuildOutput(entry);
  for (const entry of entryBySubpath.values()) {
    if (entry.runtime === "zod-free") checkZodFreeLoader(entry);
  }
}

if (failures.length) {
  throw new Error(`Contracts entrypoint check failed:\n${failures.join("\n")}`);
}

process.stdout.write(
  `Contracts entrypoint check passed: ${entryBySubpath.size} public entrypoints${sourceOnly ? " (source only)" : " (source, build output, and loader probes)"}\n`,
);
