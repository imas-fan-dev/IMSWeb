import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  readFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "vitest";
import { buildFiles, buildIdentity, verifyBuild } from "../build-artifact.mjs";
import { classifyChangedPaths } from "../detect-affected-workspaces.mjs";
import {
  coreJobs,
  verifyCandidate,
  verifyRemoteCandidate,
} from "../verified-candidate.mjs";
import {
  buildOwnerPlan,
  repositoryRoot,
} from "../../testing/run-test-owner.mjs";

const sha = "a".repeat(40);
const tree = "b".repeat(40);
const expected = { repository: "owner/repo", sha, workflowId: 42 };
const run = {
  id: 12,
  run_attempt: 2,
  repository: { full_name: "owner/repo" },
  head_repository: { full_name: "owner/repo" },
  event: "push",
  head_branch: "release/v1.1",
  head_sha: sha,
  workflow_id: 42,
  path: ".github/workflows/ci.yml",
  status: "completed",
  conclusion: "success",
};
const jobs = coreJobs.map((name) => ({
  name,
  status: "completed",
  conclusion: "success",
  head_sha: sha,
  run_id: 12,
}));

test("candidate validation rejects forks, PR merge results and unrelated workflows or candidates", () => {
  assert.equal(verifyCandidate(run, jobs, expected), 12);
  for (const patch of [
    { repository: { full_name: "fork/repo" } },
    { head_repository: { full_name: "fork/repo" } },
    { event: "pull_request" },
    { head_branch: "main" },
    { head_sha: tree },
    { workflow_id: 99 },
    { path: ".github/workflows/other.yml" },
    { status: "in_progress" },
    { status: "queued" },
  ])
    assert.throws(() => verifyCandidate({ ...run, ...patch }, jobs, expected));
});

test("completed validation authorizes manual recovery after publication failure without waiting on itself", () => {
  assert.equal(
    verifyCandidate({ ...run, conclusion: "failure" }, jobs, expected),
    12,
  );
  assert.equal(
    verifyCandidate({ ...run, status: "in_progress", conclusion: null }, jobs, {
      ...expected,
      allowRunning: true,
    }),
    12,
  );
  assert.throws(() =>
    verifyCandidate(
      { ...run, status: "in_progress", conclusion: null },
      jobs,
      expected,
    ),
  );
  assert.throws(() =>
    verifyCandidate({ ...run, conclusion: "failure" }, jobs.slice(1), expected),
  );
});

test("every complete core job is mandatory, including units, build and browser independently", () => {
  for (let index = 0; index < jobs.length; index++) {
    assert.throws(() =>
      verifyCandidate(
        run,
        jobs.filter((_, i) => i !== index),
        expected,
      ),
    );
    assert.throws(() => verifyCandidate(run, [...jobs, jobs[index]], expected));
    for (const patch of [
      { conclusion: "failure" },
      { conclusion: "cancelled" },
      { conclusion: "skipped" },
      { conclusion: null },
      { status: "queued" },
      { head_sha: tree },
      { run_id: 13 },
    ]) {
      assert.throws(() =>
        verifyCandidate(
          run,
          jobs.map((job, i) => (i === index ? { ...job, ...patch } : job)),
          expected,
        ),
      );
    }
  }
});

test("manual and caller-run paths require current head, trusted complete jobs and matching tree", () => {
  for (const manual of [true, false]) {
    const env = {
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_SERVER_URL: "https://github.com",
      RELEASE_SHA: sha,
      ...(manual ? {} : { CANDIDATE_RUN_ID: "12" }),
    };
    const requests = [];
    let candidateTree = tree;
    let current = sha;
    const git = (args) =>
      args[0] === "ls-remote" ? current : args[1] === "HEAD" ? sha : tree;
    const api = (endpoint) => {
      requests.push(endpoint);
      if (endpoint.includes("git/commits"))
        return { tree: { sha: candidateTree } };
      if (endpoint.includes("/jobs?"))
        return { jobs, total_count: jobs.length };
      if (endpoint.endsWith("/ci.yml")) return { id: 42 };
      if (endpoint.includes("/runs?")) return { workflow_runs: [run] };
      return run;
    };
    verifyRemoteCandidate(env, api, git);
    assert.ok(requests.some((request) => request.includes("/attempts/2/jobs")));
    candidateTree = sha;
    assert.throws(() => verifyRemoteCandidate(env, api, git), /tree/);
    current = tree;
    const count = requests.length;
    assert.throws(() => verifyRemoteCandidate(env, api, git), /stale/);
    assert.equal(requests.length, count);
    assert.throws(() =>
      verifyRemoteCandidate(
        env,
        () => ({ workflow_runs: [] }),
        (args) => (args[0] === "ls-remote" ? sha : tree),
      ),
    );
  }
});

test("recorded identities use checkout, lockfile, installed versions and normalized target origins", () => {
  const env = { GITHUB_SHA: sha, GITHUB_RUN_ID: "12", GITHUB_RUN_ATTEMPT: "2" };
  let dirty = "";
  const execute = (command, args) =>
    command === "pnpm"
      ? "11.10.0"
      : args[0] === "status"
        ? dirty
        : args[1] === "HEAD"
          ? sha
          : tree;
  const web = buildIdentity("web", repositoryRoot, env, execute);
  const app = buildIdentity("app", repositoryRoot, env, execute);
  assert.equal(web.sha, sha);
  assert.equal(web.tree, tree);
  assert.match(web.lockfile, /^[0-9a-f]{64}$/);
  for (const version of Object.values(web.versions))
    assert.ok(version.length > 0);
  assert.equal(app.origins.api, "https://idol-master.top");
  assert.equal(app.origins.site, "https://idol-master.top");
  assert.notDeepEqual(web, app);
  assert.throws(
    () => buildIdentity("wrong", repositoryRoot, env, execute),
    /target/,
  );
  assert.throws(
    () => buildIdentity("web", repositoryRoot, {}, execute),
    /Same-run/,
  );
  assert.throws(
    () =>
      buildIdentity(
        "web",
        repositoryRoot,
        { ...env, GITHUB_SHA: tree },
        execute,
      ),
    /SHA/,
  );
  dirty = " M apps/web/app/root.tsx";
  assert.throws(
    () => buildIdentity("web", repositoryRoot, env, execute),
    /dirty/,
  );
});

test("the active trusted caller verifies paginated validation jobs without waiting for publication", () => {
  const env = {
    GITHUB_REPOSITORY: "owner/repo",
    GITHUB_SERVER_URL: "https://github.com",
    RELEASE_SHA: sha,
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: "refs/heads/release/v1.1",
    GITHUB_RUN_ID: "12",
    CANDIDATE_RUN_ID: "12",
  };
  const active = { ...run, status: "in_progress", conclusion: null };
  const requests = [];
  const api = (endpoint) => {
    requests.push(endpoint);
    if (endpoint.includes("git/commits")) return { tree: { sha: tree } };
    if (endpoint.includes("/jobs?"))
      return {
        jobs: endpoint.endsWith("page=1")
          ? jobs.slice(0, 5)
          : [
              ...jobs.slice(5),
              {
                name: "Publish verified preview candidate",
                status: "in_progress",
                conclusion: null,
              },
            ],
        total_count: jobs.length + 1,
      };
    if (endpoint.endsWith("/ci.yml")) return { id: 42 };
    return active;
  };
  const git = (args) =>
    args[0] === "ls-remote" || args[1] === "HEAD" ? sha : tree;
  verifyRemoteCandidate(env, api, git);
  assert.ok(requests.some((endpoint) => endpoint.endsWith("page=2")));
  assert.throws(() =>
    verifyRemoteCandidate(
      { ...env, GITHUB_EVENT_NAME: "workflow_dispatch" },
      api,
      git,
    ),
  );
  assert.throws(() =>
    verifyRemoteCandidate({ ...env, GITHUB_RUN_ID: "13" }, api, git),
  );
});

test("artifact identity and every file digest reject tampering, omissions and additions", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ims-build-identity-"));
  try {
    mkdirSync(path.join(directory, "client"));
    writeFileSync(
      path.join(directory, "client/index.html"),
      "<html>candidate</html>",
    );
    writeFileSync(path.join(directory, "client/app.js"), "candidate");
    const identity = {
      sha,
      tree,
      lockfile: "lock",
      target: "web",
      origins: { api: "", site: "", map: "" },
      versions: {
        node: "24",
        pnpm: "11",
        vite: "8",
        router: "7",
        playwright: "1",
      },
      run: "12",
      attempt: "2",
    };
    const files = buildFiles(directory);
    const manifest = { identity, files };
    verifyBuild(manifest, identity, files);
    for (const key of Object.keys(identity)) {
      assert.throws(
        () => verifyBuild(manifest, { ...identity, [key]: "wrong" }, files),
        /identity/,
      );
    }
    for (const group of ["origins", "versions"])
      for (const key of Object.keys(identity[group])) {
        assert.throws(
          () =>
            verifyBuild(
              manifest,
              { ...identity, [group]: { ...identity[group], [key]: "wrong" } },
              files,
            ),
          /identity/,
        );
      }
    writeFileSync(path.join(directory, "client/app.js"), "tampered");
    assert.throws(
      () => verifyBuild(manifest, identity, buildFiles(directory)),
      /digest/,
    );
    rmSync(path.join(directory, "client/app.js"));
    assert.throws(() => buildFiles(directory), /Incomplete/);
    writeFileSync(path.join(directory, "client/app.js"), "candidate");
    writeFileSync(path.join(directory, "client/extra.js"), "extra");
    assert.throws(
      () => verifyBuild(manifest, identity, buildFiles(directory)),
      /digest/,
    );
    symlinkSync(
      path.join(directory, "client/index.html"),
      path.join(directory, "client/link.html"),
    );
    assert.throws(() => buildFiles(directory), /symlinks/);
    assert.throws(() => verifyBuild({}, identity, files), /identity/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("owner reuse validates before consumers and default local prerequisites still build", () => {
  for (const options of [
    { owner: "web", profile: "browser" },
    { owner: "delivery", profile: "integration" },
  ]) {
    const local = buildOwnerPlan(options);
    assert.ok(local[0].args.includes("build"));
    const reused = buildOwnerPlan({
      ...options,
      artifact: ".ci-artifacts/web.json",
    });
    assert.deepEqual(reused[0].args, [
      "scripts/ci/build-artifact.mjs",
      "verify",
      "web",
      ".ci-artifacts/web.json",
    ]);
    assert.ok(
      !reused.some(
        (step) =>
          step.args.includes("@imsweb/web") && step.args.at(-1) === "build",
      ),
    );
  }
  assert.throws(() =>
    buildOwnerPlan({ owner: "web", profile: "validation", artifact: "bad" }),
  );
  assert.deepEqual(
    buildOwnerPlan({ owner: "web", profile: "validation" }).map((step) =>
      step.args.at(-1),
    ),
    ["lint", "typecheck", "test:unit"],
  );
});

test("failed artifact verification stops the owner before API build or browser execution", () => {
  for (const [owner, profile] of [
    ["web", "browser"],
    ["delivery", "integration"],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/testing/run-test-owner.mjs",
        owner,
        profile,
        "--artifact=/missing/web.json",
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_RUN_ID: "12",
          GITHUB_RUN_ATTEMPT: "2",
          GITHUB_SHA: sha,
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stdout, /verify same-run Web artifacts/);
    assert.ok(!result.stdout.includes("build API delivery artifacts"));
    assert.ok(!result.stdout.includes("test Web in browsers"));
    assert.match(result.stderr, /Candidate SHA differs from checkout/);
  }
});

test("workflow dependencies expose compiled browsers after build and Preview consumes CI", () => {
  const ci = readFileSync(
    path.join(repositoryRoot, ".github/workflows/ci.yml"),
    "utf8",
  );
  const preview = readFileSync(
    path.join(repositoryRoot, ".github/workflows/deploy-preview.yml"),
    "utf8",
  );
  assert.match(ci, /web-browser:[\s\S]*?needs: \[changes, web-build\]/);
  assert.match(ci, /integration:[\s\S]*?needs: \[changes, web-build\]/);
  assert.match(ci, /web validation/);
  assert.match(ci, /web browser --artifact=/);
  assert.match(preview, /workflow_call:/);
  assert.ok(
    ci.includes(
      "github.ref == 'refs/heads/release/v1.1' && github.run_id || 'latest'",
    ),
  );
  assert.ok(!preview.includes("workflow_run:"));
  assert.match(
    ci,
    /preview:[\s\S]*?needs: result[\s\S]*?needs.result.result == 'success'/,
  );
  assert.match(
    ci,
    /github.event_name == 'push' && github.ref == 'refs\/heads\/release\/v1.1'/,
  );
  assert.match(ci, /uses: .\/\.github\/workflows\/deploy-preview.yml/);
  const caller = ci.slice(ci.indexOf("  preview:"));
  const declarations = preview.split("  workflow_call:\n")[1].split("  workflow_dispatch:")[0];
  assert.equal(
    declarations,
    "    secrets:\n" +
      "      PREVIEW_DEPLOY_SSH_PRIVATE_KEY:\n        required: true\n" +
      "      PREVIEW_DEPLOY_SSH_KNOWN_HOSTS:\n        required: true\n",
  );
  assert.ok(!ci.includes("secrets: inherit"));
  assert.ok(!caller.includes("environment:"));
  for (const name of ["PREVIEW_DEPLOY_SSH_PRIVATE_KEY", "PREVIEW_DEPLOY_SSH_KNOWN_HOSTS"]) {
    const passage = `      ${name}: \u0024{{ secrets.${name} }}`;
    assert.ok(caller.includes(passage));
    assert.equal(ci.split(`secrets.${name}`).length - 1, 1);
    assert.ok(preview.includes(`\u0024{${name}:?Set preview secret ${name}}`));
  }
  assert.match(preview, /environment:\n      name: preview/);
  assert.ok(
    !ci
      .slice(ci.indexOf("  result:"))
      .split("  preview:")[0]
      .includes("- preview"),
  );
  assert.match(preview, /--source-digest "\$RELEASE_SHA"/);
  assert.match(preview, /--source-ref "refs\/heads\/\$\{SOURCE_BRANCH\}"/);
  assert.ok(!preview.includes("run: pnpm run check"));
  assert.ok(!preview.includes("run: pnpm run test"));
  assert.ok(!preview.includes("services:"));
  assert.ok(
    preview.indexOf("Verify candidate immediately before publication") <
      preview.indexOf("id: publish-image"),
  );
  assert.match(preview, /no-cache: true/);
});

test("shared preview selection requires its build and consumers and rejects aggregator mismatches", () => {
  const ci = readFileSync(path.join(repositoryRoot, ".github/workflows/ci.yml"), "utf8");
  const result = ci.split("\n  result:\n")[1].split("\n  preview:\n")[0];
  const script = result.split("        run: |\n")[1]
    .split("\n").map((line) => line.replace(/^          /, "")).join("\n");
  const build = ci.split("\n  web-build:\n")[1].split("\n  web-browser:\n")[0];
  assert.ok(build.includes("needs.changes.outputs.web == 'true' || needs.changes.outputs.integration == 'true'"));
  assert.match(ci, /web-browser:[\s\S]*?needs: \[changes, web-build\]/);
  assert.match(ci, /integration:[\s\S]*?needs: \[changes, web-build\]/);
  for (const name of [
    "apps/web/scripts/preview-app.js",
    "apps/api/tests/fixtures/app-static-preview-server.ts",
    "apps/api/tests/assets/static-preview.contract.test.ts",
  ]) {
    const selected = classifyChangedPaths([name]);
    const laneSelection = {
      REPOSITORY: selected.repo, APP: selected.app, WEB: selected.web,
      WEB_BUILD: selected.web || selected.integration, API: selected.api,
      INTEGRATION: selected.integration,
    };
    const env = { ...process.env, CHANGES_RESULT: "success" };
    for (const [lane, enabled] of Object.entries(laneSelection)) {
      env[`${lane}_SELECTED`] = String(enabled);
      env[`${lane}_RESULT`] = enabled ? "success" : "skipped";
    }
    env.WEB_BROWSER_RESULT = selected.web ? "success" : "skipped";
    const execute = (patch) => spawnSync("bash", ["-c", script], {
      env: { ...env, ...patch }, encoding: "utf8",
    });
    assert.equal(execute({}).status, 0, name);
    const required = Object.entries(laneSelection).filter(([, enabled]) => enabled).map(([lane]) => lane);
    if (selected.web) required.push("WEB_BROWSER");
    for (const lane of required) {
      for (const status of ["skipped", "failure", "cancelled", ""]) {
        const refused = execute({ [`${lane}_RESULT`]: status });
        assert.equal(refused.status, 1, `${name}: ${lane}/${status}`);
        assert.match(refused.stderr, /validation (selection\/result mismatch|did not succeed)/);
      }
    }
    assert.equal(execute({ INTEGRATION_SELECTED: "false" }).status, 1);
    assert.equal(execute({ CHANGES_RESULT: "failure" }).status, 1);
  }
});
