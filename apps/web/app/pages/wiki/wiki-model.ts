import type { WikiPublicStoryCard, WikiPublicStoryCategory } from "~/shared/api"

const HEX_COLOR = /^#[0-9a-f]{6}$/i

const ASPECT_BY_CATEGORY: Record<string, string> = {
  "竖卡": "4 / 5",
  "P卡": "9 / 16",
  "亲密度剧情": "1 / 1",
  "enza主线": "2.8 / 1",
  "enza组合剧情": "2.8 / 1",
  "enza节日剧情": "2.8 / 1",
  "scsp活动": "2.8 / 1",
}

export function storyCardAspectRatio(categoryName: string) {
  return ASPECT_BY_CATEGORY[categoryName] ?? "16 / 9"
}

const COLUMNS_BY_CATEGORY: Record<string, number> = {
  "竖卡": 5,
  "P卡": 5,
}

export function storyCardColumns(categoryName: string) {
  const columns = COLUMNS_BY_CATEGORY[categoryName] ?? 4
  return `repeat(${columns}, minmax(0, 1fr))`
}

export function safeWikiColor(value: string | null | undefined) {
  return value && HEX_COLOR.test(value) ? value : "#d9467d"
}

export function safeExternalStoryUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null
  } catch {
    return null
  }
}

export function storyCardMatches(
  category: WikiPublicStoryCategory,
  card: WikiPublicStoryCard,
  query: string
) {
  const normalized = query.trim().toLocaleLowerCase("zh-CN")
  if (!normalized) return true
  return [
    category.name,
    card.name,
    card.subtitle,
    ...card.links.flatMap((link) => [link.up, link.title]),
  ].some((value) => value.toLocaleLowerCase("zh-CN").includes(normalized))
}
