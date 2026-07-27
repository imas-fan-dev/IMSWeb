import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const hooksPath = ".githooks";
const preCommitHook = path.join(repositoryRoot, hooksPath, "pre-commit");

const worktreeProbe = spawnSync(
  "git",
  ["rev-parse", "--is-inside-work-tree"],
  {
    cwd: repositoryRoot,
    encoding: "utf8",
  },
);

if (worktreeProbe.status !== 0 || worktreeProbe.stdout.trim() !== "true") {
  process.stdout.write("Git hooks not installed: not inside a Git worktree\n");
  process.exit(0);
}

if (!fs.existsSync(preCommitHook)) {
  throw new Error(`Missing Git pre-commit hook: ${preCommitHook}`);
}

const configure = spawnSync(
  "git",
  ["config", "--local", "core.hooksPath", hooksPath],
  {
    cwd: repositoryRoot,
    encoding: "utf8",
  },
);

if (configure.status !== 0) {
  throw new Error(
    `Failed to configure Git hooks: ${configure.stderr.trim() || "unknown error"}`,
  );
}

process.stdout.write(`Git hooks installed: core.hooksPath=${hooksPath}\n`);
