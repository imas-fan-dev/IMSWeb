#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(scriptDirectory, "../..");
const apiRoot = path.join(repositoryRoot, "apps/api");

const command = (label, executable, args, cwd = repositoryRoot) =>
  Object.freeze({ label, executable, args: Object.freeze(args), cwd });
const freezePlan = (steps) => Object.freeze(steps);

const governanceNodeTests = Object.freeze([
  "tests/development-environment.test.js",
  "tests/ci-affected-workspaces.test.js",
  "scripts/testing/tests/run-test-owner.test.mjs",
]);
const governancePythonTests = Object.freeze([
  "tests/test_agent_rules.py",
  "tests/test_source_rules.py",
  "tests/test_docs.py",
  "tests/test_git_hooks.py",
  "tests/test_release_activation.py",
  "tests/test_github_deployment.py",
  "tests/test_operations_docs.py",
  "tests/test_compose_deployment.py",
  "tests/test_workspace_boundaries.py",
]);
const apiNodeTests = Object.freeze([
  "tests/hono-app-contract.test.js",
  "tests/node-listener-probe.test.js",
  "tests/node-security.test.js",
  "tests/operation-scripts.test.js",
  "tests/postgres-test-lifecycle.test.js",
]);

function governancePlan() {
  return freezePlan([
    command("governance Node contracts", "node", [
      "--experimental-strip-types",
      "--test",
      ...governanceNodeTests,
    ]),
    command("governance Python contracts", "python3", [
      "-m",
      "unittest",
      ...governancePythonTests,
    ]),
  ]);
}

function contractsPlan() {
  return freezePlan([
    command("contracts", "node", [
      "--experimental-strip-types",
      "--test",
      "tests/contracts/non-json-boundaries.test.mjs",
      "scripts/contracts/tests/compile-route-inventory.test.mjs",
      "scripts/contracts/tests/compile-frontend-route-metadata.test.mjs",
    ]),
  ]);
}

function deliveryPlan(profile) {
  if (profile === "root") {
    return freezePlan([
      command("root delivery contracts", "node", [
        "--experimental-strip-types",
        "--test",
        "tests/exchange-map-assets.test.js",
        "tests/tauri-build-configuration.test.js",
        "tests/tauri-device-delivery.test.js",
      ]),
      command("Web public asset contracts", "python3", [
        "-m",
        "unittest",
        "tests/test_public_assets.py",
      ]),
    ]);
  }
  if (profile === "repository") {
    return freezePlan([
      command("repository delivery contracts", "node", [
        "--experimental-strip-types",
        "--test",
        "tests/exchange-map-assets.test.js",
      ]),
    ]);
  }
  if (profile === "app") {
    return freezePlan([
      command("App delivery contracts", "node", [
        "--experimental-strip-types",
        "--test",
        "tests/tauri-build-configuration.test.js",
        "tests/tauri-device-delivery.test.js",
      ]),
    ]);
  }
  if (profile === "web") {
    return freezePlan([
      command("Web public asset contracts", "python3", [
        "-m",
        "unittest",
        "tests/test_public_assets.py",
      ]),
    ]);
  }
  if (profile === "integration") {
    return freezePlan([
      command("build Web delivery artifacts", "pnpm", [
        "--filter",
        "@imsweb/web",
        "run",
        "build",
      ]),
      command("build API delivery artifacts", "pnpm", [
        "--filter",
        "@imsweb/api",
        "run",
        "build",
      ]),
      command("test packaged frontend delivery", "pnpm", [
        "--filter",
        "@imsweb/api",
        "run",
        "test:assets",
      ]),
    ]);
  }
  throw new Error(
    "delivery profile must be root, repository, app, web, or integration",
  );
}

function apiPlan(profile, buildPrepared = false) {
  if (profile !== "all" && profile !== "node") {
    throw new Error("API profile must be all or node");
  }

  const plan = [];
  if (!buildPrepared) {
    plan.push(
      command(profile === "all" ? "check and build API" : "build API", "pnpm", [
        "--filter",
        "@imsweb/api",
        "run",
        profile === "all" ? "check" : "build",
      ]),
    );
  } else if (profile === "all") {
    for (const check of ["syntax", "check:architecture"]) {
      plan.push(
        command(`run prepared API ${check}`, "pnpm", [
          "--filter",
          "@imsweb/api",
          "run",
          check,
        ]),
      );
    }
  }
  plan.push(
    command(
      "test prepared API Node artifacts",
      "node",
      ["--test", ...apiNodeTests],
      apiRoot,
    ),
  );
  if (profile === "all") {
    for (const suite of ["test:server", "test:wiki", "test:migration"]) {
      plan.push(
        command(`run API ${suite}`, "pnpm", [
          "--filter",
          "@imsweb/api",
          "run",
          suite,
        ]),
      );
    }
  }
  return freezePlan(plan);
}

function webPlan(profile) {
  if (profile !== "all" && profile !== "ci") {
    throw new Error("Web profile must be all or ci");
  }

  return freezePlan([
    command(profile === "ci" ? "check Web" : "test Web units", "pnpm", [
      "--filter",
      "@imsweb/web",
      "run",
      profile === "ci" ? "check" : "test:unit",
    ]),
    command("test Web in browsers", "pnpm", [
      "--filter",
      "@imsweb/web",
      "run",
      "test:e2e",
    ]),
  ]);
}

function rootPlan() {
  return freezePlan([
    command("check repository", "pnpm", ["run", "check:root"]),
    ...governancePlan(),
    ...contractsPlan(),
    ...deliveryPlan("root"),
    ...deliveryPlan("integration"),
    ...apiPlan("all", true),
    command("test Web units", "pnpm", [
      "--filter",
      "@imsweb/web",
      "run",
      "test:unit",
    ]),
  ]);
}

export function parseOwnerArguments(argv) {
  const positionals = [];
  const options = { list: false };
  for (const argument of argv) {
    if (argument === "--") continue;
    if (argument === "--list") options.list = true;
    else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else positionals.push(argument);
  }

  const [owner, profile, ...extra] = positionals;
  if (!owner || extra.length) {
    throw new Error("Expected one owner and optional profile");
  }
  return { owner, profile, ...options };
}

export function buildOwnerPlan({ owner, profile }) {
  if (owner === "root") {
    if (profile) throw new Error("root does not accept a profile");
    return rootPlan();
  }
  if (owner === "governance") {
    if (profile) throw new Error("governance does not accept a profile");
    return governancePlan();
  }
  if (owner === "contracts") {
    if (profile) throw new Error("contracts does not accept a profile");
    return contractsPlan();
  }
  if (owner === "delivery") return deliveryPlan(profile);
  if (owner === "api") return apiPlan(profile ?? "all");
  if (owner === "web") return webPlan(profile ?? "all");
  throw new Error(`Unknown test owner: ${owner}`);
}

class OwnerCommandError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

export async function runCommand(step) {
  process.stdout.write(`\n[test-owner] ${step.label}\n`);
  await new Promise((resolve, reject) => {
    const child = spawn(step.executable, step.args, {
      cwd: step.cwd,
      env: process.env,
      stdio: "inherit",
    });
    let settled = false;
    let forceKillTimer;
    const signalHandlers = new Map(
      ["SIGINT", "SIGTERM", "SIGHUP"].map((signal) => [
        signal,
        () => {
          if (!child.kill(signal) || forceKillTimer) return;
          forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
          forceKillTimer.unref();
        },
      ]),
    );
    for (const [signal, handler] of signalHandlers) {
      process.once(signal, handler);
    }
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(forceKillTimer);
      for (const [signal, handler] of signalHandlers) {
        process.off(signal, handler);
      }
      callback();
    };

    child.once("error", (error) => finish(() => reject(error)));
    child.once("exit", (code, signal) => {
      if (signal) {
        const signalNumber = os.constants.signals[signal];
        finish(() =>
          reject(
            new OwnerCommandError(
              `${step.label} terminated by ${signal}`,
              signalNumber ? 128 + signalNumber : 1,
            ),
          ),
        );
      } else if (code !== 0) {
        finish(() =>
          reject(
            new OwnerCommandError(`${step.label} exited with ${code}`, code),
          ),
        );
      } else {
        finish(resolve);
      }
    });
  });
}

export async function runOwner(argv = process.argv.slice(2)) {
  const options = parseOwnerArguments(argv);
  const plan = buildOwnerPlan(options);
  if (options.list) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  for (const step of plan) await runCommand(step);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runOwner().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.exitCode ?? 1;
  });
}
