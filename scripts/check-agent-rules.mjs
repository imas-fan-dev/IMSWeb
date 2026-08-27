import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const ignoredDirectories = new Set([
  ".git",
  ".venv",
  ".worktrees",
  ".wrangler",
  "__pycache__",
  "build",
  "coverage",
  "data",
  "dist",
  "node_modules",
  "venv",
]);
const ruleFileNames = new Set([".rules", "AGENTS.md", "CLAUDE.md"]);
const ruleDirectories = new Set();
const failures = [];

function relative(absolutePath) {
  return (
    path.relative(repositoryRoot, absolutePath).split(path.sep).join("/") || "."
  );
}

function discoverRuleDirectories(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        discoverRuleDirectories(absolutePath);
      }
      continue;
    }
    if (ruleFileNames.has(entry.name)) ruleDirectories.add(directory);
  }
}

function lstat(absolutePath) {
  return fs.lstatSync(absolutePath, { throwIfNoEntry: false });
}

discoverRuleDirectories(repositoryRoot);

if (ruleDirectories.size === 0) {
  failures.push("no .rules scope was found");
}

for (const directory of [...ruleDirectories].sort()) {
  const rulesPath = path.join(directory, ".rules");
  const rulesStat = lstat(rulesPath);
  if (!rulesStat?.isFile() || rulesStat.isSymbolicLink()) {
    failures.push(
      `${relative(rulesPath)} must be the regular canonical rules file`,
    );
  }

  for (const aliasName of ["AGENTS.md", "CLAUDE.md"]) {
    const aliasPath = path.join(directory, aliasName);
    const aliasStat = lstat(aliasPath);
    if (!aliasStat?.isSymbolicLink()) {
      failures.push(`${relative(aliasPath)} must be a symbolic link to .rules`);
      continue;
    }
    const target = fs.readlinkSync(aliasPath);
    if (target !== ".rules") {
      failures.push(
        `${relative(aliasPath)} must target .rules, found ${JSON.stringify(target)}`,
      );
    }
  }
}

if (failures.length) {
  throw new Error(`Agent rules check failed:\n${failures.join("\n")}`);
}

process.stdout.write(
  `Agent rules check passed: ${ruleDirectories.size} scope(s) use .rules with AGENTS.md and CLAUDE.md aliases\n`,
);
