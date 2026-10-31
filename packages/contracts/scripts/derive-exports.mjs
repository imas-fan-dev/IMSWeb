// Regenerate the package.json export map from entrypoints.json so the public
// subpaths cannot drift from the inventory. `--check` verifies the committed
// map instead of writing it; the contracts build runs that mode first.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deepEqual,
  deriveLegacyFields,
  derivePackageExports,
  readBuildLayout,
} from "./check-entrypoints.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(packageRoot, fileName), "utf8"));
}

function fail(lines) {
  process.stderr.write(`Contracts export derivation failed:\n${lines.join("\n")}\n`);
  process.exit(1);
}

const inventory = readJson("entrypoints.json");
const packageJson = readJson("package.json");
const { layout, problems } = readBuildLayout(inventory);
if (problems.length) fail(problems);
if (!layout) {
  fail(["entrypoints.json must define the cjs and esm build layout"]);
}

const expectedExports = derivePackageExports(inventory, layout);
const legacy = deriveLegacyFields(inventory, layout);

if (checkOnly) {
  const drift = [];
  if (!deepEqual(packageJson.exports, expectedExports)) {
    drift.push("package.json exports do not match entrypoints.json");
  }
  if (packageJson.main !== legacy.main) {
    drift.push(`package.json main must be ${legacy.main}`);
  }
  if (packageJson.types !== legacy.types) {
    drift.push(`package.json types must be ${legacy.types}`);
  }
  if (drift.length) {
    fail([...drift, "run `node scripts/derive-exports.mjs` to regenerate the manifest"]);
  }
  process.stdout.write(
    `Contracts package exports are in sync: ${inventory.entrypoints.length} conditional subpaths\n`,
  );
} else {
  packageJson.main = legacy.main;
  packageJson.types = legacy.types;
  packageJson.exports = expectedExports;
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  process.stdout.write(
    `Derived ${inventory.entrypoints.length} conditional exports into package.json\n`,
  );
}
