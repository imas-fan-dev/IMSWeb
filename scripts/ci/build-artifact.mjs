import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  lstatSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appBuildEnvironment } from "../../apps/web/scripts/build-app.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const execute = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: "utf8" }).trim();

export function buildIdentity(
  target,
  cwd = root,
  env = process.env,
  run = execute,
) {
  if (!["web", "app"].includes(target)) throw new Error("Unknown build target");
  const require = createRequire(path.join(cwd, "apps/web/package.json"));
  if (!env.GITHUB_RUN_ID || !env.GITHUB_RUN_ATTEMPT)
    throw new Error("Same-run identity is required");
  const sha = run("git", ["rev-parse", "HEAD"], cwd);
  if (sha !== env.GITHUB_SHA)
    throw new Error("Candidate SHA differs from checkout");
  if (run("git", ["status", "--porcelain", "--untracked-files=normal"], cwd))
    throw new Error("Candidate checkout is dirty");
  const origins = target === "app" ? appBuildEnvironment(env) : env;
  return {
    schema: 1,
    sha,
    tree: run("git", ["rev-parse", "HEAD^{tree}"], cwd),
    run: env.GITHUB_RUN_ID,
    attempt: env.GITHUB_RUN_ATTEMPT,
    target,
    lockfile: digest(readFileSync(path.join(cwd, "pnpm-lock.yaml"))),
    origins: {
      api: origins.VITE_IMS_API_ORIGIN ?? "",
      site: origins.VITE_IMS_PUBLIC_SITE_ORIGIN ?? "",
      map: origins.VITE_IMS_MAP_TRANSPORT_ORIGIN ?? "",
    },
    versions: {
      node: process.version,
      pnpm: run("pnpm", ["--version"], cwd),
      vite: require("vite/package.json").version,
      router: require("@react-router/dev/package.json").version,
      playwright: require("@playwright/test/package.json").version,
    },
  };
}

export function buildFiles(directory) {
  const files = {};
  function visit(relative) {
    const absolute = path.join(directory, relative);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error("Build symlinks are forbidden");
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort())
        visit(path.join(relative, name));
    } else if (stat.isFile())
      files[relative.split(path.sep).join("/")] = digest(
        readFileSync(absolute),
      );
    else throw new Error("Unsupported build file");
  }
  visit("");
  if (!files["client/index.html"] || Object.keys(files).length < 2)
    throw new Error("Incomplete client build");
  return files;
}

export function verifyBuild(manifest, expected, files) {
  if (JSON.stringify(manifest.identity) !== JSON.stringify(expected))
    throw new Error("Build identity mismatch");
  if (JSON.stringify(manifest.files) !== JSON.stringify(files))
    throw new Error("Build file digest mismatch");
}

export function artifactCommand(mode, target, manifestPath, cwd = root) {
  const identity = buildIdentity(target, cwd);
  const directory = path.join(
    cwd,
    "apps/web",
    target === "web" ? "build" : "build-app",
  );
  const files = buildFiles(directory);
  if (mode === "verify")
    verifyBuild(
      JSON.parse(readFileSync(manifestPath, "utf8")),
      identity,
      files,
    );
  else if (mode === "record") {
    mkdirSync(path.dirname(manifestPath), { recursive: true });
    writeFileSync(
      manifestPath,
      JSON.stringify({ identity, files }, null, 2) + "\n",
    );
  } else throw new Error("Expected record or verify");
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [mode, target, manifestPath] = process.argv.slice(2);
  artifactCommand(
    mode,
    target,
    manifestPath ?? path.join(root, ".ci-artifacts", `${target}.json`),
  );
}
