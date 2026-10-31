import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(scriptFile), "..");
const runtimeClasses = new Set(["schema", "z-adapter", "zod-free"]);
const buildFormats = { cjs: "commonjs", esm: "module" };
const buildConditions = { cjs: "require", esm: "import" };

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

export function deepEqual(left, right) {
  if (left === right) return true;
  if (typeof left !== "object" || typeof right !== "object") return false;
  if (left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => deepEqual(value, right[index]))
    );
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]),
    )
  );
}

function outputTarget(entry, outDir, extension) {
  const relativeSource = entry.source
    .replace(/^src\//, "")
    .replace(/\.ts$/, extension);
  return `./${outDir}/${relativeSource}`;
}

/**
 * Reads the optional dual-build layout from entrypoints.json. A missing
 * `build` block keeps the legacy single-tree contract (used by fixtures and by
 * the checker's own tests); a present block is validated strictly.
 */
export function readBuildLayout(inventory) {
  const build = inventory?.build;
  if (build === undefined) return { layout: null, problems: [] };
  const problems = [];
  if (typeof build !== "object" || build === null || Array.isArray(build)) {
    return {
      layout: null,
      problems: ["entrypoints.json build must be an object with cjs and esm records"],
    };
  }
  const layout = {};
  for (const format of Object.keys(buildFormats)) {
    const record = build[format];
    if (typeof record !== "object" || record === null || Array.isArray(record)) {
      problems.push(`entrypoints.json must define build.${format} as an object`);
      continue;
    }
    if (record.module !== buildFormats[format]) {
      problems.push(
        `entrypoints.json build.${format}.module must be "${buildFormats[format]}"`,
      );
    }
    if (
      typeof record.outDir !== "string" ||
      record.outDir.length === 0 ||
      path.isAbsolute(record.outDir) ||
      record.outDir.split(/[\\/]/).includes("..")
    ) {
      problems.push(
        `entrypoints.json build.${format}.outDir must be a relative directory`,
      );
      continue;
    }
    const outDir = record.outDir.replace(/^\.\//, "").replace(/\/+$/, "");
    if (!outDir) {
      problems.push(`entrypoints.json build.${format}.outDir must not be the package root`);
      continue;
    }
    layout[format] = { outDir, module: buildFormats[format] };
  }
  for (const extra of Object.keys(build)) {
    if (!Object.hasOwn(buildFormats, extra)) {
      problems.push(`entrypoints.json build has an unknown format: ${extra}`);
    }
  }
  if (
    layout.cjs &&
    layout.esm &&
    layout.cjs.outDir === layout.esm.outDir
  ) {
    problems.push("entrypoints.json CJS and ESM builds must not share one outDir");
  }
  return { layout: problems.length ? null : layout, problems };
}

export function derivePackageExports(inventory, layout) {
  if (!layout) throw new Error("A validated build layout is required");
  const exports = {};
  for (const entry of inventory.entrypoints) {
    const record = {};
    for (const format of ["esm", "cjs"]) {
      record[buildConditions[format]] = {
        types: outputTarget(entry, layout[format].outDir, ".d.ts"),
        default: outputTarget(entry, layout[format].outDir, ".js"),
      };
    }
    exports[entry.subpath] = record;
  }
  return exports;
}

export function deriveLegacyFields(inventory, layout) {
  if (!layout) throw new Error("A validated build layout is required");
  const root = inventory.entrypoints.find((entry) => entry.subpath === ".");
  if (!root) throw new Error("entrypoints.json must contain the root entrypoint (.)");
  return {
    main: outputTarget(root, layout.cjs.outDir, ".js"),
    types: outputTarget(root, layout.cjs.outDir, ".d.ts"),
  };
}

function legacyExportTarget(entry) {
  return {
    types: expectedTarget(entry.source, ".d.ts"),
    require: expectedTarget(entry.source, ".js"),
    default: expectedTarget(entry.source, ".js"),
  };
}

function checkBuildConfiguration(layout, failures) {
  for (const [format, configFile] of [
    ["cjs", "tsconfig.cjs.json"],
    ["esm", "tsconfig.esm.json"],
  ]) {
    let config;
    try {
      config = readJson(configFile);
    } catch (error) {
      failures.push(`${configFile}: ${error.message}`);
      continue;
    }
    const outDir = config?.compilerOptions?.outDir;
    if (outDir !== layout[format].outDir) {
      failures.push(
        `${configFile}: compilerOptions.outDir must match entrypoints.json build.${format}.outDir (${layout[format].outDir})`,
      );
    }
  }
}

function checkDistMarker(layout, failures) {
  for (const format of Object.keys(buildFormats)) {
    const markerPath = `${layout[format].outDir}/package.json`;
    if (!fs.existsSync(packagePath(markerPath))) {
      failures.push(`${markerPath}: build marker is missing (run the contracts build)`);
      continue;
    }
    let marker;
    try {
      marker = JSON.parse(fs.readFileSync(packagePath(markerPath), "utf8"));
    } catch (error) {
      failures.push(`${markerPath}: invalid JSON (${error.message})`);
      continue;
    }
    if (marker.type !== buildFormats[format]) {
      failures.push(`${markerPath}: must declare "type": "${buildFormats[format]}"`);
    }
  }
}

function checkDualBuildOutput(entry, layout, failures) {
  for (const format of Object.keys(buildFormats)) {
    for (const extension of [".js", ".d.ts"]) {
      const target = outputTarget(entry, layout[format].outDir, extension);
      if (!fs.existsSync(packagePath(target.replace(/^\.\//, "")))) {
        failures.push(
          `${entry.subpath}: ${format.toUpperCase()} build output is missing: ${target}`,
        );
      }
    }
  }
}

function checkFormatLoadProbes(entryBySubpath, failures) {
  const specifiers = [...entryBySubpath.keys()].map(publicModuleName);
  const probes = {
    CJS: [
      "--input-type=commonjs",
      "-e",
      'const req = require("node:module").createRequire(process.cwd() + "/package.json"); for (const specifier of JSON.parse(process.env.IMS_CONTRACTS_ENTRIES)) req(specifier);',
    ],
    ESM: [
      "--input-type=module",
      "-e",
      'for (const specifier of JSON.parse(process.env.IMS_CONTRACTS_ENTRIES)) await import(specifier);',
    ],
  };
  for (const [format, args] of Object.entries(probes)) {
    const result = spawnSync(process.execPath, args, {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        IMS_CONTRACTS_ENTRIES: JSON.stringify(specifiers),
      },
    });
    if (result.status !== 0) {
      failures.push(
        `${format} module load probe failed: ${(result.stderr || result.stdout).trim()}`,
      );
    }
  }
}

function checkZodFreeCjsLoader(entry, failures) {
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
      `${entry.subpath}: zod-free CJS loader probe failed: ${(result.stderr || result.stdout).trim()}`,
    );
  }
}

function checkZodFreeEsmLoader(entry, layout, failures) {
  const target = outputTarget(entry, layout.esm.outDir, ".js").replace(/^\.\//, "");
  const probe = `
    import { createRequire } from "node:module";
    import path from "node:path";
    const packageRequire = createRequire(path.join(process.cwd(), "package.json"));
    const Module = packageRequire("node:module");
    const zodRoot = path.dirname(packageRequire.resolve("zod/package.json"));
    const loads = [];
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (request === "zod" || request.startsWith("zod/")) loads.push(request);
      return originalLoad.call(this, request, parent, isMain);
    };
    await import(process.env.IMS_CONTRACT_ENTRYPOINT_FILE);
    const cachedZod = Object.keys(packageRequire.cache).filter((file) => file.startsWith(zodRoot));
    if (loads.length || cachedZod.length) {
      throw new Error("loaded zod: " + [...loads, ...cachedZod].join(", "));
    }
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
    cwd: packageRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      IMS_CONTRACT_ENTRYPOINT_FILE: pathToFileURL(packagePath(target)).href,
    },
  });
  if (result.status !== 0) {
    failures.push(
      `${entry.subpath}: zod-free ESM loader probe failed: ${(result.stderr || result.stdout).trim()}`,
    );
  }
}

function checkEntrypointInventory(entry, indexSource, readme, entryBySubpath, entryBySource, failures) {
  const sourcePath = packagePath(entry.source);
  if (!fs.existsSync(sourcePath)) {
    failures.push(`${entry.subpath}: source module does not exist: ${entry.source}`);
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

function checkZodFreeGraph(entry, entryBySubpath, entryBySource, failures) {
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
        const subpath =
          specifier === "@imsweb/contracts"
            ? "."
            : `.${specifier.slice("@imsweb/contracts".length)}`;
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
      const relativeDependency = path
        .relative(packageRoot, dependency)
        .split(path.sep)
        .join("/");
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

function main() {
  const sourceOnly = process.argv.includes("--source");
  const packageJson = readJson("package.json");
  const inventory = readJson("entrypoints.json");
  const readme = fs.readFileSync(packagePath("README.md"), "utf8");
  const failures = [];

  const entries = inventory?.entrypoints;
  if (!Array.isArray(entries) || entries.length === 0) {
    failures.push(
      "packages/contracts/entrypoints.json must contain a non-empty entrypoints array",
    );
  }

  const entryBySubpath = new Map();
  const entryBySource = new Map();
  for (const entry of entries ?? []) {
    if (
      !entry ||
      typeof entry.subpath !== "string" ||
      typeof entry.source !== "string" ||
      !entry.source.startsWith("src/") ||
      !entry.source.endsWith(".ts") ||
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

  const { layout, problems } = readBuildLayout(inventory);
  failures.push(...problems);

  if (layout) {
    checkBuildConfiguration(layout, failures);
    let expectedExports;
    try {
      expectedExports = derivePackageExports(inventory, layout);
    } catch (error) {
      failures.push(error.message);
      expectedExports = null;
    }
    if (expectedExports) {
      const actualExports = packageJson.exports ?? {};
      for (const [subpath, expected] of Object.entries(expectedExports)) {
        if (!Object.hasOwn(actualExports, subpath)) {
          failures.push(
            `${subpath}: package.json export is missing; run node scripts/derive-exports.mjs`,
          );
        } else if (!deepEqual(actualExports[subpath], expected)) {
          failures.push(
            `${subpath}: package.json export must be ${JSON.stringify(expected)}; run node scripts/derive-exports.mjs`,
          );
        }
      }
      for (const subpath of Object.keys(actualExports)) {
        if (!Object.hasOwn(expectedExports, subpath)) {
          failures.push(`package.json export is not listed by inventory: ${subpath}`);
        }
      }
      const legacy = deriveLegacyFields(inventory, layout);
      if (packageJson.main !== legacy.main) {
        failures.push(
          `package.json main must be ${legacy.main}; run node scripts/derive-exports.mjs`,
        );
      }
      if (packageJson.types !== legacy.types) {
        failures.push(
          `package.json types must be ${legacy.types}; run node scripts/derive-exports.mjs`,
        );
      }
    }
  } else if (problems.length === 0) {
    const exportSubpaths = Object.keys(packageJson.exports ?? {});
    for (const subpath of exportSubpaths) {
      if (!entryBySubpath.has(subpath)) {
        failures.push(`package.json export is not listed by inventory: ${subpath}`);
      }
    }
    for (const [subpath, entry] of entryBySubpath) {
      if (!exportSubpaths.includes(subpath)) {
        failures.push(`inventory subpath is missing from package.json exports: ${subpath}`);
        continue;
      }
      const exportTarget = packageJson.exports?.[subpath];
      if (!exportTarget) continue;
      const expected = legacyExportTarget(entry);
      for (const condition of ["types", "require", "default"]) {
        if (exportTarget[condition] !== expected[condition]) {
          failures.push(
            `${subpath}: package.json export must target ${expected[condition]} for ${condition}`,
          );
        }
      }
    }
  }

  const indexSourcePath = packagePath("src/index.ts");
  const indexSource = fs.existsSync(indexSourcePath)
    ? fs.readFileSync(indexSourcePath, "utf8")
    : "";
  for (const entry of entryBySubpath.values()) {
    checkEntrypointInventory(
      entry,
      indexSource,
      readme,
      entryBySubpath,
      entryBySource,
      failures,
    );
    if (entry.runtime === "zod-free") {
      checkZodFreeGraph(entry, entryBySubpath, entryBySource, failures);
    }
  }

  if (!sourceOnly) {
    if (layout) {
      checkDistMarker(layout, failures);
      for (const entry of entryBySubpath.values()) {
        checkDualBuildOutput(entry, layout, failures);
      }
      checkFormatLoadProbes(entryBySubpath, failures);
      for (const entry of entryBySubpath.values()) {
        if (entry.runtime !== "zod-free") continue;
        checkZodFreeCjsLoader(entry, failures);
        checkZodFreeEsmLoader(entry, layout, failures);
      }
    } else if (problems.length === 0) {
      for (const entry of entryBySubpath.values()) {
        const exportTarget = packageJson.exports?.[entry.subpath];
        if (!exportTarget) continue;
        for (const target of [exportTarget.require, exportTarget.types]) {
          if (!fs.existsSync(packagePath(target.replace(/^\.\//, "")))) {
            failures.push(`${entry.subpath}: build output is missing: ${target}`);
          }
        }
      }
      for (const entry of entryBySubpath.values()) {
        if (entry.runtime === "zod-free") checkZodFreeCjsLoader(entry, failures);
      }
    }
  }

  if (failures.length) {
    throw new Error(`Contracts entrypoint check failed:\n${failures.join("\n")}`);
  }

  const mode = sourceOnly
    ? "source only"
    : layout
      ? "source, CJS/ESM build output, and loader probes"
      : "source, build output, and loader probes";
  process.stdout.write(
    `Contracts entrypoint check passed: ${entryBySubpath.size} public entrypoints (${mode})\n`,
  );
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === scriptFile;
if (invokedAsScript) main();
