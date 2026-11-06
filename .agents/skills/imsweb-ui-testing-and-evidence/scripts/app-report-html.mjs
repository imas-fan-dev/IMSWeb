import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { appGroups } from "./app-report-model.mjs";
import { webGroups, webTargets } from "./web-report-model.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export async function appReportHtml(manifest, images, coverage) {
  const require = createRequire(path.resolve(directory, "../../../../apps/web/package.json"));
  const iconDir = path.resolve(path.dirname(require.resolve("lucide-react")), "../esm/icons");
  const icons = {};
  for (const name of ["house", "users", "map", "book-open", "user-round", "layout-grid", "search", "download", "chevron-right", "chevron-left", "arrow-up-right", "x", "circle-check", "circle", "circle-alert", "smartphone", "monitor", "file-text", "info", "sun", "moon", "maximize-2", "image", "layers"]) {
    const { __iconNode } = await import(pathToFileURL(path.join(iconDir, `${name}.mjs`)).href);
    icons[name] = __iconNode.map(([tag, attributes]) => `<${tag} ${Object.entries(attributes).filter(([key]) => key !== "key").map(([key, value]) => `${key}="${escapeHtml(value)}"`).join(" ")} />`).join("");
  }
  const combined = Boolean(manifest.app && manifest.web);
  const surfaceData = (scope, surface) => {
    const web = scope === 'web';
    const targets = web ? webTargets : [{ id: 'ios', label: 'iOS', renderer: 'ios-native' }, { id: 'android', label: 'Android', renderer: 'android-native' }];
    const pictures = images.filter(image => !combined || image.scope === scope).map(({ bytes, base64, ...image }) => ({ ...image, asset: image.asset || `data:image/png;base64,${base64}`, original: image.path, page: image.pageId, provenance: image.renderer.endsWith('-native') ? 'native' : web && targets.some(t => t.renderer === image.renderer) ? 'web' : 'reference' }));
    return {
      version: 1, mode: web ? 'web-acceptance' : 'app-acceptance', title: manifest.title, targets, domPolicy: 'inert-allowlist',
      groups: web ? webGroups : appGroups, pages: surface.inventory.pages, inventoryCommit: surface.inventory.source.commit,
      routeCount: surface.inventory.routeCount, normalization: surface.inventory.normalization,
      inventorySource: surface.inventory.routeSource, source: surface.inventory.source, coverage: combined ? coverage[scope] : coverage,
      reports: Object.fromEntries(targets.map(target => [target.id, { screenshots: pictures.filter(image => image.renderer === target.renderer), runs: surface.runs.filter(run => run.renderer === target.renderer) }])),
      runs: surface.runs, cases: manifest.cases.filter(item => !combined || item.scope === scope), references: pictures.filter(image => image.provenance === 'reference'), icons,
      unassociated: pictures.filter(image => !image.pageId).length,
    };
  };
  const data = combined ? { version: 2, mode: 'combined-acceptance', title: manifest.title, scopes: { app: surfaceData('app', manifest.app), web: surfaceData('web', manifest.web) } } : surfaceData(manifest.web ? 'web' : 'app', manifest.web || manifest.app);
  const templates = path.resolve(directory, "../templates");
  const [html, css, client, font, iconLicense, fontLicense] = await Promise.all([
    fs.readFile(path.join(templates, "app-report.html"), "utf8"),
    fs.readFile(path.join(templates, "app-report.css"), "utf8"),
    fs.readFile(path.join(templates, "app-report-client.js"), "utf8"),
    fs.readFile(path.join(path.dirname(require.resolve("@fontsource-variable/geist")), "files/geist-latin-wght-normal.woff2")),
    fs.readFile(path.resolve(iconDir, "../../../LICENSE"), "utf8"),
    fs.readFile(path.join(path.dirname(require.resolve("@fontsource-variable/geist")), "LICENSE"), "utf8"),
  ]);
  // JSON is script data; escaping HTML alone is insufficient for </script>.
  const json = JSON.stringify(data).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
  let layout = !combined && manifest.web ? html.replaceAll('App', 'Web').replaceAll('APP ACCEPTANCE', 'WEB ACCEPTANCE').replaceAll('iOS 与 Android', '桌面与移动 Web').replaceAll('iOS 和 Android', '桌面和移动 Web').replaceAll('双平台', '双环境').replaceAll('原生', 'Web').replaceAll('源码 / 包绑定', '源码 / 浏览器环境').replaceAll('绑定回执', '原始执行回执').replace(/<div class="platform-switch"[^>]*>.*?<\/div>/, `<div class="platform-switch" role="group" aria-label="验收环境">${webTargets.map(t => `<button data-platform="${t.id}" aria-pressed="${t.id === 'desktop'}"><span data-icon="${t.id === 'desktop' ? 'monitor' : 'smartphone'}"></span><span>${t.label}</span></button>`).join('')}</div>`) : html;
  if (combined) layout = layout
    .replace('<div class="platform-row">', '<div class="scope-tabs" role="tablist" aria-label="验收类型"><button role="tab" id="scope-app" data-scope="app" aria-controls="report-workspace" aria-selected="true" tabindex="0">移动端</button><button role="tab" id="scope-web" data-scope="web" aria-controls="report-workspace" aria-selected="false" tabindex="-1">Web</button></div><section id="report-workspace" role="tabpanel" aria-labelledby="scope-app"><div class="platform-row">')
    .replace('<footer class="page-footer">', '</section><footer class="page-footer">')
    .replace('<h1>App 页面验收</h1>', '<h1>页面验收</h1>')
    .replace('IMSWeb / APP ACCEPTANCE', 'IMSWeb / PAGE ACCEPTANCE')
    .replace('App 验收工作台', '页面验收工作台')
    .replace('App 验收报告', 'Web / 移动端验收报告');
  return layout.replace('<link rel="stylesheet" href="style.css">', () => `<style>${css.replace("assets/geist.woff2", () => `data:font/woff2;base64,${font.toString("base64")}`)}</style>`)
    .replace('<script src="dataset.js" defer></script>', () => `<script>window.REPORT_DATA=${json};</script>`)
    .replace('<script src="app.js" defer></script>', () => `<script>${client}</script>`)
    .replace("<title>App 页面验收 · IMSWeb</title>", () => `<title>${escapeHtml(manifest.title)}</title>`)
    .replace("</body>", () => `<template id="asset-licenses">Lucide Icons\n${escapeHtml(iconLicense)}\nGeist Font\n${escapeHtml(fontLicense)}</template></body>`);
}
