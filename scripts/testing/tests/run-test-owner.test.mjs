import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildOwnerPlan,
  parseOwnerArguments,
  repositoryRoot,
  runCommand,
} from "../run-test-owner.mjs";

const scripts = (plan) =>
  plan
    .filter((step) => step.executable === "pnpm")
    .map((step) => step.args.at(-1));

const testPaths = (plan) =>
  plan.flatMap((step) =>
    step.args.filter(
      (argument) =>
        argument.includes("/") && /\.(?:js|mjs|py|ts)$/.test(argument),
    ),
  );

test("governance, contracts, and delivery keep disjoint source lists", () => {
  const paths = [
    buildOwnerPlan({ owner: "governance" }),
    buildOwnerPlan({ owner: "contracts" }),
    buildOwnerPlan({ owner: "delivery", profile: "root" }),
  ].flatMap(testPaths);

  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.includes("tests/test_workspace_boundaries.py"));
  assert.ok(paths.includes("tests/contracts/non-json-boundaries.test.mjs"));
  assert.ok(
    paths.includes(
      "scripts/contracts/tests/compile-frontend-route-metadata.test.mjs",
    ),
  );
  assert.ok(paths.includes("tests/tauri-device-delivery.test.js"));
});

test("the root plan builds API once before every prepared API test group", () => {
  const plan = buildOwnerPlan({ owner: "root" });
  const apiSteps = plan.filter((step) => step.args.includes("@imsweb/api"));
  const apiNodeIndex = plan.findIndex((step) =>
    step.args.includes("tests/hono-app-contract.test.js"),
  );
  const apiBuildIndex = plan.findIndex(
    (step) => step.args.includes("@imsweb/api") && step.args.at(-1) === "build",
  );

  assert.deepEqual(scripts(apiSteps), [
    "build",
    "test:assets",
    "syntax",
    "check:architecture",
    "test:server",
    "test:wiki",
    "test:migration",
  ]);
  assert.ok(apiBuildIndex >= 0 && apiBuildIndex < apiNodeIndex);
  assert.equal(
    plan.filter((step) => step.args.includes("tests/hono-app-contract.test.js"))
      .length,
    1,
  );
  assert.ok(Object.isFrozen(plan));
  assert.ok(
    plan.every((step) => Object.isFrozen(step) && Object.isFrozen(step.args)),
  );
});

test("the standalone API owner builds once and retains every check and group", () => {
  const complete = buildOwnerPlan({ owner: "api" });

  assert.deepEqual(scripts(complete), [
    "check",
    "test:server",
    "test:wiki",
    "test:migration",
  ]);
  assert.equal(
    complete.filter((step) =>
      step.args.includes("tests/hono-app-contract.test.js"),
    ).length,
    1,
  );
});

test("the standalone API Node profile builds before using its artifact", () => {
  const plan = buildOwnerPlan({ owner: "api", profile: "node" });

  assert.deepEqual(scripts(plan), ["build"]);
  assert.equal(plan[1].cwd, `${repositoryRoot}/apps/api`);
  assert.equal(plan[1].args[0], "--test");
});

test("the integration delivery profile always builds Web and API", () => {
  const plan = buildOwnerPlan({ owner: "delivery", profile: "integration" });

  assert.deepEqual(
    plan.map((step) => [step.args[1], step.args.at(-1)]),
    [
      ["@imsweb/web", "build"],
      ["@imsweb/api", "build"],
      ["@imsweb/api", "test:assets"],
    ],
  );
});

test("every Web profile runs units before browser tests", () => {
  assert.deepEqual(scripts(buildOwnerPlan({ owner: "web" })), [
    "test:unit",
    "test:e2e",
  ]);
  assert.deepEqual(scripts(buildOwnerPlan({ owner: "web", profile: "ci" })), [
    "check",
    "test:e2e",
  ]);
});

test("skip flags and ambiguous profiles fail closed", () => {
  assert.throws(
    () => parseOwnerArguments(["api", "--prepared"]),
    /Unknown option: --prepared/,
  );
  assert.throws(
    () => parseOwnerArguments(["web", "--unit-prepared"]),
    /Unknown option: --unit-prepared/,
  );
  assert.throws(
    () => buildOwnerPlan({ owner: "web", profile: "unknown" }),
    /Web profile must be all or ci/,
  );
  assert.throws(
    () => buildOwnerPlan({ owner: "unknown" }),
    /Unknown test owner/,
  );
});

test("spawned commands preserve cwd, environment, and failure status", async () => {
  const variable = "IMS_TEST_OWNER_ENV_PROBE";
  const previous = process.env[variable];
  process.env[variable] = "preserved";
  try {
    await runCommand({
      label: "inspect spawn contract",
      executable: process.execPath,
      args: [
        "-e",
        `if (process.cwd() !== ${JSON.stringify(repositoryRoot)} || process.env.${variable} !== "preserved") process.exit(19)`,
      ],
      cwd: repositoryRoot,
    });
  } finally {
    if (previous === undefined) delete process.env[variable];
    else process.env[variable] = previous;
  }

  await assert.rejects(
    runCommand({
      label: "return child failure",
      executable: process.execPath,
      args: ["-e", "process.exit(23)"],
      cwd: repositoryRoot,
    }),
    (error) => error.exitCode === 23 && /exited with 23/.test(error.message),
  );
});

test(
  "a parent termination signal reaches the active child without hanging",
  { skip: process.platform === "win32", timeout: 2_000 },
  async () => {
    const child = runCommand({
      label: "forward termination",
      executable: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      cwd: repositoryRoot,
    });
    setTimeout(() => process.emit("SIGTERM"), 50);

    await assert.rejects(
      child,
      (error) =>
        error.exitCode === 143 && /terminated by SIGTERM/.test(error.message),
    );
  },
);

test(
  "the CLI returns the first child failure code",
  { skip: process.platform === "win32" },
  async () => {
    const fixture = await mkdtemp(path.join(os.tmpdir(), "ims-test-owner-"));
    const fakePnpm = path.join(fixture, "pnpm");
    await writeFile(fakePnpm, "#!/bin/sh\nexit 23\n", { mode: 0o755 });
    try {
      const result = spawnSync(
        process.execPath,
        [
          path.join(repositoryRoot, "scripts/testing/run-test-owner.mjs"),
          "web",
        ],
        {
          cwd: repositoryRoot,
          env: {
            ...process.env,
            PATH: `${fixture}${path.delimiter}${process.env.PATH}`,
          },
          encoding: "utf8",
          timeout: 10_000,
        },
      );

      assert.equal(result.error, undefined);
      assert.equal(result.status, 23, result.stderr);
      assert.match(result.stderr, /test Web units exited with 23/);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  },
);
