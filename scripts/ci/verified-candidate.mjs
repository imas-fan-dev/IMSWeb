import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const coreJobs = Object.freeze([
  "Detect affected workspaces",
  "Validate repository and infrastructure",
  "Validate App",
  "Validate Web",
  "Build Web candidate",
  "Validate Web browsers",
  "Validate API",
  "Validate Web and API integration",
  "Validate repository",
]);

export function verifyCandidate(
  run,
  jobs,
  { repository, sha, workflowId, allowRunning = false },
) {
  if (
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    run.event !== "push" ||
    run.head_branch !== "release/v1.1" ||
    run.head_sha !== sha ||
    run.workflow_id !== workflowId ||
    run.path !== ".github/workflows/ci.yml" ||
    !(
      run.status === "completed" ||
      (allowRunning && run.status === "in_progress")
    )
  ) {
    throw new Error("Untrusted or unsuccessful candidate run");
  }
  for (const name of coreJobs) {
    const matches = jobs.filter((job) => job.name === name);
    if (
      matches.length !== 1 ||
      matches[0].status !== "completed" ||
      matches[0].conclusion !== "success" ||
      matches[0].head_sha !== sha ||
      matches[0].run_id !== run.id
    ) {
      throw new Error(`Required candidate check did not succeed: ${name}`);
    }
  }
  return run.id;
}

function api(endpoint) {
  return JSON.parse(
    execFileSync("gh", ["api", endpoint], { encoding: "utf8" }),
  );
}

export function verifyRemoteCandidate(
  env = process.env,
  readApi = api,
  git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim(),
) {
  const repository = env.GITHUB_REPOSITORY;
  const sha = env.RELEASE_SHA;
  const allowRunning =
    env.GITHUB_EVENT_NAME === "push" &&
    env.GITHUB_REF === "refs/heads/release/v1.1" &&
    env.CANDIDATE_RUN_ID === env.GITHUB_RUN_ID;
  if (
    !/^[0-9a-f]{40}$/.test(sha ?? "") ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository ?? "")
  )
    throw new Error("Invalid candidate input");
  const current = git([
    "ls-remote",
    "--exit-code",
    `${env.GITHUB_SERVER_URL}/${repository}.git`,
    "refs/heads/release/v1.1",
  ]).split(/\s+/)[0];
  if (current !== sha) throw new Error("Preview candidate is stale");
  const workflow = readApi(`repos/${repository}/actions/workflows/ci.yml`);
  const runs = env.CANDIDATE_RUN_ID
    ? [readApi(`repos/${repository}/actions/runs/${env.CANDIDATE_RUN_ID}`)]
    : readApi(
        `repos/${repository}/actions/workflows/${workflow.id}/runs?event=push&branch=release%2Fv1.1&head_sha=${sha}&per_page=100`,
      ).workflow_runs;
  const run = runs.find(
    (candidate) =>
      candidate.head_sha === sha &&
      (candidate.status === "completed" ||
        (allowRunning && candidate.status === "in_progress")),
  );
  if (!run) throw new Error("No successful candidate CI run");
  const jobs = [];
  for (let page = 1; ; page++) {
    const response = readApi(
      `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`,
    );
    if (
      !Array.isArray(response.jobs) ||
      !Number.isInteger(response.total_count) ||
      response.jobs.length === 0
    )
      throw new Error("Missing candidate jobs");
    jobs.push(...response.jobs);
    if (jobs.length >= response.total_count) break;
  }
  verifyCandidate(run, jobs, {
    repository,
    sha,
    workflowId: workflow.id,
    allowRunning,
  });
  const tree = git(["rev-parse", "HEAD^{tree}"]);
  const commit = readApi(`repos/${repository}/git/commits/${sha}`);
  if (commit.tree.sha !== tree || git(["rev-parse", "HEAD"]) !== sha)
    throw new Error("Candidate tree differs from checkout");
  console.log(
    `Verified candidate ${sha} tree ${tree} CI run ${run.id} attempt ${run.run_attempt}`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  verifyRemoteCandidate();
