const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { test } = require("node:test");
const { pathToFileURL } = require("node:url");

const projectRoot = resolve(__dirname, "..");
const scriptPath = resolve(
  projectRoot,
  "scripts/maps/prepare-exchange-map.mjs",
);
const subject = import(pathToFileURL(scriptPath).href);
const publicationScriptPath = resolve(
  projectRoot,
  "apps/api/scripts/operations/publish-openmap.js",
);
const publication = require(publicationScriptPath);

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

test("OpenMap publication keys start with namespace then release version", () => {
  const version = publication.releaseVersion({
    openFreeMapVersion: "20260816_080001_pt",
    maxZoom: 11,
  });
  assert.equal(version, "20260816_080001_pt-z0-11");
  assert.equal(
    publication.objectKey(version, "exchange/openfreemap-z0-11.pmtiles"),
    "openmap/20260816_080001_pt-z0-11/exchange/openfreemap-z0-11.pmtiles",
  );
  assert.throws(
    () => publication.objectKey(version, "../production/object"),
    /Invalid release-relative object path/,
  );
});

test("OpenMap publication refuses an unasserted or production bucket", () => {
  const environment = {
    IMS_S3_BUCKET: "imsweb-media-public-prod",
    IMS_S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
    IMS_PUBLIC_READ_URL_BASE: "https://assets.example.test",
    IMS_S3_REGION: "auto",
    AWS_ACCESS_KEY_ID: "test-access-key",
    AWS_SECRET_ACCESS_KEY: "test-secret-key",
  };
  assert.throws(
    () => publication.targetConfiguration(environment, "another-bucket"),
    /Bucket safety assertion failed/,
  );
  assert.throws(
    () =>
      publication.targetConfiguration(environment, "imsweb-media-public-prod"),
    /explicit test segment/,
  );
  assert.equal(
    publication.targetConfiguration(
      { ...environment, IMS_S3_BUCKET: "imsweb-media-public-test" },
      "imsweb-media-public-test",
    ).bucket,
    "imsweb-media-public-test",
  );
});

test("OpenMap publication manifest describes the canonical object tree", () => {
  const directory = mkdtempSync(join(tmpdir(), "imsweb-openmap-release-"));
  const releaseDir = join(directory, "release");
  const styleFile = join(directory, "exchange-style.json");
  mkdirSync(join(releaseDir, "fonts", "Noto Sans Regular"), {
    recursive: true,
  });
  mkdirSync(join(releaseDir, "natural-earth", "0", "0"), {
    recursive: true,
  });
  mkdirSync(join(releaseDir, "sprites"), { recursive: true });
  writeFileSync(join(releaseDir, "openfreemap-z0-11.pmtiles"), "pmtiles");
  writeFileSync(
    join(releaseDir, "fonts", "Noto Sans Regular", "0-255.pbf"),
    "font",
  );
  writeFileSync(join(releaseDir, "natural-earth", "0", "0", "0.png"), "png");
  writeFileSync(join(releaseDir, "sprites", "ofm.json"), "{}");
  writeFileSync(
    join(releaseDir, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      openFreeMapVersion: "20260816_080001_pt",
      maxZoom: 11,
      archive: {
        file: "openfreemap-z0-11.pmtiles",
        bytes: 7,
        sha256: "test",
      },
      companionAssets: { total: 3 },
    }),
  );
  writeFileSync(
    styleFile,
    JSON.stringify({ version: 8, sources: {}, layers: [] }),
  );

  try {
    const plan = publication.buildPublicationPlan(releaseDir, styleFile);
    assert.equal(plan.releaseVersion, "20260816_080001_pt-z0-11");
    assert.equal(plan.objectRoot, "openmap/20260816_080001_pt-z0-11");
    assert.equal(plan.objectCount, 6);
    const manifest = JSON.parse(plan.manifestBody);
    assert.equal(
      manifest.styleObject,
      "openmap/20260816_080001_pt-z0-11/exchange-style.json",
    );
    assert.equal(
      manifest.assetRoot,
      "openmap/20260816_080001_pt-z0-11/exchange",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
