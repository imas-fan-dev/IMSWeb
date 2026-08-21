const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = resolve(__dirname, "..");
const scriptPath = resolve(
  projectRoot,
  "scripts/maps/prepare-exchange-map.mjs",
);
const subject = import(pathToFileURL(scriptPath).href);

test("exchange map preparation plans a complete z0-11 same-origin release", async () => {
  const {
    buildResourcePlan,
    DEFAULT_OPENFREEMAP_VERSION,
    MAX_ZOOM,
    PMTILES_CLI_VERSION,
  } = await subject;
  const plan = buildResourcePlan();
  const counts = Object.groupBy(plan.resources, ({ kind }) => kind);

  assert.equal(plan.version, DEFAULT_OPENFREEMAP_VERSION);
  assert.equal(MAX_ZOOM, 11);
  assert.equal(PMTILES_CLI_VERSION, "1.31.2");
  assert.match(
    plan.archiveSource,
    /\/areas\/planet\/20260816_080001_pt\/tiles\.pmtiles$/,
  );
  assert.equal(counts.sprite.length, 4);
  assert.equal(counts.glyph.length, 3 * 256);
  assert.equal(counts["natural-earth"].length, 5_461);
  assert.equal(plan.resources.length, 6_233);
  assert.ok(plan.releaseDir.endsWith("openfreemap-20260816_080001_pt-z0-11"));
  assert.ok(plan.currentLink.endsWith("data/maps/current"));
});

test("exchange map preparation rejects unsafe or ambiguous options", async () => {
  const { parseArguments } = await subject;
  assert.throws(() => parseArguments(["--activate"]), /requires --apply/);
  assert.throws(() => parseArguments(["--concurrency", "0"]), /1 to 32/);
  assert.throws(() => parseArguments(["--version", "latest"]), /YYYYMMDD/);
  assert.throws(() => parseArguments(["--unknown"]), /Unknown argument/);
});

test("exchange map preparation is a no-write dry-run by default", () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: projectRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PMTiles zoom: z0-11/);
  assert.match(result.stdout, /6233/);
  assert.match(result.stdout, /Dry-run only/);
});
