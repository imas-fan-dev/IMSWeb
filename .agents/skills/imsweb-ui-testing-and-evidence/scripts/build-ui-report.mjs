import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateApp, buildAppCoverage, appMarkdown } from "./app-report-model.mjs";
import { appReportHtml } from "./app-report-html.mjs";
import { evidenceGallery } from "./evidence-gallery.mjs";
import { validateWeb, buildWebCoverage, webMarkdown } from "./web-report-model.mjs";
import { parseJSON } from './native-capture.mjs';

const renderers = ["web", "web-desktop", "web-mobile", "app-dom", "ios-native", "android-native"];
const verdicts = ["PASS", "REWORK", "BLOCKED", "UNRUN"];
const reviews = ["PASS", "REWORK", "NOT_REVIEWED"];
const kinds = ["runtime", "diagnostic", "reference"];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
const md = (value) => String(value ?? "").replace(/[\r\n|]/g, " ");

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function identify(items, label) {
  const ids = new Set();
  for (const item of items) {
    check(item && /^[a-z0-9][a-z0-9-]*$/.test(item.id), `${label}: invalid id`);
    check(!ids.has(item.id), `${label}: duplicate id ${item.id}`);
    ids.add(item.id);
    check(
      typeof item.title === "string" && item.title.trim(),
      `${item.id}: title required`,
    );
    check(renderers.includes(item.renderer), `${item.id}: invalid renderer`);
  }
}

const count = (items, field, values) =>
  Object.fromEntries(
    values.map((value) => [
      value,
      items.filter((item) => item[field] === value).length,
    ]),
  );

function summarize(cases) {
  const required = cases.filter((item) => item.required !== false);
  return {
    // This aggregates only declared cases, not whole-product acceptance.
    declaredRequiredVerdict: !required.length
      ? "UNRUN"
      : (["REWORK", "BLOCKED", "UNRUN"].find((value) =>
          required.some((item) => item.verdict === value),
        ) ?? "PASS"),
    required: count(required, "verdict", verdicts),
    supplemental: count(
      cases.filter((item) => item.required === false),
      "verdict",
      verdicts,
    ),
  };
}

async function reportInput(manifestPath) {
  if (!Array.isArray(manifestPath)) {
    const input = await fs.readFile(manifestPath);
    return { input, manifest: parseJSON(input, 'Report manifest'), directory: path.dirname(path.resolve(manifestPath)), inputs: [] };
  }
  check(manifestPath.length === 2, 'Combined report requires one App and one Web manifest');
  const manifest = { title: 'IMSWeb 页面验收', cases: [], screenshots: [], inputs: [] }, inputs = [];
  for (const file of manifestPath) {
    const bytes = await fs.readFile(file), source = parseJSON(bytes, 'Report manifest');
    check(Boolean(source.app) !== Boolean(source.web), 'Each input must contain exactly one App or Web inventory');
    check(Array.isArray(source.cases) && Array.isArray(source.screenshots), 'cases and screenshots arrays required');
    const scope = source.app ? 'app' : 'web', base = path.dirname(path.resolve(file));
    check(!manifest[scope], `Duplicate ${scope} manifest`);
    manifest[scope] = structuredClone(source[scope]);
    for (const run of manifest[scope].runs) if (run.binding) run.binding = path.resolve(base, run.binding);
    for (const item of source.cases) manifest.cases.push({ ...item, scope, ...(item.receipt ? { receipt: path.resolve(base, item.receipt) } : {}) });
    for (const image of source.screenshots) manifest.screenshots.push({ ...image, scope, path: path.resolve(base, image.path) });
    manifest.inputs.push({ scope, source: path.resolve(file), sha256: sha(bytes), copy: `receipts/input-${scope}.json` });
    inputs.push({ source: path.resolve(file), copy: `receipts/input-${scope}.json`, bytes, sha256: sha(bytes) });
  }
  return { input: Buffer.from(JSON.stringify(manifest, null, 2) + '\n'), manifest, directory: process.cwd(), inputs };
}

export async function buildReport({
  manifestPath,
  outputDir,
  overview = false,
  assetMode = "embedded",
}) {
  check(["embedded", "directory"].includes(assetMode), "assetMode must be embedded or directory");
  const { input, manifest, directory, inputs } = await reportInput(manifestPath);
  check(
    manifest &&
      Array.isArray(manifest.cases) &&
      Array.isArray(manifest.screenshots),
    "cases and screenshots arrays required",
  );
  check(
    typeof manifest.title === "string" && manifest.title.trim(),
    "title required",
  );
  identify(manifest.cases, "cases");
  identify(manifest.screenshots, "screenshots");
  const cases = manifest.cases.map((item) => ({ ...item }));
  const receipts = [...inputs];
  const combined = Boolean(manifest.app && manifest.web);
  const scopeFor = item => item.scope || (['web-desktop', 'web-mobile'].includes(item.renderer) ? 'web' : 'app');
  if (combined) for (const item of cases) {
    item.scope = scopeFor(item);
    check(['app', 'web'].includes(item.scope), `${item.id}: invalid report scope`);
  }
  for (const item of cases) {
    delete item.receiptCopy;
    check(verdicts.includes(item.verdict), `${item.id}: invalid verdict`);
    check(
      item.exitCode == null || Number.isInteger(item.exitCode),
      `${item.id}: invalid exitCode`,
    );
    check(
      item.verdict !== "PASS" || item.exitCode == null || item.exitCode === 0,
      `${item.id}: PASS conflicts with nonzero exitCode`,
    );
    check(
      item.verdict === "PASS" ||
        (typeof item.reason === "string" && item.reason.trim()),
      `${item.id}: non-PASS reason required`,
    );
    if (item.receipt) {
      const bytes = await fs.readFile(path.resolve(directory, item.receipt));
      item.receiptCopy = `receipts/${item.id}.log`;
      receipts.push({
        source: item.receipt,
        copy: item.receiptCopy,
        bytes,
        sha256: sha(bytes),
      });
    }
  }
  const images = [];
  for (const item of manifest.screenshots) {
    const image = { kind: "runtime", review: "NOT_REVIEWED", ...item };
    check(
      kinds.includes(image.kind) && reviews.includes(image.review),
      `${item.id}: invalid kind/review`,
    );
    check(
      typeof image.state === "string" && image.state.trim(),
      `${item.id}: state required`,
    );
    const owner = cases.find((candidate) => candidate.id === image.caseId);
    if (combined) {
      check(!image.scope || !owner || image.scope === owner.scope, `${image.id}: case/scope mismatch`);
      image.scope = owner?.scope || scopeFor(image);
      check(['app', 'web'].includes(image.scope), `${image.id}: invalid report scope`);
    }
    check(
      !image.caseId || owner?.renderer === image.renderer,
      `${item.id}: caseId/renderer mismatch`,
    );
    check(
      typeof image.path === "string" && image.path,
      `${item.id}: PNG path required`,
    );
    const bytes = await fs.readFile(path.resolve(directory, image.path));
    check(
      bytes.length >= 24 &&
        bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
      `${item.id}: expected PNG`,
    );
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    check(width > 0 && height > 0, `${item.id}: invalid PNG dimensions`);
    images.push({
      ...image,
      bytes,
      width,
      height,
      sha256: sha(bytes),
      base64: assetMode === "embedded" || image.overview === true ? bytes.toString("base64") : undefined,
      asset: assetMode === "directory" ? `originals/${image.id}.png` : `data:image/png;base64,${bytes.toString("base64")}`,
      copy: `originals/${image.id}.png`,
    });
  }
  const selected = images.filter((item) => item.overview === true);
  check(
    selected.length <= 12,
    "Select at most 12 overview images; all images remain in the gallery",
  );
  const scoped = (items, scope) => combined ? items.filter(item => item.scope === scope) : items;
  const app = manifest.app || !manifest.web ? validateApp(manifest.app, scoped(cases, 'app'), scoped(images, 'app')) : null;
  const web = manifest.web ? validateWeb(manifest.web, scoped(cases, 'web'), scoped(images, 'web')) : null;
  const surfaces = Object.entries({ app, web }).filter(([, surface]) => surface);
  const hasInventory = surfaces.length > 0;
  for (const [scope, surface] of surfaces) for (const run of surface.runs) {
    // bindingCopy is computed from an actual read, never accepted from JSON.
    delete run.bindingCopy;
    if (!run.binding) continue;
    check(typeof run.binding === "string", `${run.id}: binding receipt path required`);
    const bytes = await fs.readFile(path.resolve(directory, run.binding));
    run.bindingCopy = `bindings/${combined ? scope + '/' : ''}${run.id}.log`;
    receipts.push({ source: run.binding, copy: run.bindingCopy, bytes, sha256: sha(bytes) });
  }
  const appCoverage = app ? buildAppCoverage(app, scoped(cases, 'app'), scoped(images, 'app')) : null;
  const webCoverage = web ? buildWebCoverage(web, scoped(cases, 'web'), scoped(images, 'web')) : null;
  const coverage = combined ? { version: 2, app: appCoverage, web: webCoverage } : appCoverage || webCoverage;
  const inventory = combined ? { version: 2, app: app.inventory, web: web.inventory } : (app || web)?.inventory;
  const coverageSummary = result => Object.fromEntries(Object.entries(result).map(([platform, value]) => [platform, { verdict: value.verdict, pages: value.pages.length, counts: value.counts }]));
  const summary = {
    assetMode,
    ...summarize(cases),
    screenshots: images.length,
    reviews: count(images, "review", reviews),
    ...(appCoverage ? { appCoverage: coverageSummary(appCoverage) } : {}),
    ...(webCoverage ? { webCoverage: coverageSummary(webCoverage) } : {}),
  };
  const evidenceHtml = await evidenceGallery(manifest.title, cases, images, summary);
  const html = hasInventory ? await appReportHtml({ ...manifest, cases }, images, coverage) : evidenceHtml;
  // No recursive mkdir here: an existing output must never be overwritten.
  const destination = path.resolve(outputDir);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.mkdir(destination);
  await fs.mkdir(path.join(destination, "originals"));
  await fs.mkdir(path.join(destination, "receipts"));
  if (hasInventory) await fs.mkdir(path.join(destination, "bindings"));
  for (const asset of [...images, ...receipts]) {
    await fs.mkdir(path.dirname(path.join(destination, asset.copy)), { recursive: true });
    await fs.writeFile(path.join(destination, asset.copy), asset.bytes);
  }
  await fs.writeFile(path.join(destination, "manifest.json"), input);
  await fs.writeFile(
    path.join(destination, "index.html"),
    html,
  );
  const rows = cases.map(
    (item) =>
      `| ${md(item.title)} | ${item.renderer} | ${item.required === false ? "补测" : "必需"} | ${item.verdict} | ${item.exitCode ?? "未知"} | ${md(item.reason)} | ${md(item.command)} | ${item.receiptCopy ? `[回执](${item.receiptCopy})` : "未提供"} |`,
  );
  await fs.writeFile(
    path.join(destination, "results.md"),
    `# ${md(manifest.title)}\n\n清单内必需用例：${summary.declaredRequiredVerdict}。只汇总已声明范围，不推断全产品验收。\n\n必需：${JSON.stringify(summary.required)}\n\n补测：${JSON.stringify(summary.supplemental)}\n\n图片：${images.length}；审图：${JSON.stringify(summary.reviews)}\n${app ? appMarkdown(app, appCoverage) : ""}${web ? webMarkdown(web, webCoverage) : ""}\n| 用例 | Renderer | 范围 | 验收 | 退出码 | 原因 | 命令 | 回执 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n\n[页面验收报告](index.html) · [输入与来源](manifest.json) · [文件摘要](hashes.json)${hasInventory ? " · [全部证据](evidence.html) · [页面覆盖](coverage.json) · [页面目录](inventory.json)" : ""}\n`,
  );
  const artifacts = ["manifest.json", "index.html", "results.md"];
  if (hasInventory) {
    for (const [name, content] of [["evidence.html", evidenceHtml], ["coverage.json", JSON.stringify(coverage, null, 2)], ["inventory.json", JSON.stringify(inventory, null, 2)]]) {
      await fs.writeFile(path.join(destination, name), content);
      artifacts.push(name);
    }
  }
  if (overview && selected.length) {
    // Use the owning workspace's installed package; never auto-install tooling.
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../..",
    );
    const { chromium } = createRequire(
      path.join(root, "apps/web/package.json"),
    )("@playwright/test");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1200 },
        deviceScaleFactor: 1,
      });
      await page.setContent(
        `<html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#edf1f5;font:20px system-ui,sans-serif;color:#243142}main{padding:28px}h1{margin:0 0 12px;font-size:32px}p{margin:0 0 20px}section{display:grid;grid-template-columns:repeat(${Math.min(4, selected.length)},1fr);gap:20px}figure{margin:0;background:white;padding:16px;border-radius:16px;min-width:0}h2{font-size:22px;overflow-wrap:anywhere}small{display:block;font-size:16px;overflow-wrap:anywhere;margin-bottom:12px}img{width:100%;height:850px;object-fit:contain;display:block}</style><main><h1>${escapeHtml(manifest.title)}</h1><p>选图 ${selected.length} / ${images.length}；全部原图与用例状态见图册。此图是证据排版。</p><section>${selected.map((item) => `<figure><h2>${escapeHtml(item.title)}</h2><small>${escapeHtml(item.renderer)} · ${escapeHtml(item.kind)} · ${escapeHtml(item.state)} · 审图 ${escapeHtml(item.review)}</small><img src="data:image/png;base64,${item.base64}" alt="${escapeHtml(item.title)}"></figure>`).join("")}</section></main></html>`,
      );
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => image.decode()));
      });
      await page.screenshot({
        path: path.join(destination, "overview.png"),
        fullPage: true,
      });
      artifacts.push("overview.png");
    } finally {
      await browser.close();
    }
  }
  const hashes = {
    inputSha256: sha(input),
    summary,
    copies: [
      ...images.map((item) => ({
        source: item.path,
        copy: item.copy,
        sha256: item.sha256,
      })),
      ...receipts.map(({ source, copy, sha256 }) => ({ source, copy, sha256 })),
    ],
    generated: Object.fromEntries(
      await Promise.all(
        artifacts.map(async (name) => [
          name,
          sha(await fs.readFile(path.join(destination, name))),
        ]),
      ),
    ),
  };
  await fs.writeFile(
    path.join(destination, "hashes.json"),
    `${JSON.stringify(hashes, null, 2)}\n`,
  );
  return { outputDir: destination, ...summary };
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const args = process.argv.slice(2);
    if (args.includes("--help")) {
      console.log(
        "build-ui-report.mjs --manifest <JSON> [--manifest <Web-or-App-JSON>] --output <new-directory> [--overview] [--asset-mode embedded|directory]",
      );
    } else {
      const options = {};
      for (let index = 0; index < args.length; index++) {
        if (args[index] === "--overview") options.overview = true;
        else if (["--manifest", "--output", "--asset-mode"].includes(args[index])) {
          const flag = args[index],
            value = args[++index];
          check(value && !value.startsWith("--"), `${flag} requires a value`);
          if (flag === '--manifest' && options.manifestPath) options.manifestPath = [...[options.manifestPath].flat(), value];
          else options[flag === "--manifest" ? "manifestPath" : flag === "--output" ? "outputDir" : "assetMode"] = value;
        } else throw new Error(`Unknown argument: ${args[index]}`);
      }
      check(
        options.manifestPath && options.outputDir,
        "--manifest and --output required",
      );
      console.log(JSON.stringify(await buildReport(options), null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
