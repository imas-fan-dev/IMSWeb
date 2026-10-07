import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

// One entry per execution domain. `include` is the coverage denominator glob
// that domain measures; `file` is the config that must declare the shared
// reporter and coverage shape. `coverage` is false for the repository domain on
// purpose: it is three invocations sharing one config, so a denominator over
// `scripts/**` would gate the lane's smallest slice (1.36% lines). See
// scripts/testing/vitest/vitest.repository.config.mts.
const domains = [
  {
    domain: "api",
    file: "apps/api/vitest.config.mts",
    include: "src/**",
    coverage: true,
  },
  {
    domain: "web",
    file: "apps/web/vitest.config.ts",
    include: "app/**",
    coverage: true,
  },
  {
    domain: "repository",
    file: "scripts/testing/vitest/vitest.repository.config.mts",
    include: null,
    coverage: false,
  },
];

const readConfig = ({ file }) =>
  readFileSync(path.join(repositoryRoot, file), "utf8");

// Return the first balanced `{ … }` object that follows `marker`. Slicing the
// block keeps an assertion from matching a same-named key in a sibling block
// (`test.include` versus `coverage.include`) or a JUnit filename that happens to
// contain a domain name.
const objectAfter = (source, marker, label) => {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${label} declares ${marker}`);
  const start = source.indexOf("{", markerIndex);
  assert.notEqual(start, -1, `${label} has braces after ${marker}`);
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${label} has an unbalanced block after ${marker}`);
};

const escapeForRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The three configs are hand-written and mix quote styles, so every value
// assertion accepts either quote. Formatting is not asserted, only values.
const quoted = (value) => `["']${escapeForRegExp(value)}["']`;

test("every domain config writes the same JUnit artifact shape", () => {
  for (const { domain, file } of domains) {
    const source = readConfig({ file });
    const junit = objectAfter(source, "junit", `${domain} config`);

    assert.match(
      junit,
      new RegExp(`outputFile:\\s*${quoted(`reports/junit-${domain}.xml`)}`),
      `${domain} JUnit outputFile must keep the reports/junit-<domain>.xml form`,
    );
    assert.match(
      junit,
      new RegExp(`suiteName:\\s*${quoted(domain)}`),
      `${domain} JUnit suiteName`,
    );
    assert.match(
      junit,
      /includeConsoleOutput:\s*false/,
      `${domain} JUnit includeConsoleOutput`,
    );
    assert.match(
      junit,
      /addFileAttribute:\s*true/,
      `${domain} JUnit addFileAttribute`,
    );

    // The JUnit reporter is CI-only; a local run must not write a report file.
    assert.match(
      source,
      /reporters:\s*process\.env\.CI\b/,
      `${domain} reporters must stay gated on process.env.CI`,
    );
  }
});

test("every domain config writes the same coverage artifact shape", () => {
  for (const { domain, file, include } of domains.filter(
    (entry) => entry.coverage,
  )) {
    const source = readConfig({ file });
    const coverage = objectAfter(source, "coverage: {", `${domain} config`);

    assert.match(coverage, /provider:\s*["']v8["']/, `${domain} provider`);
    assert.match(
      coverage,
      /reportsDirectory:\s*["']coverage["']/,
      `${domain} reportsDirectory`,
    );
    // Coverage is opt-in for the run that owns a whole domain: the CI lanes
    // running a full suite set this flag. Keying it off `process.env.CI` instead
    // turns the gate on for filtered CI runs too — the App lane runs a single
    // Web test file and the integration lane runs `test:assets` — and every
    // threshold fails on a run it was never measured against.
    assert.match(
      coverage,
      /enabled:\s*process\.env\.IMS_TEST_COVERAGE_ENABLED\s*===\s*["']true["']/,
      `${domain} coverage must be enabled by the full-domain run flag`,
    );
    assert.doesNotMatch(
      coverage,
      /enabled:[^\n]*process\.env\.CI\b/,
      `${domain} coverage must not be enabled by process.env.CI alone`,
    );
    assert.match(
      coverage,
      new RegExp(`include:\\s*\\[\\s*${quoted(include)}\\s*\\]`),
      `${domain} coverage include glob`,
    );

    // The threshold keys must exist, but their values are not asserted here:
    // every future ratchet would otherwise have to edit this test.
    const thresholds = objectAfter(
      coverage,
      "thresholds: {",
      `${domain} coverage`,
    );
    for (const key of ["lines", "branches", "functions", "statements"]) {
      assert.match(
        thresholds,
        new RegExp(`\\b${key}:\\s*\\d+`),
        `${domain} threshold ${key}`,
      );
    }
  }
});

test("ci enables coverage only for the runs that measure a whole domain", () => {
  const workflow = readFileSync(
    path.join(repositoryRoot, ".github/workflows/ci.yml"),
    "utf8",
  );

  // Removing this flag stops coverage collection in CI without failing
  // anything, and moving it to a filtered lane fails that lane outright, so the
  // placement is asserted rather than trusted.
  const steps = workflow
    .split(/\n(?=      - name: )/)
    .filter((step) => step.includes("IMS_TEST_COVERAGE_ENABLED"));

  assert.deepEqual(
    steps.map((step) => /- name:\s*(.+)/.exec(step)[1].trim()),
    ["Test Web owner", "Test API owner"],
    "only the domain-wide CI steps may enable coverage",
  );
  for (const step of steps) {
    assert.match(
      step,
      /IMS_TEST_COVERAGE_ENABLED:\s*["']true["']/,
      "the coverage flag must be set to true",
    );
  }
});

test("the repository config declares no coverage gate", () => {
  const source = readConfig(domains[2]);

  // Its three invocations share one config and one 3292-line denominator while
  // each loads a different slice, so the gate could only sit at the smallest
  // slice (1.36% lines) and costs ~40s on the CPU-bound contracts. The domain
  // uploads JUnit instead, and `ci.yml` reflects that.
  assert.doesNotMatch(source, /^\s*coverage:\s*\{/m);
});

test("the repository config stays a plain object export", () => {
  const source = readConfig(domains[2]);

  // It is hosted from `apps/api`, so `vitest/config` would resolve from this
  // file's own directory upward and never find an installed vitest.
  assert.doesNotMatch(source, /from\s+["']vitest\/config["']/);
  assert.match(source, /export default \{/);
});
