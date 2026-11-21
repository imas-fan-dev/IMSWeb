import type { WikiDocumentCard, WikiPublicStoryCard } from "~/lib/api"

/**
 * UI-neutral card selection for the shared story source dialog.
 *
 * Structured cards (`wiki_story_cards`) and document-authored `:::card` blocks
 * describe sources with different wire shapes; both collapse into this one
 * selection so Modern and Classic render the same dialog component.
 */
export interface StorySourceLinkItem {
  key: string
  up: string
  title: string
  url: string
  contentType: string
  sourcePlatform: string
  /** Catalog icon name; document links have no catalog row and omit it. */
  iconName?: string
}

export interface StorySourceSelection {
  /** Enclosing category or card-grid title shown above the card title. */
  groupTitle: string
  title: string
  subtitle: string
  links: StorySourceLinkItem[]
}

export function structuredCardSelection(
  groupTitle: string,
  card: WikiPublicStoryCard
): StorySourceSelection {
  return {
    groupTitle,
    title: card.name,
    subtitle: card.subtitle,
    links: card.links.map((link) => ({
      key: String(link.id),
      up: link.up,
      title: link.title,
      url: link.url,
      contentType: link.contentType,
      sourcePlatform: link.sourcePlatform,
      iconName: link.contentTypeIcon,
    })),
  }
}

export function documentCardSelection(
  groupTitle: string,
  card: WikiDocumentCard
): StorySourceSelection {
  return {
    groupTitle,
    title: card.title,
    subtitle: card.subtitle,
    links: card.links.map((link, index) => ({
      key: `${groupTitle}\u0000${card.id ?? "card"}\u0000${index}`,
      up: link.up,
      title: link.title,
      url: link.url,
      contentType: link.contentType,
      sourcePlatform: link.sourcePlatform,
    })),
  }
}
