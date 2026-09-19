import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { test } from "vitest";

import {
  buildOwnerPlan,
  parseOwnerArguments,
  repositoryRoot,
  runCommand,
} from "../run-test-owner.mjs";

// The workspace scripts a plan runs: `pnpm --filter <workspace> run <script>`.
// The `pnpm --filter @imsweb/api exec vitest …` steps use `exec` in the third
// position and are asserted through their own command/argv/cwd assertions, not
// through a trailing argument.
const scripts = (plan) =>
  plan
    .filter(
      (step) =>
        step.executable === "pnpm" &&
        step.args[0] === "--filter" &&
        step.args[2] === "run",
    )
    .map((step) => step.args.at(-1));

// The API node artifacts run in one Vitest invocation that names every file, so
// a test dropping out of the built-artifact plan is a failing assertion here
// instead of a silently shorter run.
const apiNodeCommand = [
  "exec",
  "vitest",
  "run",
  "tests/hono-app-contract.test.js",
  "tests/node-listener-probe.test.js",
  "tests/node-security.test.js",
  "tests/operation-scripts.test.js",
  "tests/postgres-test-lifecycle.test.js",
];

// The API `all` profile collapses the whole API test tree into one Vitest run:
// the config's `include` already resolves `tests/**`, so no suite script and no
// file list belongs in the argv, and the only exclusion is the packaged-Web
// suite that needs a build this lane never produces. Asserting the exact argv
// keeps a suite step from creeping back in.
const apiSuiteCommand = [
  "exec",
  "vitest",
  "run",
  "--exclude",
  "tests/assets/**",
];

const apiRoot = `${repositoryRoot}/apps/api`;

const isApiSuiteStep = (step) =>
  step.executable === "pnpm" &&
  step.cwd === apiRoot &&
  step.args.length === apiSuiteCommand.length &&
  step.args.every((argument, index) => argument === apiSuiteCommand[index]);

const apiSuiteSteps = (plan) => plan.filter(isApiSuiteStep);

const apiVitestSteps = (plan) =>
  plan.filter(
    (step) =>
      step.executable === "pnpm" &&
      step.cwd === apiRoot &&
      step.args[0] === "exec" &&
      step.args[1] === "vitest",
  );

// The repository execution domain is hosted by the API workspace because the
// root package may not declare vitest. Every Node segment of the governance,
// contracts, and delivery plans is this one explicit Vitest invocation over the
// plan's own file list.
const repositoryVitestCommand = [
  "--filter",
  "@imsweb/api",
  "exec",
  "vitest",
  "run",
  "--root",
  "../..",
  "--config",
  `${repositoryRoot}/scripts/testing/vitest/vitest.repository.config.mts`,
];

const isRepositoryVitestStep = (step) =>
  step.executable === "pnpm" &&
  step.cwd === apiRoot &&
  step.args[0] === "--filter" &&
  step.args[1] === "@imsweb/api" &&
  step.args[2] === "exec" &&
  step.args[3] === "vitest";

const repositoryVitestSteps = (plan) => plan.filter(isRepositoryVitestStep);

const testPaths = (plan) =>
  plan.flatMap((step) =>
    step.args.filter(
      (argument) =>
        argument.includes("/") && /\.(?:js|mjs|py|ts)$/.test(argument),
    ),
  );

test("governance, contracts, and delivery keep disjoint source lists", () => {
  const plans = {
    governance: buildOwnerPlan({ owner: "governance" }),
    contracts: buildOwnerPlan({ owner: "contracts" }),
    "delivery root": buildOwnerPlan({ owner: "delivery", profile: "root" }),
  };
  const paths = Object.values(plans).flatMap(testPaths);

  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.includes("tests/test_workspace_boundaries.py"));
  assert.ok(paths.includes("tests/contracts/non-json-boundaries.test.mjs"));
  assert.ok(paths.includes("tests/vitest-reporting.test.mjs"));
  assert.ok(
    paths.includes(
      "scripts/contracts/tests/compile-frontend-route-metadata.test.mjs",
    ),
  );
  assert.ok(paths.includes("tests/tauri-device-delivery.test.js"));

  // Each Node segment is exactly one repository Vitest invocation over the
  // plan's explicit file list, run from the API workspace. The exhaustive argv
  // deepEqual below, plus the cwd and the absence of a node:test step, keep the
  // runner swap and the explicit lists from silently drifting.
  const nodeFiles = {
    governance: [
      "tests/development-environment.test.js",
      "tests/ci-affected-workspaces.test.js",
      "scripts/testing/tests/run-test-owner.test.mjs",
      "tests/vitest-reporting.test.mjs",
    ],
    contracts: [
      "tests/contracts/non-json-boundaries.test.mjs",
      "scripts/contracts/tests/compile-route-inventory.test.mjs",
      "scripts/contracts/tests/compile-frontend-route-metadata.test.mjs",
    ],
    "delivery root": [
      "tests/exchange-map-assets.test.js",
      "tests/tauri-build-configuration.test.js",
      "tests/tauri-device-delivery.test.js",
    ],
  };
  for (const [owner, plan] of Object.entries(plans)) {
    const steps = repositoryVitestSteps(plan);
    assert.equal(steps.length, 1, owner);
    assert.equal(steps[0].executable, "pnpm");
    assert.equal(steps[0].cwd, apiRoot);
    assert.deepEqual(steps[0].args, [
      ...repositoryVitestCommand,
      ...nodeFiles[owner],
    ]);
    assert.ok(!steps[0].args.includes("--test"), owner);
    assert.equal(
      plan.filter((step) => step.executable === "node").length,
      0,
      owner,
    );
  }

  // The Python segments stay byte-identical and keep their position after the
  // Vitest step.
  const governancePython = plans.governance[1];
  assert.equal(governancePython.executable, "python3");
  assert.deepEqual(governancePython.args, [
    "-m",
    "unittest",
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

  const deliveryPython = plans["delivery root"][1];
  assert.equal(deliveryPython.executable, "python3");
  assert.deepEqual(deliveryPython.args, [
    "-m",
    "unittest",
    "tests/test_public_assets.py",
  ]);
});

test("the root plan builds API once before its prepared API test group", () => {
  const plan = buildOwnerPlan({ owner: "root" });
  const apiSteps = plan.filter((step) => step.args.includes("@imsweb/api"));
  const apiSuiteIndex = plan.findIndex(isApiSuiteStep);
  const apiBuildIndex = plan.findIndex(
    (step) => step.args.includes("@imsweb/api") && step.args.at(-1) === "build",
  );

  assert.deepEqual(scripts(apiSteps), [
    "build",
    "test:assets",
    "syntax",
    "check:architecture",
  ]);
  assert.equal(repositoryVitestSteps(plan).length, 3);
  assert.ok(apiBuildIndex >= 0 && apiBuildIndex < apiSuiteIndex);
  assert.equal(apiSuiteSteps(plan).length, 1);
  assert.ok(Object.isFrozen(plan));
  assert.ok(
    plan.every((step) => Object.isFrozen(step) && Object.isFrozen(step.args)),
  );
});

test("the standalone API owner builds once and runs one API test group", () => {
  const complete = buildOwnerPlan({ owner: "api" });

  assert.deepEqual(scripts(complete), ["check"]);
  assert.equal(apiSuiteSteps(complete).length, 1);
});

test("every API profile runs its tests in one explicit Vitest command", () => {
  const nodeSteps = apiVitestSteps(buildOwnerPlan({ owner: "api", profile: "node" }));
  assert.equal(nodeSteps.length, 1);
  assert.equal(nodeSteps[0].executable, "pnpm");
  assert.deepEqual(nodeSteps[0].args, apiNodeCommand);
  assert.equal(nodeSteps[0].cwd, apiRoot);

  for (const plan of [
    buildOwnerPlan({ owner: "api" }),
    buildOwnerPlan({ owner: "root" }),
  ]) {
    const steps = apiSuiteSteps(plan);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].executable, "pnpm");
    assert.deepEqual(steps[0].args, apiSuiteCommand);
    assert.equal(steps[0].cwd, apiRoot);
    // The collapsed run must not duplicate the built-artifact file list.
    for (const file of apiNodeCommand.slice(3)) {
      assert.ok(!plan.some((step) => step.args.includes(file)));
    }
  }
});

test("the API owner leaves the packaged-Web suite to delivery integration", () => {
  // tests/assets asserts that apps/web/build/client exists. Only delivery
  // integration builds it, so running this suite from the API lane fails on a
  // missing build output rather than on a real defect.
  for (const plan of [
    buildOwnerPlan({ owner: "api" }),
    buildOwnerPlan({ owner: "api", profile: "node" }),
  ]) {
    assert.ok(!plan.some((step) => step.args.includes("test:assets")));
  }
  assert.ok(apiSuiteCommand.includes("--exclude"));
  assert.ok(apiSuiteCommand.includes("tests/assets/**"));

  // The suite keeps running where Web is built, so the exclusion takes nothing
  // out of the aggregate: exactly one step owns it.
  const root = buildOwnerPlan({ owner: "root" });
  assert.equal(
    root.filter((step) => step.args.includes("test:assets")).length,
    1,
  );
});

test("the standalone API Node profile builds before using its artifact", () => {
  const plan = buildOwnerPlan({ owner: "api", profile: "node" });

  assert.deepEqual(scripts(plan), ["build"]);
  assert.equal(plan.length, 2);
  assert.equal(plan[1].executable, "pnpm");
  assert.deepEqual(plan[1].args.slice(0, 3), ["exec", "vitest", "run"]);
  assert.equal(plan[1].cwd, `${repositoryRoot}/apps/api`);
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
