import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildReport } from "./build-ui-report.mjs";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function fixture(t, change = () => {}) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "imsweb-ui-report-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const manifest = {
    title: "UI 验证",
    cases: [
      {
        id: "web",
        title: "搜索",
        renderer: "web",
        verdict: "PASS",
        exitCode: 0,
        receipt: "run.log",
      },
      {
        id: "android",
        title: "安装运行",
        renderer: "android-native",
        verdict: "BLOCKED",
        exitCode: null,
        reason: "Emulator unavailable",
      },
    ],
    screenshots: [
      {
        id: "search",
        title: "</script><script>bad()</script>",
        renderer: "web",
        caseId: "web",
        state: "results",
        path: "original.png",
      },
    ],
  };
  change(manifest);
  await fs.writeFile(path.join(directory, "original.png"), png);
  await fs.writeFile(
    path.join(directory, "run.log"),
    "Original command receipt\n",
  );
  const manifestPath = path.join(directory, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  return { directory, manifestPath, outputDir: path.join(directory, "report") };
}

test("preserves originals/receipts and separates blocked coverage from unreviewed screenshots", async (t) => {
  const options = await fixture(t);
  const input = await fs.readFile(options.manifestPath);
  const result = await buildReport(options);
  assert.equal(result.declaredRequiredVerdict, "BLOCKED");
  assert.equal(result.reviews.NOT_REVIEWED, 1);
  assert.deepEqual(
    await fs.readFile(path.join(options.outputDir, "originals/search.png")),
    png,
  );
  assert.deepEqual(
    await fs.readFile(path.join(options.directory, "original.png")),
    png,
  );
  assert.deepEqual(await fs.readFile(options.manifestPath), input);
  const html = await fs.readFile(
    path.join(options.outputDir, "index.html"),
    "utf8",
  );
  assert.ok(!html.includes("<script>bad()"));
  assert.ok(html.includes("&lt;script&gt;bad()"));
  assert.ok(html.includes(`data:image/png;base64,${png.toString("base64")}`));
  const hashes = JSON.parse(
    await fs.readFile(path.join(options.outputDir, "hashes.json"), "utf8"),
  );
  assert.equal(hashes.inputSha256, sha(input));
  assert.equal(hashes.copies[0].sha256, sha(png));
  assert.equal(
    await fs.readFile(path.join(options.outputDir, "receipts/web.log"), "utf8"),
    "Original command receipt\n",
  );
});

test("rejects an existing output without changing its contents", async (t) => {
  const options = await fixture(t);
  await fs.mkdir(options.outputDir);
  await fs.writeFile(path.join(options.outputDir, "keep.txt"), "frozen");
  await assert.rejects(buildReport(options), { code: "EEXIST" });
  assert.deepEqual(await fs.readdir(options.outputDir), ["keep.txt"]);
  assert.equal(
    await fs.readFile(path.join(options.outputDir, "keep.txt"), "utf8"),
    "frozen",
  );
});

test("missing capture fails before creating a report", async (t) => {
  const options = await fixture(t, (manifest) => {
    manifest.screenshots[0].path = "missing.png";
  });
  await assert.rejects(buildReport(options), { code: "ENOENT" });
  await assert.rejects(fs.stat(options.outputDir), { code: "ENOENT" });
});

test("rejects renderer misattribution and a contradictory passing command", async (t) => {
  const mixed = await fixture(t, (manifest) => {
    manifest.screenshots[0].renderer = "ios-native";
  });
  await assert.rejects(buildReport(mixed), /caseId\/renderer mismatch/);
  const failed = await fixture(t, (manifest) => {
    manifest.cases[0].exitCode = 1;
  });
  await assert.rejects(buildReport(failed), /PASS conflicts/);
});

test("an image inventory alone cannot produce passing required acceptance", async (t) => {
  const options = await fixture(t, (manifest) => {
    manifest.cases = [];
    delete manifest.screenshots[0].caseId;
  });
  assert.equal((await buildReport(options)).declaredRequiredVerdict, "UNRUN");
});
