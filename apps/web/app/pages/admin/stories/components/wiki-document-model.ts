import { isApiError } from "~/lib/api"
import type {
  WikiAdminEntryDocument,
  WikiContentMode,
  WikiDocumentWarning,
} from "~/lib/api"

/**
 * Pure document-workbench model: mode labels, insert snippets, caret math for
 * line-numbered diagnostics, and the optimistic-lock conflict probe.
 *
 * Nothing here touches React or the network so the workbench UI stays a thin
 * view over text it can also test through user-visible behaviour.
 */

export type DocumentEntryMode = WikiContentMode

export const DOCUMENT_MODE_LABELS: Record<DocumentEntryMode, string> = {
  structured: "结构化卡片模式",
  document: "增强 Markdown 文档模式",
}

/** One quick-insert toolbar template; `snippet` is inserted at the caret. */
export type DocumentInsertTemplate = {
  id: string
  label: string
  description: string
  snippet: string
}

export const DOCUMENT_INSERT_TEMPLATES: readonly DocumentInsertTemplate[] = [
  {
    id: "card-grid",
    label: "卡片网格",
    description: ":::card-grid 包住多张 :::card",
    snippet: [
      ':::card-grid{layout="grid" cols="3"}',
      ':::card{title="【卡片标题】"}',
      "- [](https://www.bilibili.com/video/BV1xx411c7mD)",
      ":::",
      ":::",
    ].join("\n"),
  },
  {
    id: "callout",
    label: "提示框",
    description: ":::callout 提示、信息、警告或剧透",
    snippet: [
      ':::callout{type="tip" title="提示"}',
      "在这里写提示内容。",
      ":::",
    ].join("\n"),
  },
  {
    id: "details",
    label: "折叠块",
    description: ":::details 剧透或章节折叠",
    snippet: [':::details{title="剧透折叠"}', "在这里写折叠内容。", ":::"].join(
      "\n"
    ),
  },
  {
    id: "tabs",
    label: "选项卡",
    description: ":::tabs 包住多个 :::tab",
    snippet: [
      ":::tabs",
      ':::tab{title="选项卡 1"}',
      "选项卡内容。",
      ":::",
      ":::",
    ].join("\n"),
  },
  {
    id: "links",
    label: "来源链接",
    description: ":::links 紧凑来源列表",
    snippet: [
      ':::links{title="来源"}',
      "- [](https://www.bilibili.com/video/BV1xx411c7mD)",
      ":::",
    ].join("\n"),
  },
]

/** Directive attribute values are double-quoted, so quotes cannot survive. */
function attributeValue(value: string) {
  return value.replaceAll('"', "”").trim()
}

export function storyCategorySnippet(name: string) {
  return `::story-category{name="${attributeValue(name)}"}`
}

export function documentMediaSnippet(input: {
  assetRef: string
  caption?: string
  fit?: "cover" | "contain"
}) {
  const attributes = [`asset="${attributeValue(input.assetRef)}"`]
  if (input.caption)
    attributes.push(`caption="${attributeValue(input.caption)}"`)
  if (input.fit) attributes.push(`fit="${input.fit}"`)
  return `::media{${attributes.join(" ")}}`
}

/**
 * Inserts one block snippet at the caret, keeping a blank line between the new
 * block and its neighbours so the compiler never reads a directive glued to the
 * previous paragraph.
 */
export function insertDocumentSnippet(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  snippet: string
): { source: string; caret: number } {
  const start = Math.max(0, Math.min(selectionStart, source.length))
  const end = Math.max(start, Math.min(selectionEnd, source.length))
  const before = source.slice(0, start)
  const after = source.slice(end)
  const lead =
    before === "" || before.endsWith("\n\n")
      ? ""
      : before.endsWith("\n")
        ? "\n"
        : "\n\n"
  const trail =
    after === "" || after.startsWith("\n\n")
      ? ""
      : after.startsWith("\n")
        ? "\n"
        : "\n\n"
  const inserted = `${lead}${snippet}${trail}`
  return {
    source: `${before}${inserted}${after}`,
    caret: before.length + lead.length + snippet.length,
  }
}

/**
 * Character offset of the first column of a 1-based source line.
 *
 * Compiler diagnostics are 1-based; a line past the end clamps to the end of
 * the document so a stale warning still focuses the editor.
 */
export function lineStartOffset(source: string, line: number) {
  const target = Math.max(1, Math.trunc(line))
  let offset = 0
  for (let current = 1; current < target; current += 1) {
    const next = source.indexOf("\n", offset)
    if (next === -1) return source.length
    offset = next + 1
  }
  return offset
}

export type DocumentCategoryOption = {
  name: string
  cardCount: number
}

/** The entry's existing categories, with their current card counts. */
export function documentCategoryOptions(
  categories: readonly { name: string }[],
  cards: readonly { category: string }[]
): DocumentCategoryOption[] {
  const counts = new Map<string, number>()
  for (const card of cards) {
    counts.set(card.category, (counts.get(card.category) ?? 0) + 1)
  }
  return categories.map((category) => ({
    name: category.name,
    cardCount: counts.get(category.name) ?? 0,
  }))
}

/**
 * Current revision published by a `409` optimistic-lock response.
 *
 * The API answers a stale `expectedRevision` with `{ status: 'error', revision }`
 * so the workbench can offer "overwrite" without a second read.
 */
export function conflictRevision(error: unknown) {
  if (!isApiError(error) || error.status !== 409) return null
  const payload = error.payload
  if (typeof payload !== "object" || payload === null) return null
  const revision = (payload as { revision?: unknown }).revision
  return typeof revision === "number" && Number.isInteger(revision)
    ? revision
    : null
}

/** Warning rows sorted by source line so the panel mirrors the document. */
export function sortedDocumentWarnings(
  warnings: readonly WikiDocumentWarning[]
) {
  return [...warnings].sort((left, right) => left.line - right.line)
}

const revisionTimestampFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
})

/**
 * Commit time of one retained snapshot in the maintainer's locale.
 *
 * An unparsable value falls back to the raw string instead of "Invalid Date",
 * so a wire regression stays visible in the history drawer.
 */
export function documentRevisionTimestamp(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? value
    : revisionTimestampFormat.format(date)
}

/**
 * What loading a snapshot does, stated next to the action.
 *
 * Restoring is non-destructive: the draft keeps the stored `expectedRevision`,
 * so saving writes the next revision instead of rewriting the restored one.
 */
export function revisionLoadNote(storedRevision: number) {
  return `载入的是草稿：保存会以服务器修订 r${storedRevision} 为基准，生成 r${storedRevision + 1} 的新版本，不会改写已有历史。`
}

export function documentDraftIsDirty(
  loaded: WikiAdminEntryDocument | null,
  source: string
) {
  return loaded ? source !== loaded.sourceMarkdown : false
}

/** One Bilibili link the batch parser resolved. */
export type BatchBilibiliLink = {
  title: string
  up: string
  stdUrl: string
}

/**
 * Escapes one `[类型｜平台｜UP]` label field.
 *
 * Whitespace collapses to single spaces so a pasted newline cannot break the
 * line; backslashes and `]` are escaped so a label cannot close the link text
 * early, and halfwidth `|` becomes `｜` so it never reads as a field separator.
 */
function sourceListLabelField(value: string) {
  return value
    .replaceAll(/\s+/gu, " ")
    .trim()
    .replaceAll("\\", "\\\\")
    .replaceAll("]", "\\]")
    .replaceAll("|", "｜")
}

/**
 * Keeps a trailing title human-readable while neutralizing `](`.
 *
 * Titles never enter attribute quotes, so `"`, `【】`, `「」`, `*`, `<`, `>` stay
 * literal. Only a `](` sequence is escaped, because it would otherwise open a
 * second link, and newlines collapse to one line.
 */
function sourceListTitle(value: string) {
  return value.replaceAll(/\s+/gu, " ").trim().replaceAll("](", "]\\(")
}

/** `- [类型｜Bilibili｜UP](url) 标题` for one resolved link. */
export function bilibiliSourceLine(
  link: BatchBilibiliLink & { contentType: string }
) {
  const label = [link.contentType, "Bilibili", link.up]
    .map(sourceListLabelField)
    .join("｜")
  const title = sourceListTitle(link.title)
  const line = `- [${label}](${link.stdUrl})`
  return title ? `${line} ${title}` : line
}

/** How the batch macro wraps the generated source lines. */
export type BatchBilibiliWrapper = "lines" | "links"

export const BATCH_BILIBILI_WRAPPERS: readonly {
  id: BatchBilibiliWrapper
  label: string
}[] = [
  { id: "lines", label: "仅链接行" },
  { id: "links", label: ":::links 块" },
]

/** Generated Markdown for the batch macro, inserted at the editor caret. */
export function batchBilibiliSnippet(
  lines: readonly string[],
  wrapper: BatchBilibiliWrapper
) {
  if (!lines.length) return ""
  return wrapper === "links"
    ? [":::links", ...lines, ":::"].join("\n")
    : lines.join("\n")
}

/** The batch endpoint accepts at most this many links per request. */
export const BATCH_BILIBILI_LIMIT = 20

/**
 * Splits a pasted column of links into trimmed, de-duplicated inputs.
 *
 * Mirrors the API: blank lines vanish and a repeated link is parsed once, so
 * the request never carries entries the batch parser would drop anyway.
 */
export function splitBatchBilibiliUrls(text: string) {
  const seen = new Set<string>()
  const urls: string[] = []
  for (const line of text.split(/\r?\n/u)) {
    const url = line.trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls
}

/** The content type the batch macro writes unless the maintainer picks another. */
export const DEFAULT_BATCH_CONTENT_TYPE = "剧情"

/**
 * Content types the batch macro offers: `剧情` first, then active catalog types.
 *
 * Inactive catalog options are excluded because new links must not revive a
 * retired content type; `剧情` is always offered as the default even when the
 * catalog has not been seeded yet.
 */
export function batchContentTypeOptions(
  contentTypes: readonly { name: string; isActive: boolean }[]
) {
  const names = [DEFAULT_BATCH_CONTENT_TYPE]
  for (const option of contentTypes) {
    if (!option.isActive) continue
    const name = option.name.trim()
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

/** The audit-calibrated fold point the structured export dialog starts from. */
export const EXPORT_COLLAPSE_THRESHOLD = 24

/** One-line description of what a generated draft covers. */
export function structuredExportSummary(stats: {
  categories: number
  cards: number
  links: number
  collapsedCategories: number
}) {
  const parts = [
    `${stats.categories} 个分类`,
    `${stats.cards} 张卡片`,
    `${stats.links} 条来源`,
  ]
  if (stats.collapsedCategories) {
    parts.push(`${stats.collapsedCategories} 个分类默认折叠`)
  }
  return parts.join(" · ")
}

/**
 * Draft text handed back to the editor.
 *
 * The API ends the document without a trailing newline; trimming keeps a
 * replace from leaving a run of blank lines behind the last block.
 */
export function structuredExportDraft(markdown: string) {
  return markdown.replace(/\s+$/u, "")
}
