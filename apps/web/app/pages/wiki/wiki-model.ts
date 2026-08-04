import type { WikiPublicStoryCard, WikiPublicStoryCategory } from "~/lib/api"

const HEX_COLOR = /^#[0-9a-f]{6}$/i
const DARK_WIKI_TEXT = "#202126"
const LIGHT_WIKI_TEXT = "#ffffff"
const MIN_TEXT_CONTRAST = 4.5

const ASPECT_BY_CATEGORY: Record<string, string> = {
  竖卡: "4 / 5",
  P卡: "9 / 16",
  亲密度剧情: "1 / 1",
  enza主线: "2.8 / 1",
  enza组合剧情: "2.8 / 1",
  enza节日剧情: "2.8 / 1",
  scsp活动: "2.8 / 1",
}

const PORTRAIT_CARD_CATEGORIES = new Set(["竖卡", "P卡"])

export function storyCardAspectRatio(categoryName: string) {
  return ASPECT_BY_CATEGORY[categoryName] ?? "16 / 9"
}

export function isPortraitStoryCategory(categoryName: string) {
  return PORTRAIT_CARD_CATEGORIES.has(categoryName)
}

const COLUMNS_BY_CATEGORY: Record<string, string> = {
  竖卡: "repeat(5, minmax(0, 1fr))",
  P卡: "repeat(5, minmax(0, 1fr))",
  亲密度剧情: "repeat(auto-fill, minmax(160px, 1fr))",
  enza主线: "repeat(auto-fill, minmax(280px, 1fr))",
  enza组合剧情: "repeat(auto-fill, minmax(280px, 1fr))",
  enza节日剧情: "repeat(auto-fill, minmax(280px, 1fr))",
  scsp活动: "repeat(auto-fill, minmax(280px, 1fr))",
}

const GAP_BY_CATEGORY: Record<string, string> = {
  竖卡: "14px",
  P卡: "12px",
  亲密度剧情: "12px",
}

export function storyCardGap(categoryName: string) {
  return GAP_BY_CATEGORY[categoryName] ?? "18px"
}

export function storyCardColumns(categoryName: string) {
  return (
    COLUMNS_BY_CATEGORY[categoryName] ?? "repeat(auto-fill, minmax(240px, 1fr))"
  )
}

export function safeWikiColor(value: string | null | undefined) {
  return value && HEX_COLOR.test(value) ? value : "#d9467d"
}

export function readableWikiAccent(value: string | null | undefined) {
  const accent = safeWikiColor(value)
  if (contrastRatio(accent, LIGHT_WIKI_TEXT) >= MIN_TEXT_CONTRAST) {
    return accent
  }

  for (let step = 1; step <= 10; step += 1) {
    const candidate = mixHexColors(accent, DARK_WIKI_TEXT, step / 10)
    if (contrastRatio(candidate, LIGHT_WIKI_TEXT) >= MIN_TEXT_CONTRAST) {
      return candidate
    }
  }

  return DARK_WIKI_TEXT
}

export function contrastingWikiText(
  background: string | null | undefined,
  preferred?: string | null
) {
  const surface = safeWikiColor(background)
  const preferredText =
    preferred && HEX_COLOR.test(preferred) ? preferred : LIGHT_WIKI_TEXT
  if (contrastRatio(surface, preferredText) >= MIN_TEXT_CONTRAST) {
    return preferredText
  }

  return contrastRatio(surface, DARK_WIKI_TEXT) >=
    contrastRatio(surface, LIGHT_WIKI_TEXT)
    ? DARK_WIKI_TEXT
    : LIGHT_WIKI_TEXT
}

function mixHexColors(from: string, to: string, amount: number) {
  const fromRgb = hexToRgb(from)
  const toRgb = hexToRgb(to)
  const channel = (start: number, end: number) =>
    Math.round(start + (end - start) * amount)
      .toString(16)
      .padStart(2, "0")
  return `#${channel(fromRgb[0], toRgb[0])}${channel(fromRgb[1], toRgb[1])}${channel(fromRgb[2], toRgb[2])}`
}

function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

function relativeLuminance(color: string) {
  const channels = hexToRgb(color).map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function hexToRgb(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ]
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

export function hasStorySource(links: WikiPublicStoryCard["links"]) {
  return links.some(
    (link) => link.contentType.normalize("NFKC").trim() === "剧情"
  )
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
    ...card.links.flatMap((link) => [
      link.up,
      link.title,
      link.contentType,
      link.sourcePlatform,
    ]),
  ].some((value) => value.toLocaleLowerCase("zh-CN").includes(normalized))
}
