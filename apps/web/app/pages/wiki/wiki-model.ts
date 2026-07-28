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

const COLUMNS_BY_CATEGORY: Record<string, string> = {
  "竖卡": "repeat(5, minmax(0, 1fr))",
  "P卡": "repeat(5, minmax(0, 1fr))",
  "亲密度剧情": "repeat(auto-fill, minmax(160px, 1fr))",
  "enza主线": "repeat(auto-fill, minmax(280px, 1fr))",
  "enza组合剧情": "repeat(auto-fill, minmax(280px, 1fr))",
  "enza节日剧情": "repeat(auto-fill, minmax(280px, 1fr))",
  "scsp活动": "repeat(auto-fill, minmax(280px, 1fr))",
}

const GAP_BY_CATEGORY: Record<string, string> = {
  "竖卡": "14px",
  "P卡": "12px",
  "亲密度剧情": "12px",
}

export function storyCardGap(categoryName: string) {
  return GAP_BY_CATEGORY[categoryName] ?? "18px"
}

export function storyCardColumns(categoryName: string) {
  return COLUMNS_BY_CATEGORY[categoryName] ?? "repeat(auto-fill, minmax(240px, 1fr))"
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
