import type { WikiPublicStoryCard, WikiPublicStoryCategory } from "~/shared/api"

const HEX_COLOR = /^#[0-9a-f]{6}$/i

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
    ...card.links.flatMap((link) => [
      link.up,
      link.title,
      link.contentType,
      link.sourcePlatform,
    ]),
  ].some((value) => value.toLocaleLowerCase("zh-CN").includes(normalized))
}
