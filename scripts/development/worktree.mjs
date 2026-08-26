#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE_BRANCH = "main";
const DEFAULT_BRANCH_PREFIX = "codex/";
const WORKTREE_DIRECTORY = ".worktrees";
const LOCAL_CONFIG_FILES = [
  "apps/api/.env",
  "apps/web/.env",
  "apps/web/.env.product",
  "deploy/.env",
];

function fail(message) {
  process.stderr.write(`worktree: ${message}\n`);
  process.exit(1);
}

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0 && !options.allowFailure) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    fail(`git ${args.join(" ")} failed\n${output}`);
  }
  return {
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

function listWorktrees() {
  const entries = [];
  let current = null;
  for (const line of git(["worktree", "list", "--porcelain"]).stdout.split(
    "\n",
  )) {
    if (line.startsWith("worktree ")) {
      current = {
        path: line.slice("worktree ".length),
        branch: null,
        head: null,
      };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("HEAD ")) current.head = line.slice("HEAD ".length);
    if (line.startsWith("branch ")) {
      current.branch = line
        .slice("branch ".length)
        .replace(/^refs\/heads\//, "");
    }
    if (line === "detached") current.branch = "(detached)";
  }
  return entries;
}

function slugify(value) {
  const slug = value
    .split("/")
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) fail(`cannot derive a directory name from "${value}"`);
  return slug;
}

function branchExists(branch) {
  return (
    git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
      allowFailure: true,
    }).status === 0
  );
}

function resolveBase(baseBranch) {
  const local = git(
    ["rev-parse", "--verify", "--quiet", `refs/heads/${baseBranch}`],
    {
      allowFailure: true,
    },
  );
  if (local.status === 0) return baseBranch;
  const remote = git(
    ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${baseBranch}`],
    { allowFailure: true },
  );
  if (remote.status === 0) return `origin/${baseBranch}`;
  fail(`base branch "${baseBranch}" was not found locally or on origin`);
  return baseBranch;
}

function copyLocalConfig(mainRoot, targetRoot) {
  const copied = [];
  for (const relativePath of missingLocalConfig(mainRoot, targetRoot)) {
    const source = path.join(mainRoot, relativePath);
    const target = path.join(targetRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    copied.push(relativePath);
  }
  return copied;
}

function missingLocalConfig(mainRoot, targetRoot) {
  return LOCAL_CONFIG_FILES.filter(
    (relativePath) =>
      fs.existsSync(path.join(mainRoot, relativePath)) &&
      !fs.existsSync(path.join(targetRoot, relativePath)),
  );
}

function conventionalPath(mainRoot, branch) {
  return path.join(mainRoot, WORKTREE_DIRECTORY, slugify(branch));
}

function requireIgnoredContainer(mainRoot) {
  const container = path.join(mainRoot, WORKTREE_DIRECTORY);
  const ignored = git(["check-ignore", "--quiet", `${WORKTREE_DIRECTORY}/`], {
    cwd: mainRoot,
    allowFailure: true,
  });
  if (ignored.status !== 0) {
    fail(`${WORKTREE_DIRECTORY}/ must be listed in .gitignore before use`);
  }
  fs.mkdirSync(container, { recursive: true });
  return container;
}

function inspect(entry, mainRoot, baseBranch) {
  const report = {
    ...entry,
    exists: fs.existsSync(entry.path),
    missingConfig: [],
    hasDependencies: false,
    uncommitted: 0,
    ahead: null,
    behind: null,
    expectedPath: null,
  };
  if (!report.exists) return report;

  report.missingConfig = missingLocalConfig(mainRoot, entry.path);
  report.hasDependencies = fs.existsSync(path.join(entry.path, "node_modules"));
  report.uncommitted = git(["status", "--porcelain"], { cwd: entry.path })
    .stdout.split("\n")
    .filter((line) => line.length > 0).length;

  if (
    entry.branch &&
    entry.branch !== "(detached)" &&
    entry.branch !== baseBranch
  ) {
    const counts = git(
      [
        "rev-list",
        "--left-right",
        "--count",
        `${baseBranch}...${entry.branch}`,
      ],
      { allowFailure: true },
    );
    if (counts.status === 0) {
      const [behind, ahead] = counts.stdout.split(/\s+/).map(Number);
      report.behind = behind;
      report.ahead = ahead;
    }
    const expected = conventionalPath(mainRoot, entry.branch);
    if (path.resolve(entry.path) !== expected) report.expectedPath = expected;
  }
  return report;
}

function describe(report, mainRoot) {
  const lines = [`    path      ${report.path}`];
  if (!report.exists) {
    lines.push(
      "    state     directory is missing, run: pnpm run worktree:prune",
    );
    return lines;
  }
  if (report.path !== mainRoot) {
    if (report.ahead !== null) {
      lines.push(
        `    tracking  ${report.ahead} ahead, ${report.behind} behind base`,
      );
    }
    lines.push(
      `    local     ${report.uncommitted} uncommitted, dependencies ${
        report.hasDependencies ? "installed" : "missing"
      }${
        report.missingConfig.length > 0
          ? `, missing ${report.missingConfig.join(", ")}`
          : ""
      }`,
    );
    if (report.expectedPath) {
      lines.push(`    naming    convention expects ${report.expectedPath}`);
    }
  }
  return lines;
}

function selectWorktrees(mainRoot, options) {
  const entries = listWorktrees().filter((entry) => entry.path !== mainRoot);
  if (options.flags.has("all") || options.positional.length === 0)
    return entries;
  return options.positional.map((target) => {
    const entry = matchWorktree(entries, target);
    if (!entry) fail(`no worktree matches "${target}"`);
    return entry;
  });
}

function matchWorktree(entries, target) {
  const resolved = path.resolve(target);
  return (
    entries.find((item) => item.path === resolved) ??
    entries.find((item) => item.branch === target) ??
    entries.find((item) => path.basename(item.path) === target) ??
    entries.find((item) =>
      path.basename(item.path).endsWith(`-${slugify(target)}`),
    )
  );
}

function parseOptions(argv) {
  const options = { flags: new Set(), values: new Map(), positional: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      options.positional.push(token);
      continue;
    }
    const [name, inlineValue] = token.slice(2).split("=");
    if (["from", "branch", "path"].includes(name)) {
      const value = inlineValue ?? argv[++index];
      if (!value) fail(`--${name} requires a value`);
      options.values.set(name, value);
      continue;
    }
    options.flags.add(name);
  }
  return options;
}

function commandList(mainRoot, options) {
  const baseBranch = options.values.get("from") ?? DEFAULT_BASE_BRANCH;
  for (const entry of listWorktrees()) {
    const marker = entry.path === mainRoot ? "*" : " ";
    const report = inspect(entry, mainRoot, baseBranch);
    process.stdout.write(`${marker} ${entry.branch ?? "(unknown)"}\n`);
    process.stdout.write(`${describe(report, mainRoot).join("\n")}\n`);
  }
}

function commandAdopt(mainRoot, options) {
  const baseBranch = options.values.get("from") ?? DEFAULT_BASE_BRANCH;
  const entries = selectWorktrees(mainRoot, options);
  if (entries.length === 0)
    fail("there is no worktree beside the main checkout");

  for (const entry of entries) {
    const report = inspect(entry, mainRoot, baseBranch);
    process.stdout.write(`${entry.branch ?? "(unknown)"}\n`);
    process.stdout.write(`${describe(report, mainRoot).join("\n")}\n`);

    if (!report.exists) continue;
    let currentPath = entry.path;

    if (!options.flags.has("no-env") && report.missingConfig.length > 0) {
      if (options.flags.has("dry-run")) {
        process.stdout.write(
          `    would copy ${report.missingConfig.join(", ")}\n`,
        );
      } else {
        const copied = copyLocalConfig(mainRoot, entry.path);
        if (copied.length > 0)
          process.stdout.write(`    copied ${copied.join(", ")}\n`);
      }
    }

    if (report.expectedPath && options.flags.has("rename")) {
      if (fs.existsSync(report.expectedPath)) {
        fail(`${report.expectedPath} already exists, rename manually`);
      }
      requireIgnoredContainer(mainRoot);
      if (options.flags.has("dry-run")) {
        process.stdout.write(`    would move to ${report.expectedPath}\n`);
      } else {
        git(["worktree", "move", entry.path, report.expectedPath]);
        currentPath = report.expectedPath;
        process.stdout.write(`    moved to ${report.expectedPath}\n`);
      }
    }

    if (!report.hasDependencies) {
      if (options.flags.has("install") && !options.flags.has("dry-run")) {
        const install = spawnSync("pnpm", ["install", "--frozen-lockfile"], {
          cwd: currentPath,
          stdio: "inherit",
        });
        if (install.status !== 0) fail(`pnpm install failed in ${currentPath}`);
      } else {
        process.stdout.write(
          `    next      cd ${currentPath} && pnpm install --frozen-lockfile\n`,
        );
      }
    }
  }
}

function commandAdd(mainRoot, options) {
  const [name] = options.positional;
  if (!name)
    fail(
      "usage: worktree add <name> [--from main] [--branch <ref>] [--path <dir>] [--install]",
    );

  const slug = slugify(options.values.get("branch") ?? name);
  const branch =
    options.values.get("branch") ?? `${DEFAULT_BRANCH_PREFIX}${slug}`;
  const baseBranch = options.values.get("from") ?? DEFAULT_BASE_BRANCH;
  const requestedPath = options.values.get("path");
  if (!requestedPath) requireIgnoredContainer(mainRoot);
  const targetRoot = path.resolve(
    requestedPath ?? path.join(mainRoot, WORKTREE_DIRECTORY, slug),
  );

  if (fs.existsSync(targetRoot)) fail(`${targetRoot} already exists`);
  const attached = listWorktrees().find((entry) => entry.branch === branch);
  if (attached)
    fail(`branch ${branch} is already checked out at ${attached.path}`);

  if (branchExists(branch)) {
    git(["worktree", "add", targetRoot, branch]);
  } else {
    const base = resolveBase(baseBranch);
    git(["worktree", "add", "-b", branch, targetRoot, base]);
  }

  const copied = options.flags.has("no-env")
    ? []
    : copyLocalConfig(mainRoot, targetRoot);
  process.stdout.write(`created ${branch}\n    ${targetRoot}\n`);
  if (copied.length > 0)
    process.stdout.write(`    copied: ${copied.join(", ")}\n`);

  if (options.flags.has("install")) {
    const install = spawnSync("pnpm", ["install", "--frozen-lockfile"], {
      cwd: targetRoot,
      stdio: "inherit",
    });
    if (install.status !== 0) fail("pnpm install failed in the new worktree");
  } else {
    process.stdout.write(
      `    next: cd ${targetRoot} && pnpm install --frozen-lockfile\n`,
    );
  }
}

function commandRemove(mainRoot, options) {
  const [target] = options.positional;
  if (!target)
    fail(
      "usage: worktree remove <name|branch|path> [--force] [--delete-branch]",
    );

  const entries = listWorktrees().filter((entry) => entry.path !== mainRoot);
  const entry = matchWorktree(entries, target);
  if (!entry) fail(`no worktree matches "${target}"`);

  const args = ["worktree", "remove", entry.path];
  if (options.flags.has("force")) args.push("--force");
  git(args);
  process.stdout.write(`removed ${entry.path}\n`);

  if (
    options.flags.has("delete-branch") &&
    entry.branch &&
    entry.branch !== "(detached)"
  ) {
    git(["branch", options.flags.has("force") ? "-D" : "-d", entry.branch]);
    process.stdout.write(`deleted branch ${entry.branch}\n`);
  }
}

function commandPrune() {
  git(["worktree", "prune", "-v"]);
  process.stdout.write("pruned stale worktree metadata\n");
}

const argv = process.argv
  .slice(2)
  .filter((token, index) => !(index === 0 && token === "--"));
const [command, ...rest] = argv;
const mainRoot = listWorktrees()[0]?.path;
if (!mainRoot) fail("no git worktree was found");
const options = parseOptions(rest);

switch (command) {
  case "list":
  case undefined:
    commandList(mainRoot, options);
    break;
  case "adopt":
    commandAdopt(mainRoot, options);
    break;
  case "add":
    commandAdd(mainRoot, options);
    break;
  case "remove":
    commandRemove(mainRoot, options);
    break;
  case "prune":
    commandPrune();
    break;
  default:
    fail(
      `unknown command "${command}" (expected list, add, adopt, remove, or prune)`,
    );
}
