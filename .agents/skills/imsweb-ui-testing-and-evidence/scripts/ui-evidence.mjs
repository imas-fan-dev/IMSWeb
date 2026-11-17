import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { json, parseJSON, save, sha256 } from './native-capture.mjs';
import { validateApp } from './app-report-model.mjs';
import { validateWeb } from './web-report-model.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function original(base, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw Error('Capture artifact must have a relative path');
  const file = await fs.realpath(path.resolve(base, relative)), root = await fs.realpath(base);
  if (!file.startsWith(root + path.sep)) throw Error('Capture artifact escapes its directory');
  return file;
}

export async function collectEvidence({ captures, outputDir }) {
  if (!captures?.length) throw Error('At least one capture.json is required');
  const sources = await Promise.all(captures.map(async file => ({ file: path.resolve(file), bytes: await fs.readFile(file), data: await json(file) })));
  const inventory = sources[0].data.inventory;
  const scope = sources[0].data.scope || 'app';
  for (const { data } of sources) if (data.version !== 1 || JSON.stringify(data.inventory) !== JSON.stringify(inventory) || !Array.isArray(data.cases) || !Array.isArray(data.screenshots) || !Array.isArray(data.runs)) throw Error('Captures must share the exact frozen inventory and source');
  if (sources.some(s => (s.data.scope || 'app') !== scope)) throw Error('Web and App inventories must be collected separately');
  const manifest = { title: scope === 'web' ? 'IMSWeb Web 页面与响应式布局验收' : 'IMSWeb App 自动截图验收', createdAt: new Date().toISOString(), source: inventory.source, [scope]: { inventory, runs: [] }, cases: [], screenshots: [], environment: { workflow: '脚本批量执行和归并；LLM后续复核。未审截图不自动形成视觉验收PASS。' } };
  const surface = manifest[scope];
  const ids = new Set();
  for (const { data } of sources) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(data.id || '') || ids.has(data.id)) throw Error('Duplicate/invalid capture ID');
    ids.add(data.id);
    surface.runs.push(...structuredClone(data.runs)); manifest.cases.push(...structuredClone(data.cases)); manifest.screenshots.push(...structuredClone(data.screenshots));
  }
  if (new Set(manifest.cases.map(c => c.id)).size !== manifest.cases.length || new Set(manifest.screenshots.map(c => c.id)).size !== manifest.screenshots.length) throw Error('Duplicate case/image IDs');
  (scope === 'web' ? validateWeb : validateApp)(surface, manifest.cases, manifest.screenshots);
  const output = path.resolve(outputDir);
  if (sources.some(s => output === path.dirname(s.file) || output.startsWith(path.dirname(s.file) + path.sep))) throw Error('Collection output must be outside capture inputs');
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.mkdir(output);
  const audit = [];
  // Keep every attempt, including failures. Never pick a latest PASS to erase a failure.
  for (const source of sources) {
    const base = path.dirname(source.file), prefix = 'captures/' + source.data.id;
    for (const [kind, entries, key] of [['cases', source.data.cases, 'receipt'], ['runs', source.data.runs, 'binding'], ['screenshots', source.data.screenshots, 'path']]) {
      for (const entry of entries) {
        if (!entry[key]) continue;
        const file = await original(base, entry[key]), bytes = await fs.readFile(file);
        if (kind === 'screenshots' && sha256(bytes) !== entry.sha256) throw Error('Capture image hash changed: ' + entry.id);
        const copy = prefix + '/' + entry[key].split(path.sep).join('/');
        await fs.mkdir(path.dirname(path.join(output, copy)), { recursive: true });
        await fs.writeFile(path.join(output, copy), bytes, { flag: 'wx' });
        const list = kind === 'runs' ? surface.runs : manifest[kind];
        list.find(e => e.id === entry.id)[key] = copy;
      }
    }
    const copy = prefix + '/capture.json'; await fs.mkdir(path.dirname(path.join(output, copy)), { recursive: true });
    await fs.writeFile(path.join(output, copy), source.bytes, { flag: 'wx' });
    audit.push({ source: source.file, sha256: sha256(source.bytes), copy, host: source.data.host, finishedAt: source.data.finishedAt || null });
    // Copy logs, rendered flows and JUnit alongside receipts without following symlinks.
    for (const target of new Set(source.data.cases.map(c => c.receipt.split('/')[0]))) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(target)) throw Error('Invalid capture target directory');
      await fs.cp(await original(base, target), path.join(output, prefix, target), { recursive: true, filter: async file => {
        const stat = await fs.lstat(file);
        if (stat.isSymbolicLink()) return false;
        return stat.isDirectory() || !await fs.stat(path.join(output, prefix, path.relative(base, file))).then(() => true, () => false);
      } });
    }
  }
  await save(path.join(output, 'manifest.json'), manifest); await save(path.join(output, 'collection.json'), { sources: audit, attemptsPreserved: manifest.cases.length });
  await createReviewQueue(path.join(output, 'manifest.json'));
  return { manifestPath: path.join(output, 'manifest.json'), cases: manifest.cases.length, screenshots: manifest.screenshots.length };
}

export async function createReviewQueue(manifestPath) {
  const bytes = await fs.readFile(manifestPath), manifest = parseJSON(bytes, 'Review manifest'), base = path.dirname(manifestPath);
  const images = [];
  for (const image of manifest.screenshots.filter(i => i.review !== 'PASS' && i.review !== 'REWORK')) {
    const file = path.resolve(base, image.path), data = await fs.readFile(file), owner = manifest.cases.find(c => c.id === image.caseId);
    images.push({ id: image.id, path: image.path, sha256: sha256(data), caseId: image.caseId, pageId: image.pageId, scenarioId: image.scenarioId, renderer: image.renderer, execution: owner?.verdict || 'UNRUN', priority: owner?.verdict === 'PASS' ? 'visual-review' : 'failure', title: image.title });
  }
  images.sort((a, b) => Number(b.priority === 'failure') - Number(a.priority === 'failure'));
  const queue = { version: 1, manifestSha256: sha256(bytes), instructions: '先复核失败与缺口，再批量检查未审图。只补图像说明/问题和独立视觉审阅；不改执行、退出码、源码或绑定。仅文字推断时保持NOT_REVIEWED。', attention: manifest.cases.filter(c => c.verdict !== 'PASS').map(c => ({ id: c.id, verdict: c.verdict, reason: c.reason, receipt: c.receipt })), images };
  await save(path.join(base, 'review-queue.json'), queue);
  const example = { version: 1, manifestSha256: queue.manifestSha256, reviewer: { id: '实际审阅者', model: '实际模型或human', method: 'direct-image-review' }, images: images.slice(0, 1).map(i => ({ id: i.id, sha256: i.sha256, review: 'NOT_REVIEWED', note: '直接看图后填写说明与问题' })), notes: [] };
  await fs.writeFile(path.join(base, 'review-request.md'), `# 后续 LLM 复核\n\n先读取 review-queue.json 中的 attention。分批直接打开图片，按页面/场景补说明；未查看原图的记录保持 NOT_REVIEWED。不能把 fixture 写成真实服务，也不能补造触控/提交结果。\n\n输出 JSON，格式如下；只包含实际完成的审阅，可分批导入。notes 可使用 {"caseId":"现有ID","text":"补充说明"}。失败执行不因视觉审阅通过而变绿。\n\n\`\`\`json\n${JSON.stringify(example, null, 2)}\n\`\`\`\n`, { flag: 'wx' });
  const gallery = images.map(i => {
    const asset = path.isAbsolute(i.path) ? 'report/originals/' + i.id + '.png' : i.path;
    return `<figure><a href="${esc(asset)}"><img loading="lazy" src="${esc(asset)}" alt="${esc(i.title)}"></a><figcaption><b>${esc(i.execution)} · ${esc(i.title)}</b><p>${esc(i.pageId)} / ${esc(i.scenarioId)}</p><code>${esc(i.id)}</code></figcaption></figure>`;
  }).join('');
  await fs.writeFile(path.join(base, 'review-gallery.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>待审截图证据</title><style>body{font:14px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px}figure{margin:0;min-width:0}img{width:100%;height:430px;object-fit:contain}code,p{overflow-wrap:anywhere}</style><h1>待审证据 · ${images.length}</h1><p>先列失败，不代表图片已通过。点击原图审阅；填写 review-request.md 所列JSON。</p><main>${gallery}</main></html>`, { flag: 'wx' });
  return queue;
}

export async function applyReviews({ manifestPath, annotationsPath, outputDir }) {
  const bytes = await fs.readFile(manifestPath), manifest = parseJSON(bytes, 'Review manifest'), annotationBytes = await fs.readFile(annotationsPath), annotation = parseJSON(annotationBytes, 'Review annotations');
  if (annotation.version !== 1 || annotation.manifestSha256 !== sha256(bytes) || !annotation.reviewer?.id?.trim() || !annotation.reviewer.model?.trim() || !['direct-image-review', 'text-only'].includes(annotation.reviewer.method) || !Array.isArray(annotation.images) || !Array.isArray(annotation.notes)) throw Error('Review requires the exact manifest hash, reviewer/model/method, images and notes');
  if (Object.keys(annotation).some(k => !['version', 'manifestSha256', 'reviewer', 'images', 'notes'].includes(k))) throw Error('Review may only annotate images and notes');
  const seen = new Set(), reviewId = 'review-' + randomUUID().slice(0, 8), base = path.dirname(path.resolve(manifestPath));
  for (const review of annotation.images) {
    if (seen.has(review.id) || Object.keys(review).some(k => !['id', 'sha256', 'review', 'note'].includes(k))) throw Error('Duplicate image review or unsupported fields');
    seen.add(review.id);
    const image = manifest.screenshots.find(i => i.id === review.id);
    if (!image || !['PASS', 'REWORK', 'NOT_REVIEWED'].includes(review.review) || !review.note?.trim() || sha256(await fs.readFile(path.resolve(base, image.path))) !== review.sha256) throw Error('Invalid review or stale image: ' + review.id);
    if (annotation.reviewer.method !== 'direct-image-review' && review.review !== 'NOT_REVIEWED') throw Error('Text-only annotations cannot visually approve/reject images');
    if (image.review === 'REWORK' && review.review !== 'REWORK') throw Error('Preserve rejected evidence; capture a new image for a corrected result');
    image.reviewHistory = [...(image.reviewHistory || []), { reviewId, previous: image.review, review: review.review, note: review.note, reviewer: annotation.reviewer, sha256: review.sha256, at: new Date().toISOString() }];
    image.captureNote ??= image.note; image.review = review.review; image.note = review.note;
  }
  for (const note of annotation.notes) {
    const owner = manifest.cases.find(c => c.id === note.caseId);
    if (!owner || !note.text?.trim() || Object.keys(note).some(k => !['caseId', 'text'].includes(k))) throw Error('Invalid case annotation');
    owner.annotations = [...(owner.annotations || []), { reviewId, text: note.text, reviewer: annotation.reviewer }];
  }
  for (const image of manifest.screenshots) image.path = path.resolve(base, image.path);
  for (const item of manifest.cases) if (item.receipt) item.receipt = path.resolve(base, item.receipt);
  for (const surface of [manifest.app, manifest.web].filter(Boolean)) for (const run of surface.runs) if (run.binding) run.binding = path.resolve(base, run.binding);
  const output = path.resolve(outputDir); await fs.mkdir(path.dirname(output), { recursive: true }); await fs.mkdir(output);
  await fs.writeFile(path.join(output, 'annotations.json'), annotationBytes, { flag: 'wx' });
  await save(path.join(output, 'manifest.json'), manifest); await createReviewQueue(path.join(output, 'manifest.json'));
  return { manifestPath: path.join(output, 'manifest.json'), reviewed: annotation.images.length, notes: annotation.notes.length };
}
