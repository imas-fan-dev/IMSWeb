import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const failures = [];
const sourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const pathBuilderNames = new Set([
  "adminApiPath",
  "adminExchangePath",
  "adminPlatformAuthOAuthPath",
  "adminWikiPath",
  "apiPath",
  "communityApiPath",
  "cssPath",
  "eventChroniclePath",
  "exchangePath",
  "iconPath",
  "imagePath",
  "mapsPath",
  "platformApiPath",
  "platformAuthOAuthPath",
  "platformAuthPath",
  "publicAssetsPath",
  "publicUploadsPath",
  "siteContentPath",
  "sitesPath",
  "wikiPath",
]);
const protectedPathPrefixes = [
  "/api",
  "/assets",
  "/css",
  "/eventchronicle",
  "/icon",
  "/image",
  "/maps",
  "/site-content",
  "/sites",
  "/uploads",
];
const forbiddenPaths = new Map([
  ["apps/api/src/contracts", "cross-workspace wire contracts belong in packages/contracts"],
  ["apps/api/src/shared", "use a named domain, port, middleware, routing, or utils owner"],
  ["apps/web/app/features", "organize Web code by route, page, component, or lib ownership"],
]);

function absolute(relativePath) {
  return path.join(repositoryRoot, relativePath);
}

function relative(absolutePath) {
  return path.relative(repositoryRoot, absolutePath).split(path.sep).join("/");
}

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(entryPath);
    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

function stringLiterals(source) {
  const literals = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      index = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }

    const quote = source[index];
    if (quote !== '"' && quote !== "'" && quote !== "`") {
      index += 1;
      continue;
    }

    const start = index;
    let value = "";
    index += 1;
    while (index < source.length) {
      const character = source[index];
      if (character === "\\") {
        value += character;
        if (index + 1 < source.length) value += source[index + 1];
        index += 2;
        continue;
      }
      if (character === quote) {
        index += 1;
        break;
      }
      value += character;
      index += 1;
    }
    literals.push({ start, value });
  }
  return literals;
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function isDirectPathBuilderArgument(source, offset) {
  const before = source.slice(0, offset).trimEnd();
  const match = before.match(/([A-Za-z_$][\w$]*)\s*\($/);
  return Boolean(match && pathBuilderNames.has(match[1]));
}

function isProtectedPath(value) {
  return protectedPathPrefixes.some(
    (prefix) => value === prefix || value.startsWith(`${prefix}/`),
  );
}

for (const [relativePath, reason] of forbiddenPaths) {
  if (fs.existsSync(absolute(relativePath))) {
    failures.push(`${relativePath}: forbidden path; ${reason}`);
  }
}

const apiSourceRoot = absolute("apps/api/src");
const webSourceRoot = absolute("apps/web/app");
const contractsSourceRoot = absolute("packages/contracts/src");
const productionFiles = [
  ...filesUnder(apiSourceRoot),
  ...filesUnder(webSourceRoot),
  ...filesUnder(contractsSourceRoot),
];

for (const filePath of productionFiles) {
  const file = relative(filePath);
  const source = fs.readFileSync(filePath, "utf8");

  if (
    !file.startsWith("packages/contracts/src/") &&
    /(?:from\s*|import\s*\(\s*|require\(\s*)["']zod(?:\/[^"']*)?["']/.test(source)
  ) {
    failures.push(`${file}: import z through @imsweb/contracts/z, not zod directly`);
  }

  if (file.startsWith("apps/api/src/domains/")) {
    const forbiddenImport = source.match(
      /(?:from\s*|import\s*\(\s*)["'](@\/(?:infra|runtime)\/[^"']*)["']/,
    );
    if (forbiddenImport) {
      failures.push(
        `${file}: domain code must use injected ports, not ${forbiddenImport[1]}`,
      );
    }
  }

  if (
    file.startsWith("apps/web/app/") &&
    /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file)
  ) {
    failures.push(`${file}: Web tests belong under apps/web/tests`);
  }

  if (file === "packages/contracts/src/paths.ts") continue;
  for (const literal of stringLiterals(source)) {
    if (
      isProtectedPath(literal.value) &&
      !isDirectPathBuilderArgument(source, literal.start)
    ) {
      failures.push(
        `${file}:${lineNumber(source, literal.start)}: shared path ${JSON.stringify(literal.value)} must use @imsweb/contracts/paths`,
      );
    }
  }
}

if (failures.length) {
  throw new Error(`Source rules check failed:\n${failures.join("\n")}`);
}

process.stdout.write(
  `Source rules check passed: ${productionFiles.length} production source files respect shared path, zod, and ownership boundaries\n`,
);
