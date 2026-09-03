import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

const OUTPUT_KEYS = ["repo", "app", "web", "api", "integration"];
const PRODUCT_KEYS = ["app", "web", "api", "integration"];
const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const ZERO_SHA = /^0{40}$/;

const REPOSITORY_ONLY = Object.freeze({
  repo: true,
  app: false,
  web: false,
  api: false,
  integration: false,
});
const ALL_JOBS = Object.freeze({
  repo: true,
  app: true,
  web: true,
  api: true,
  integration: true,
});

const ROOT_SHARED_FILES = new Set([
  ".npmrc",
  ".nvmrc",
  "biome.jsonc",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
]);

const APP_SCRIPTS = new Set([
  "android-release-network.d.ts",
  "android-release-network.js",
  "app-device.d.ts",
  "app-device.js",
  "app-toolchain.d.ts",
  "app-toolchain.js",
  "build-app.d.ts",
  "build-app.js",
  "dev-app.d.ts",
  "dev-app.js",
]);

const APP_CONTRACT_INPUTS = new Set([
  "apps/web/.gitignore",
  "apps/web/.rules",
  "docs/README.md",
  "docs/development/app-device-delivery.md",
  "docs/development/tauri-mobile.md",
]);

const APP_ROOT_TESTS = new Set([
  "tests/tauri-build-configuration.test.js",
  "tests/tauri-device-delivery.test.js",
]);

const WEB_ONLY_FILES = new Set([
  "apps/web/eslint.config.js",
  "apps/web/playwright.config.ts",
  "apps/web/vitest.config.ts",
  "tests/test_public_assets.py",
]);

const SHARED_WEB_FILES = new Set([
  "apps/web/package.json",
  "apps/web/react-router.config.ts",
  "apps/web/tsconfig.json",
  "apps/web/vite-exchange-map-assets.ts",
  "apps/web/vite-watch.ts",
  "apps/web/vite.config.ts",
]);

const INTEGRATION_ONLY_FILES = new Set([
  "apps/api/scripts/build/build-client.js",
  "apps/api/scripts/build/check-client.js",
  "apps/api/tests/assets/frontend-routing.contract.test.js",
]);

const API_INTEGRATION_FILES = new Set([
  "apps/api/package.json",
  "apps/api/scripts/build/build-server.js",
  "apps/api/src/app.ts",
  "apps/api/src/infra/http/filesystem/static-assets.ts",
  "apps/api/src/middleware/hono-context.ts",
  "apps/api/src/middleware/json-body-limit.ts",
  "apps/api/src/middleware/rate-limit.ts",
  "apps/api/src/middleware/request-observability.ts",
  "apps/api/src/middleware/static-path-policy.ts",
  "apps/api/src/routing/frontend-route-policy.ts",
  "apps/api/src/utils/http/content-type.ts",
  "apps/api/src/utils/http/stored-object-response.ts",
  "apps/api/tsconfig.server.json",
]);

class DiffFormatError extends Error {
  constructor(message) {
    super(`Invalid Git name-status diff: ${message}`);
    this.name = "DiffFormatError";
  }
}

function copyResult(result) {
  return { ...result };
}

function everyProductJob() {
  return copyResult(ALL_JOBS);
}

function ownedJobs(...jobs) {
  return new Set(jobs);
}

function isValidRepositoryPath(changedPath) {
  if (
    typeof changedPath !== "string" ||
    changedPath.length === 0 ||
    changedPath.startsWith("/") ||
    changedPath.includes("\\")
  ) {
    return false;
  }

  const segments = changedPath.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}

function classifyPath(changedPath) {
  if (!isValidRepositoryPath(changedPath)) {
    return ownedJobs(...PRODUCT_KEYS);
  }

  if (
    ROOT_SHARED_FILES.has(changedPath) ||
    /^tsconfig(?:\.[^/]+)?\.json$/.test(changedPath) ||
    changedPath.startsWith(".github/") ||
    changedPath.startsWith("scripts/ci/")
  ) {
    return ownedJobs(...PRODUCT_KEYS);
  }

  if (changedPath.startsWith("packages/contracts/")) {
    return ownedJobs(...PRODUCT_KEYS);
  }

  if (
    changedPath.startsWith("apps/web/src-tauri/") ||
    (APP_SCRIPTS.has(path.posix.basename(changedPath)) &&
      changedPath.startsWith("apps/web/scripts/")) ||
    changedPath === "apps/web/playwright.app.config.ts" ||
    /^apps\/web\/tests\/e2e\/app-[^/]+\.spec\.ts$/.test(changedPath) ||
    APP_ROOT_TESTS.has(changedPath) ||
    APP_CONTRACT_INPUTS.has(changedPath)
  ) {
    return ownedJobs("app");
  }

  if (
    changedPath.startsWith("apps/web/tests/unit/") ||
    changedPath.startsWith("apps/web/tests/e2e/") ||
    changedPath === "apps/web/tests/setup.ts" ||
    changedPath === "apps/web/tests/jest-dom.d.ts" ||
    WEB_ONLY_FILES.has(changedPath)
  ) {
    return ownedJobs("web");
  }

  if (
    changedPath.startsWith("apps/web/app/") ||
    changedPath.startsWith("apps/web/public/") ||
    SHARED_WEB_FILES.has(changedPath)
  ) {
    return ownedJobs("app", "web", "integration");
  }

  if (INTEGRATION_ONLY_FILES.has(changedPath)) {
    return ownedJobs("integration");
  }

  if (
    API_INTEGRATION_FILES.has(changedPath) ||
    /^apps\/api\/src\/domains\/.+\/routes\.ts$/.test(changedPath)
  ) {
    return ownedJobs("api", "integration");
  }

  if (
    changedPath.startsWith("apps/api/src/") ||
    changedPath.startsWith("apps/api/tests/") ||
    changedPath.startsWith("apps/api/migrations/") ||
    changedPath.startsWith("apps/api/scripts/") ||
    changedPath.startsWith("apps/api/js/") ||
    changedPath === "apps/api/package.json" ||
    /^apps\/api\/tsconfig(?:\.[^/]+)?\.json$/.test(changedPath) ||
    /^apps\/api\/(?:Dockerfile(?:\.[^/]+)?|\.dockerignore)$/.test(changedPath)
  ) {
    return ownedJobs("api");
  }

  if (
    changedPath.startsWith("docs/") ||
    changedPath.startsWith("deploy/") ||
    changedPath.startsWith(".agents/") ||
    changedPath.startsWith(".husky/") ||
    changedPath.startsWith(".trellis/") ||
    changedPath.startsWith("data/") ||
    changedPath.startsWith("tests/") ||
    changedPath.startsWith("scripts/deployment/") ||
    changedPath.startsWith("scripts/development/") ||
    changedPath.startsWith("scripts/maps/") ||
    changedPath.startsWith("scripts/migration/") ||
    /^(?:AGENTS\.md|CLAUDE\.md|CONTRIBUTING\.md|DESIGN\.md|LICENSE|README\.md|\.editorconfig|\.gitattributes|\.gitignore|\.rules)$/.test(
      changedPath,
    ) ||
    /^apps\/(?:api|web)\/(?:\.env\.example|\.rules|DESIGN\.md|README\.md)$/.test(
      changedPath,
    )
  ) {
    return ownedJobs();
  }

  return ownedJobs(...PRODUCT_KEYS);
}

export function classifyChangedPaths(changedPaths) {
  const result = copyResult(REPOSITORY_ONLY);

  for (const changedPath of changedPaths) {
    for (const job of classifyPath(changedPath)) {
      result[job] = true;
    }
  }

  return result;
}

export function parseNameStatusDiff(rawDiff) {
  const buffer = Buffer.isBuffer(rawDiff) ? rawDiff : Buffer.from(rawDiff);
  if (buffer.length === 0) {
    return [];
  }

  if (buffer[buffer.length - 1] !== 0) {
    throw new DiffFormatError("output is not NUL-terminated");
  }

  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new DiffFormatError("output is not valid UTF-8");
  }

  const fields = decoded.split("\0");
  fields.pop();
  const changedPaths = [];

  for (let index = 0; index < fields.length; ) {
    const status = fields[index++];
    if (/^[AMTUXB]$/.test(status) || status === "D") {
      const changedPath = fields[index++];
      if (!changedPath) {
        throw new DiffFormatError(`status ${status} has no path`);
      }
      changedPaths.push(changedPath);
      continue;
    }

    const rename = /^R(\d{1,3})$/.exec(status);
    if (rename && Number(rename[1]) <= 100) {
      const oldPath = fields[index++];
      const newPath = fields[index++];
      if (!oldPath || !newPath) {
        throw new DiffFormatError(`status ${status} requires two paths`);
      }
      changedPaths.push(oldPath, newPath);
      continue;
    }

    throw new DiffFormatError(`unknown status ${JSON.stringify(status)}`);
  }

  return changedPaths;
}

function defaultGitRunner(argumentsList) {
  return spawnSync("git", argumentsList, {
    cwd: process.cwd(),
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function runGitSafely(runGit, argumentsList) {
  try {
    const result = runGit(argumentsList);
    if (
      !result ||
      result.error ||
      result.status !== 0 ||
      !(Buffer.isBuffer(result.stdout) || typeof result.stdout === "string")
    ) {
      return null;
    }
    return result.stdout;
  } catch {
    return null;
  }
}

function isCommitSha(value) {
  return typeof value === "string" && COMMIT_SHA.test(value);
}

export function detectAffectedWorkspaces({
  eventName,
  beforeSha,
  baseSha,
  headSha,
  runGit = defaultGitRunner,
}) {
  if (!isCommitSha(headSha)) {
    return everyProductJob();
  }

  let diffBase;
  if (eventName === "pull_request") {
    if (!isCommitSha(baseSha)) {
      return everyProductJob();
    }

    const mergeBaseOutput = runGitSafely(runGit, [
      "merge-base",
      baseSha,
      headSha,
    ]);
    if (mergeBaseOutput === null) {
      return everyProductJob();
    }

    const mergeBase = Buffer.from(mergeBaseOutput).toString("utf8").trim();
    if (!isCommitSha(mergeBase)) {
      return everyProductJob();
    }
    diffBase = mergeBase;
  } else if (eventName === "push") {
    if (!isCommitSha(beforeSha) || ZERO_SHA.test(beforeSha)) {
      return everyProductJob();
    }
    diffBase = beforeSha;
  } else {
    return everyProductJob();
  }

  const diffOutput = runGitSafely(runGit, [
    "diff",
    "--name-status",
    "-z",
    "--find-renames",
    diffBase,
    headSha,
  ]);
  if (diffOutput === null) {
    return everyProductJob();
  }

  try {
    return classifyChangedPaths(parseNameStatusDiff(diffOutput));
  } catch (error) {
    if (error instanceof DiffFormatError) {
      return everyProductJob();
    }
    throw error;
  }
}

export function formatGitHubOutputs(result) {
  return (
    OUTPUT_KEYS.map((key) => `${key}=${result[key] ? "true" : "false"}`).join(
      "\n",
    ) + "\n"
  );
}

function runCli() {
  const result = detectAffectedWorkspaces({
    eventName: process.env.CI_EVENT_NAME,
    beforeSha: process.env.CI_BEFORE_SHA,
    baseSha: process.env.CI_BASE_SHA,
    headSha: process.env.CI_HEAD_SHA,
  });
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    throw new Error("GITHUB_OUTPUT is required");
  }
  appendFileSync(outputPath, formatGitHubOutputs(result), "utf8");
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  runCli();
}
