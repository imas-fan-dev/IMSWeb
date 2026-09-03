const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const detectorUrl = pathToFileURL(
  path.resolve(__dirname, "../scripts/ci/detect-affected-workspaces.mjs"),
).href;
const detector = import(detectorUrl);

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

const singlePathCases = [
  ["docs/operations/github-actions-deployment.md", REPOSITORY_ONLY],
  ["docs/README.md", { ...REPOSITORY_ONLY, app: true }],
  [
    "docs/development/app-device-delivery.md",
    { ...REPOSITORY_ONLY, app: true },
  ],
  ["deploy/compose.yaml", REPOSITORY_ONLY],
  ["apps/web/src-tauri/tauri.conf.json", { ...REPOSITORY_ONLY, app: true }],
  ["apps/web/scripts/build-app.js", { ...REPOSITORY_ONLY, app: true }],
  [
    "apps/web/tests/unit/pages/home/home-page.test.tsx",
    { ...REPOSITORY_ONLY, web: true },
  ],
  [
    "apps/web/app/routes.ts",
    { ...REPOSITORY_ONLY, app: true, web: true, integration: true },
  ],
  [
    "apps/web/public/brand/imsweb-app-icon.png",
    { ...REPOSITORY_ONLY, app: true, web: true, integration: true },
  ],
  ["apps/api/src/domains/news/service.ts", { ...REPOSITORY_ONLY, api: true }],
  [
    "apps/api/src/domains/news/routes.ts",
    { ...REPOSITORY_ONLY, api: true, integration: true },
  ],
  [
    "apps/api/scripts/build/build-client.js",
    { ...REPOSITORY_ONLY, integration: true },
  ],
  ["packages/contracts/src/news.ts", ALL_JOBS],
  ["package.json", ALL_JOBS],
  [".github/workflows/ci.yml", ALL_JOBS],
  ["unclassified/new-file.xyz", ALL_JOBS],
];

test("classifies the representative single-path ownership table", async (t) => {
  const { classifyChangedPaths } = await detector;

  for (const [changedPath, expected] of singlePathCases) {
    await t.test(changedPath, () => {
      assert.deepEqual(classifyChangedPaths([changedPath]), expected);
    });
  }
});

test("classifies App scripts, App tests, and browser Web configuration", async () => {
  const { classifyChangedPaths } = await detector;

  for (const changedPath of [
    "apps/web/scripts/app-device.js",
    "apps/web/scripts/app-toolchain.js",
    "apps/web/scripts/dev-app.js",
    "apps/web/scripts/android-release-network.js",
    "apps/web/playwright.app.config.ts",
    "apps/web/tests/e2e/app-shell.spec.ts",
    "tests/tauri-build-configuration.test.js",
    "tests/tauri-device-delivery.test.js",
    "apps/web/.gitignore",
    "apps/web/.rules",
    "docs/development/tauri-mobile.md",
  ]) {
    assert.deepEqual(classifyChangedPaths([changedPath]), {
      ...REPOSITORY_ONLY,
      app: true,
    });
  }

  for (const changedPath of [
    "apps/web/tests/e2e/home.smoke.spec.ts",
    "apps/web/eslint.config.js",
    "apps/web/playwright.config.ts",
    "apps/web/vitest.config.ts",
    "tests/test_public_assets.py",
  ]) {
    assert.deepEqual(classifyChangedPaths([changedPath]), {
      ...REPOSITORY_ONLY,
      web: true,
    });
  }
});

test("unions ownership across every changed path", async () => {
  const { classifyChangedPaths } = await detector;

  assert.deepEqual(
    classifyChangedPaths([
      "apps/web/src-tauri/tauri.conf.json",
      "apps/web/tests/unit/pages/home/home-page.test.tsx",
      "apps/api/src/domains/news/service.ts",
    ]),
    {
      repo: true,
      app: true,
      web: true,
      api: true,
      integration: false,
    },
  );
  assert.deepEqual(classifyChangedPaths([]), REPOSITORY_ONLY);
});

test("parses NUL-delimited additions, modifications, and deletions", async () => {
  const { parseNameStatusDiff } = await detector;

  assert.deepEqual(
    parseNameStatusDiff(
      Buffer.from(
        "A\0apps/web/app/new.ts\0M\0apps/api/src/app.ts\0D\0docs/old.md\0",
      ),
    ),
    ["apps/web/app/new.ts", "apps/api/src/app.ts", "docs/old.md"],
  );
  assert.deepEqual(parseNameStatusDiff(Buffer.alloc(0)), []);
});

test("parses both old and new paths for renames", async () => {
  const { parseNameStatusDiff } = await detector;

  assert.deepEqual(
    parseNameStatusDiff(
      Buffer.from("R100\0apps/web/src-tauri/old.json\0apps/web/app/new.ts\0"),
    ),
    ["apps/web/src-tauri/old.json", "apps/web/app/new.ts"],
  );
});

test("rejects malformed name-status records", async () => {
  const { parseNameStatusDiff } = await detector;

  for (const malformed of [
    "A\0missing-terminator",
    "R100\0only-old-path\0",
    "R101\0old\0new\0",
    "Q\0unknown-status\0",
    "M\0\0",
  ]) {
    assert.throws(() => parseNameStatusDiff(Buffer.from(malformed)), /diff/i);
  }

  const invalidUtf8 = Buffer.concat([
    Buffer.from("A\0docs/"),
    Buffer.from([0xff]),
    Buffer.from(".md\0"),
  ]);
  assert.throws(() => parseNameStatusDiff(invalidUtf8), /diff/i);
});

function successfulGit(stdout) {
  return { status: 0, stdout: Buffer.from(stdout), stderr: Buffer.alloc(0) };
}

test("detects additions, deletions, and rename ownership from a push diff", async () => {
  const { detectAffectedWorkspaces } = await detector;
  const calls = [];
  const beforeSha = "1".repeat(40);
  const headSha = "2".repeat(40);
  const runGit = (argumentsList) => {
    calls.push(argumentsList);
    return successfulGit(
      "A\0docs/README.md\0D\0apps/web/src-tauri/removed.json\0" +
        "R095\0apps/api/src/domains/news/service.ts\0" +
        "apps/api/src/domains/news/routes.ts\0",
    );
  };

  assert.deepEqual(
    detectAffectedWorkspaces({ eventName: "push", beforeSha, headSha, runGit }),
    {
      repo: true,
      app: true,
      web: false,
      api: true,
      integration: true,
    },
  );
  assert.deepEqual(calls, [
    ["diff", "--name-status", "-z", "--find-renames", beforeSha, headSha],
  ]);
});

test("uses the pull-request merge base and accepts a valid empty diff", async () => {
  const { detectAffectedWorkspaces } = await detector;
  const calls = [];
  const baseSha = "3".repeat(40);
  const headSha = "4".repeat(40);
  const mergeBase = "5".repeat(40);
  const runGit = (argumentsList) => {
    calls.push(argumentsList);
    if (argumentsList[0] === "merge-base") {
      return successfulGit(`${mergeBase}\n`);
    }
    return successfulGit("");
  };

  assert.deepEqual(
    detectAffectedWorkspaces({
      eventName: "pull_request",
      baseSha,
      headSha,
      runGit,
    }),
    REPOSITORY_ONLY,
  );
  assert.deepEqual(calls, [
    ["merge-base", baseSha, headSha],
    ["diff", "--name-status", "-z", "--find-renames", mergeBase, headSha],
  ]);
});

test("fails open for unavailable bases, Git failures, and malformed diffs", async () => {
  const { detectAffectedWorkspaces } = await detector;
  const validSha = "6".repeat(40);
  const zeroSha = "0".repeat(40);

  assert.deepEqual(
    detectAffectedWorkspaces({
      eventName: "push",
      beforeSha: zeroSha,
      headSha: validSha,
      runGit: () => {
        throw new Error("Git must not run for an all-zero base");
      },
    }),
    ALL_JOBS,
  );
  assert.deepEqual(
    detectAffectedWorkspaces({
      eventName: "pull_request",
      baseSha: "7".repeat(40),
      headSha: validSha,
      runGit: () => ({ status: 128, stdout: Buffer.alloc(0) }),
    }),
    ALL_JOBS,
  );
  assert.deepEqual(
    detectAffectedWorkspaces({
      eventName: "push",
      beforeSha: "8".repeat(40),
      headSha: validSha,
      runGit: () => ({ status: 1, stdout: Buffer.alloc(0) }),
    }),
    ALL_JOBS,
  );
  assert.deepEqual(
    detectAffectedWorkspaces({
      eventName: "push",
      beforeSha: "8".repeat(40),
      headSha: validSha,
      runGit: () => successfulGit("R100\0missing-new-path\0"),
    }),
    ALL_JOBS,
  );
  assert.deepEqual(
    detectAffectedWorkspaces({
      eventName: "push",
      beforeSha: "8".repeat(40),
      headSha: validSha,
      runGit: () =>
        successfulGit(
          Buffer.concat([
            Buffer.from("A\0docs/"),
            Buffer.from([0xff]),
            Buffer.from(".md\0"),
          ]),
        ),
    }),
    ALL_JOBS,
  );
  assert.deepEqual(
    detectAffectedWorkspaces({
      eventName: "push",
      beforeSha: "invalid",
      headSha: validSha,
      runGit: () => {
        throw new Error("Git must not run for invalid input");
      },
    }),
    ALL_JOBS,
  );
});

test("formats deterministic lowercase GitHub outputs", async () => {
  const { formatGitHubOutputs } = await detector;

  assert.equal(
    formatGitHubOutputs({
      repo: true,
      app: false,
      web: true,
      api: false,
      integration: true,
    }),
    "repo=true\napp=false\nweb=true\napi=false\nintegration=true\n",
  );
});
