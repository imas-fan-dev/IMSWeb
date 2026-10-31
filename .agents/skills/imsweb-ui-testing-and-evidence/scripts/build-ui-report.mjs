import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const renderers = ["web", "app-dom", "ios-native", "android-native"];
const verdicts = ["PASS", "REWORK", "BLOCKED", "UNRUN"];
const reviews = ["PASS", "REWORK", "NOT_REVIEWED"];
const kinds = ["runtime", "diagnostic", "reference"];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const escape = (value) =>
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

function gallery(title, cases, images, summary) {
  const filters = ["renderer", "state", "kind", "review"];
  const select = filters
    .map(
      (field) =>
        `<label>${field} <select data-filter="${field}"><option value="">全部</option>${[...new Set(images.map((image) => image[field]))].map((value) => `<option>${escape(value)}</option>`).join("")}</select></label>`,
    )
    .join("");
  const figures = images
    .map(
      (
        image,
      ) => `<figure ${filters.map((field) => `data-${field}="${escape(image[field])}"`).join(" ")}>
    <button class="enlarge" aria-label="放大 ${escape(image.title)}"><img loading="lazy" src="data:image/png;base64,${image.base64}" alt="${escape(image.title)}"></button>
    <figcaption><strong>${escape(image.title)}</strong><p>${escape(image.renderer)} · ${escape(image.state)} · ${escape(image.kind)} · 审图 ${escape(image.review)}</p><p>${escape(image.note)}</p><small>${image.width} × ${image.height} · ${image.sha256}</small><p><a download="${image.id}.png" href="data:image/png;base64,${image.base64}">下载原图</a></p></figcaption></figure>`,
    )
    .join("");
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title>
    <style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#edf1f5;color:#243142;font:15px system-ui,sans-serif}h1{font-size:26px}p{line-height:1.5;overflow-wrap:anywhere}header,section{max-width:1480px;margin:auto}fieldset{display:flex;flex-wrap:wrap;gap:16px;border:0;padding:16px 0}select{max-width:100%;padding:8px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #ccd5df;padding:10px;text-align:left;overflow-wrap:anywhere}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:20px;margin-top:24px}figure{margin:0;padding:14px;border-radius:12px;background:white;min-width:0}figure[hidden]{display:none}.enlarge{display:block;border:0;background:#f4f8fa;width:100%;cursor:zoom-in;padding:0}.enlarge img{display:block;width:100%;height:500px;object-fit:contain}figcaption{padding-top:14px}small{display:block;overflow-wrap:anywhere;color:#536578}dialog{border:0;padding:10px;max-width:96vw;max-height:96vh;border-radius:12px}dialog::backdrop{background:#101c2de0}dialog img{display:block;max-width:90vw;max-height:85vh}#close{margin-bottom:8px}a{color:#285775}@media(max-width:500px){body{padding:14px}h1{font-size:22px}td,th{padding:6px;font-size:11px}}</style>
    <header><h1>${escape(title)}</h1><p>清单内必需用例：${summary.declaredRequiredVerdict}。仅汇总声明的范围；图片数量不代表测试覆盖，命令通过不代表已审图。</p><p>必需 ${escape(JSON.stringify(summary.required))}；补测 ${escape(JSON.stringify(summary.supplemental))}</p><table><thead><tr><th>用例 / renderer</th><th>验收 / 退出码</th><th>范围 / 回执</th></tr></thead><tbody>${cases.map((item) => `<tr><td>${escape(item.title)}<br>${escape(item.renderer)}</td><td>${escape(item.verdict)} / ${escape(item.exitCode ?? "未知")}<br>${item.required === false ? "补测" : "必需"}</td><td>${escape(item.reason)}<br>${escape(item.command)}${item.receiptCopy ? `<br><a href="${item.receiptCopy}">命令回执</a>` : ""}</td></tr>`).join("")}</tbody></table><fieldset>${select}</fieldset><p id="count" aria-live="polite"></p></header>
    <section>${figures}</section><dialog><button id="close">关闭</button><img alt=""></dialog>
    <script>const figures=[...document.querySelectorAll('figure')],filters=[...document.querySelectorAll('[data-filter]')],count=document.querySelector('#count');function filter(){let visible=0;for(const figure of figures){figure.hidden=filters.some(input=>input.value&&figure.dataset[input.dataset.filter]!==input.value);if(!figure.hidden)visible++}count.textContent='显示 '+visible+' / '+figures.length+' 张原图'}filters.forEach(input=>input.addEventListener('change',filter));filter();const dialog=document.querySelector('dialog'),large=dialog.querySelector('img');document.querySelectorAll('.enlarge').forEach(button=>button.addEventListener('click',()=>{large.src=button.querySelector('img').src;large.alt=button.querySelector('img').alt;dialog.showModal()}));document.querySelector('#close').addEventListener('click',()=>dialog.close());</script></html>`;
}

export async function buildReport({
  manifestPath,
  outputDir,
  overview = false,
}) {
  const input = await fs.readFile(manifestPath);
  const manifest = JSON.parse(input.toString("utf8"));
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
  const directory = path.dirname(path.resolve(manifestPath));
  const receipts = [];
  for (const item of cases) {
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
      base64: bytes.toString("base64"),
      copy: `originals/${image.id}.png`,
    });
  }
  const selected = images.filter((item) => item.overview === true);
  check(
    selected.length <= 12,
    "Select at most 12 overview images; all images remain in the gallery",
  );
  const summary = {
    ...summarize(cases),
    screenshots: images.length,
    reviews: count(images, "review", reviews),
  };
  // No recursive mkdir here: an existing output must never be overwritten.
  const destination = path.resolve(outputDir);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.mkdir(destination);
  await fs.mkdir(path.join(destination, "originals"));
  await fs.mkdir(path.join(destination, "receipts"));
  for (const asset of [...images, ...receipts])
    await fs.writeFile(path.join(destination, asset.copy), asset.bytes);
  await fs.writeFile(path.join(destination, "manifest.json"), input);
  await fs.writeFile(
    path.join(destination, "index.html"),
    gallery(manifest.title, cases, images, summary),
  );
  const rows = cases.map(
    (item) =>
      `| ${md(item.title)} | ${item.renderer} | ${item.required === false ? "补测" : "必需"} | ${item.verdict} | ${item.exitCode ?? "未知"} | ${md(item.reason)} | ${md(item.command)} | ${item.receiptCopy ? `[回执](${item.receiptCopy})` : "未提供"} |`,
  );
  await fs.writeFile(
    path.join(destination, "results.md"),
    `# ${md(manifest.title)}\n\n清单内必需用例：${summary.declaredRequiredVerdict}。只汇总已声明范围，不推断全产品验收。\n\n必需：${JSON.stringify(summary.required)}\n\n补测：${JSON.stringify(summary.supplemental)}\n\n图片：${images.length}；审图：${JSON.stringify(summary.reviews)}\n\n| 用例 | Renderer | 范围 | 验收 | 退出码 | 原因 | 命令 | 回执 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n\n[完整图册](index.html) · [输入与来源](manifest.json) · [文件摘要](hashes.json)\n`,
  );
  const artifacts = ["manifest.json", "index.html", "results.md"];
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
        `<html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#edf1f5;font:20px system-ui,sans-serif;color:#243142}main{padding:28px}h1{margin:0 0 12px;font-size:32px}p{margin:0 0 20px}section{display:grid;grid-template-columns:repeat(${Math.min(4, selected.length)},1fr);gap:20px}figure{margin:0;background:white;padding:16px;border-radius:16px;min-width:0}h2{font-size:22px;overflow-wrap:anywhere}small{display:block;font-size:16px;overflow-wrap:anywhere;margin-bottom:12px}img{width:100%;height:850px;object-fit:contain;display:block}</style><main><h1>${escape(manifest.title)}</h1><p>选图 ${selected.length} / ${images.length}；全部原图与用例状态见图册。此图是证据排版。</p><section>${selected.map((item) => `<figure><h2>${escape(item.title)}</h2><small>${escape(item.renderer)} · ${escape(item.kind)} · ${escape(item.state)} · 审图 ${escape(item.review)}</small><img src="data:image/png;base64,${item.base64}" alt="${escape(item.title)}"></figure>`).join("")}</section></main></html>`,
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
        "build-ui-report.mjs --manifest <JSON> --output <new-directory> [--overview]",
      );
    } else {
      const options = {};
      for (let index = 0; index < args.length; index++) {
        if (args[index] === "--overview") options.overview = true;
        else if (["--manifest", "--output"].includes(args[index])) {
          const flag = args[index],
            value = args[++index];
          check(value && !value.startsWith("--"), `${flag} requires a value`);
          options[flag === "--manifest" ? "manifestPath" : "outputDir"] = value;
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
