/** The three tag library sections share one page; the tab lives in the URL. */
export const TAG_LIBRARY_TABS = ["free", "presets", "blocklist"] as const

export type TagLibraryTab = (typeof TAG_LIBRARY_TABS)[number]

export const DEFAULT_TAG_LIBRARY_TAB: TagLibraryTab = "free"

export const TAG_LIBRARY_PAGE_SIZE = 20

/** Contracts cap one tag at 64 characters; the API keeps the same boundary. */
export const TAG_NAME_MAX_LENGTH = 64

export const TAG_ALIAS_LIMIT = 50

export const TAG_BLOCKLIST_PATTERN_MAX_LENGTH = 200

/** The blocklist search contract accepts a longer keyword than tag names. */
export const TAG_BLOCKLIST_QUERY_MAX_LENGTH = 80

export type TagLibraryPageInfo = {
  page: number
  totalPages: number
}

export function tagLibraryTab(value: string | null): TagLibraryTab {
  return TAG_LIBRARY_TABS.includes(value as TagLibraryTab)
    ? (value as TagLibraryTab)
    : DEFAULT_TAG_LIBRARY_TAB
}

export function parsePageParam(value: string | null): number {
  const page = Number(value ?? "1")
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

/**
 * Alias input accepts what an operator would naturally type: commas, newlines
 * and Chinese commas all separate entries. Blanks and over-long entries are
 * dropped instead of reaching the strict request contract.
 */
function splitAliasInput(value: string): string[] {
  return value
    .split(/[,，\n\r]+/)
    .map((part) => part.trim())
    .filter(
      (part) => part.length > 0 && part.length <= TAG_NAME_MAX_LENGTH
    )
}

/** Appends aliases without duplicating an existing chip (case-insensitive). */
export function appendAliases(current: string[], input: string): string[] {
  const next = [...current]
  const seen = new Set(current.map((alias) => alias.toLowerCase()))
  for (const alias of splitAliasInput(input)) {
    const key = alias.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next.push(alias)
    if (next.length >= TAG_ALIAS_LIMIT) break
  }
  return next
}

export function tagCountLabel(count: number): string {
  return `${count} 次使用`
}

export function formatTagTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
