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

export type DocumentInsertResult = {
  source: string
  caret: number
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
): DocumentInsertResult {
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

export function isRevisionConflict(error: unknown) {
  return isApiError(error) && error.status === 409
}

/** Warning rows sorted by source line so the panel mirrors the document. */
export function sortedDocumentWarnings(
  warnings: readonly WikiDocumentWarning[]
) {
  return [...warnings].sort((left, right) => left.line - right.line)
}

export function documentDraftIsDirty(
  loaded: WikiAdminEntryDocument | null,
  source: string
) {
  return loaded ? source !== loaded.sourceMarkdown : false
}
