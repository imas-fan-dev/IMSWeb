import type { EventListItem } from "~/lib/api"

export interface EventLinkTarget {
  href: string
  external: boolean
}

/**
 * 没有正文的标题型帖子在列表里直接打开来源页，避免先进详情再点一次链接。
 * 有正文或缺少来源时仍进入详情页。
 */
export function eventLinkTarget(
  event: Pick<EventListItem, "id" | "has_body" | "source_url">
): EventLinkTarget {
  const detailHref = `/events/${encodeURIComponent(event.id)}`
  const sourceUrl = directSourceUrl(event.source_url)
  if (event.has_body !== false || !sourceUrl) {
    return { href: detailHref, external: false }
  }

  return {
    href: sourceUrl,
    external: !(sourceUrl.startsWith("/") && !sourceUrl.startsWith("//")),
  }
}

function directSourceUrl(value?: string | null): string | null {
  const sourceUrl = value?.trim()
  if (!sourceUrl || sourceUrl.startsWith("//")) return null
  if (sourceUrl.startsWith("/")) return sourceUrl
  return /^https?:\/\//i.test(sourceUrl) ? sourceUrl : null
}
