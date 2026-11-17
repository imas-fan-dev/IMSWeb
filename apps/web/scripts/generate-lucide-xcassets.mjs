#!/usr/bin/env node
// Regenerates the iOS vector assets for the Lucide icons drawn by the native
// glass map controls. Each icon is a single universal PDF imageset so UIKit can
// load it with `UIImage(named:)` and tint it with `.alwaysTemplate`.
//
// Usage (from apps/web): node scripts/generate-lucide-xcassets.mjs
//
// Requirements: `rsvg-convert` on PATH and the workspace `lucide-react` version.
// `SOURCE_DATE_EPOCH` is pinned so a rerun produces byte-identical PDFs.
//
// The tab-bar icons in the same catalog (`house`, `users`, `map-pinned`,
// `book-open-text`, `circle-user`, `calendar-days`, `layout-grid`) were drawn
// with the same Lucide geometry and are intentionally left untouched: the root
// `src-tauri/build.rs` inventory owns their bundling, and rewriting them here
// would only add date churn.

import { execFileSync } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const catalogDirectory = path.resolve(
  scriptDirectory,
  "../src-tauri/plugins/native-glass/ios/Sources/Resources/Lucide.xcassets"
)

// Icon IDs match the `lucide-react` names and the `lucideIcon`/`icon` strings
// the Web side sends across the bridge.
const ICONS = [
  "menu",
  "x",
  "map",
  "list-filter",
  "building-2",
  "credit-card",
  "user-round",
  "info",
  "locate-fixed",
  "loader-circle",
  "refresh-cw",
]

const SVG_ATTRIBUTES = [
  ["xmlns", "http://www.w3.org/2000/svg"],
  ["width", "24"],
  ["height", "24"],
  ["viewBox", "0 0 24 24"],
  ["fill", "none"],
  ["stroke", "#000000"],
  ["stroke-width", "2"],
  ["stroke-linecap", "round"],
  ["stroke-linejoin", "round"],
]

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function renderIconSvg(iconNode) {
  const attributes = SVG_ATTRIBUTES.map(
    ([name, value]) => `${name}="${escapeXml(value)}"`
  ).join(" ")
  const children = iconNode
    .map(([tag, attrs]) => {
      const rendered = Object.entries(attrs)
        .filter(([name]) => name !== "key")
        .map(([name, value]) => `${name}="${escapeXml(value)}"`)
        .join(" ")
      return `<${tag}${rendered ? ` ${rendered}` : ""} />`
    })
    .join("")
  return `<svg ${attributes}>${children}</svg>`
}

function imagesetContents(icon) {
  return `${JSON.stringify(
    {
      images: [{ filename: `${icon}.pdf`, idiom: "universal" }],
      info: { author: "xcode", version: 1 },
      properties: { "preserves-vector-representation": true },
    },
    null,
    2
  )}\n`
}

async function writeIfChanged(filePath, contents) {
  try {
    if ((await readFile(filePath, "utf8")) === contents) return false
  } catch {
    // Missing file: fall through and write it.
  }
  await writeFile(filePath, contents)
  return true
}

async function loadIconNode(icon) {
  const module = await import(`lucide-react/dist/esm/icons/${icon}.mjs`)
  if (!Array.isArray(module.__iconNode)) {
    throw new Error(`lucide-react/${icon} has no __iconNode export`)
  }
  return module.__iconNode
}

async function generateIcon(icon) {
  const imageset = path.join(catalogDirectory, `${icon}.imageset`)
  const svgPath = path.join(imageset, `${icon}.svg`)
  const pdfPath = path.join(imageset, `${icon}.pdf`)

  await mkdir(imageset, { recursive: true })
  await writeFile(svgPath, renderIconSvg(await loadIconNode(icon)))
  execFileSync("rsvg-convert", ["-f", "pdf", "-o", pdfPath, svgPath], {
    env: { ...process.env, SOURCE_DATE_EPOCH: "0" },
    stdio: "inherit",
  })
  await rm(svgPath)

  const wroteMetadata = await writeIfChanged(
    path.join(imageset, "Contents.json"),
    imagesetContents(icon)
  )
  return wroteMetadata
}

async function main() {
  for (const icon of ICONS) {
    await generateIcon(icon)
    process.stdout.write(`generated ${icon}\n`)
  }
}

await main()
