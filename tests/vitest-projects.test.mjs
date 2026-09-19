import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

const rootConfig = "vitest.config.mts";

// The one definition of the execution domains: the root UI panel may only point
// at these three configs, and each one stays the owner of its own `include`,
// `environment` and coverage shape. `scripts/testing/run-test-owner.mjs` runs
// the same three configs from CI, so a glob that drifts here makes the panel and
// the gates disagree about what a domain is — silently, because both keep
// passing on the smaller set.
const domains = [
  {
    domain: "api",
    file: "apps/api/vitest.config.mts",
    panelRoot: "apps/api",
    workspaceCwd: true,
    environment: "node",
    include: ["tests/**/*.test.{ts,js}"],
  },
  {
    domain: "web",
    file: "apps/web/vitest.config.ts",
    panelRoot: "apps/web",
    workspaceCwd: true,
    environment: "jsdom",
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
  },
  {
    domain: "repository",
    file: "scripts/testing/vitest/vitest.repository.config.mts",
    panelRoot: ".",
    // This domain runs from the repository root in the panel and in CI, so it
    // needs no cwd bridge.
    workspaceCwd: false,
    environment: "node",
    include: [
      "tests/**/*.test.{js,mjs,ts}",
      "scripts/**/tests/**/*.test.mjs",
    ],
  },
];

const read = (file) => readFileSync(path.join(repositoryRoot, file), "utf8");
const domainFiles = domains.map(({ file }) => file);

// Slice the first balanced `open`…`close` block that follows `marker`. Going
// through the block keeps an assertion from matching a same-named key in a
// sibling block (`test.include` versus `coverage.include`) or a path that merely
// appears in a comment.
const blockFrom = (source, start, open, close, label) => {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === open) depth += 1;
    else if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${label} has an unbalanced ${open}${close} block`);
};

const blockAfter = (source, marker, open, close, label) => {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${label} declares ${marker}`);
  const start = source.indexOf(open, markerIndex);
  assert.notEqual(start, -1, `${label} has ${open} after ${marker}`);
  return blockFrom(source, start, open, close, label);
};

const objectAfter = (source, marker, label) =>
  blockAfter(source, marker, "{", "}", label);

// Every quoted value inside a block, which is how both the array form and the
// single-string form of a glob list are read. Formatting is not asserted.
const quotedValues = (block) =>
  [...block.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);

const escapeForRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The configs are hand-written and mix quote styles, so every value assertion
// accepts either quote.
const quoted = (value) => `["']${escapeForRegExp(value)}["']`;

// The object entry one project contributes to `projects`. Its `{` sits before
// the `extends` key, so the entry is read backwards from the config path it
// names.
const projectEntry = (source, configFile, label) => {
  const marker = new RegExp(`extends:\\s*${quoted(configFile)}`).exec(source);
  assert.notEqual(marker, null, `${label} extends ${configFile}`);
  const start = source.lastIndexOf("{", marker.index);
  assert.notEqual(start, -1, `${label} opens an object before extends`);
  return blockFrom(source, start, "{", "}", `${label} project entry`);
};

test("the root panel points at exactly the three execution domains", () => {
  assert.ok(
    existsSync(path.join(repositoryRoot, rootConfig)),
    `${rootConfig} exists`,
  );
  const source = read(rootConfig);
  const projects = blockAfter(source, "projects:", "[", "]", "the root panel");

  // Both `projects: ["./path"]` and the object form
  // (`projects: [{ extends: "./path", … }]`) resolve config-file entries, so the
  // assertion reads every config path in the array instead of one syntax.
  const declared = [
    ...projects.matchAll(/["']([^"']+\.config\.[cm]?[jt]s)["']/g),
  ].map((match) => match[1]);

  assert.deepEqual(
    new Set(declared),
    new Set(domainFiles),
    "the root panel must reference exactly the api, web and repository configs",
  );
  assert.equal(
    declared.length,
    domainFiles.length,
    "no domain config may be referenced twice",
  );

  for (const file of declared) {
    assert.ok(
      existsSync(path.join(repositoryRoot, file)),
      `${file} resolved from the root panel exists`,
    );
  }
});

// `root` decides the directory a project's `include` resolves against, so it is
// what turns a config path into a file set. Leaving it out fails nothing: the
// project inherits the root config's directory and keeps passing on whatever
// matches there. Measured on the api entry — dropping `root` moved the panel
// from 884 api cases to the 5 root-level governance files, with every other
// assertion in this file still green.
//
// The api and web suites are also written to run with their workspace as cwd
// (`pnpm --filter … run test`), and a few of them read fixtures through
// `process.cwd()`. The panel is one process rooted at the repository root, so
// those two entries carry the cwd bridge; the repository entry deliberately does
// not, because it runs from the repository root either way.
test("the panel resolves each domain from the directory its globs are written for", () => {
  const source = read(rootConfig);
  const cwdBridge = "scripts/testing/vitest/panel-workspace-cwd.setup.mts";
  assert.ok(
    existsSync(path.join(repositoryRoot, cwdBridge)),
    `${cwdBridge} exists`,
  );
  assert.ok(
    source.includes(cwdBridge),
    `the root panel binds ${cwdBridge} to a project`,
  );

  for (const { domain, file, panelRoot, workspaceCwd } of domains) {
    const entry = projectEntry(source, file, domain);

    assert.match(
      entry,
      new RegExp(`root:\\s*${quoted(panelRoot)}`),
      `${domain} must resolve its include from ${panelRoot}`,
    );

    if (workspaceCwd) {
      assert.match(
        entry,
        /IMS_PANEL_WORKSPACE_ROOT/,
        `${domain} must hand its workspace to the cwd bridge`,
      );
      assert.match(
        entry,
        /setupFiles:\s*\[/,
        `${domain} must install the cwd bridge`,
      );
    } else {
      assert.doesNotMatch(
        entry,
        /IMS_PANEL_WORKSPACE_ROOT/,
        `${domain} runs from the repository root and needs no cwd bridge`,
      );
    }
  }
});

test("each domain keeps the environment the panel must isolate", () => {
  for (const { domain, file, environment } of domains) {
    const source = read(file);
    const testBlock = objectAfter(source, "test: {", `${domain} config`);

    // The panel runs every project in one process, so the per-project
    // environment is what keeps DOM-dependent Web cases and Node-only API cases
    // apart. Web loses `jsdom` and its component tests fail; API gains a DOM it
    // was never written against.
    assert.match(
      testBlock,
      new RegExp(`environment:\\s*${quoted(environment)}`),
      `${domain} must keep environment: ${environment}`,
    );
  }
});

test("each domain keeps the globs the panel and CI both run", () => {
  for (const { domain, file, include } of domains) {
    const source = read(file);
    const testBlock = objectAfter(source, "test: {", `${domain} config`);
    const declared = quotedValues(
      blockAfter(testBlock, "include:", "[", "]", `${domain} test block`),
    );

    // `include` decides which files exist for the panel and for the CI owner
    // step at the same time. Narrowing one glob here would shrink both and stay
    // green, so the shape is asserted rather than trusted.
    assert.deepEqual(
      new Set(declared),
      new Set(include),
      `${domain} test include globs`,
    );
  }
});

test("the root panel declares no coverage gate of its own", () => {
  const source = read(rootConfig);

  // Coverage belongs to the domain runs that measure a whole domain and only
  // they set `IMS_TEST_COVERAGE_ENABLED`. A gate on the panel would be measured
  // against whatever subset a developer happened to select.
  assert.doesNotMatch(source, /^\s*coverage:\s*\{/m);
});

test("the repository config still declares no coverage gate", () => {
  const source = read("scripts/testing/vitest/vitest.repository.config.mts");

  // Its three CI invocations share one config and one `scripts/**` denominator
  // while each loads a different slice, so the gate could only sit at the
  // smallest slice. `tests/vitest-reporting.test.mjs` owns the threshold shape;
  // this only guards that the panel never has to reproduce one.
  assert.doesNotMatch(source, /^\s*coverage:\s*\{/m);
});
