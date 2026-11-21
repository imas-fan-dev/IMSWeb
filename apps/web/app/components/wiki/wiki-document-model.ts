import type {
  WikiDocumentBlock,
  WikiDocumentCard,
  WikiDocumentInline,
  WikiDocumentSourceLink,
} from "~/lib/api"

/**
 * Keyword and tag facet filtering for a compiled document.
 *
 * Pure functions: the renderer derives the visible block tree from the wire AST
 * instead of hiding DOM, so a filtered-out card or source link is never mounted
 * and never picked up by assistive technology or keyword search.
 */
export interface WikiDocumentFilter {
  query: string
  tags: readonly string[]
}

export function hasActiveDocumentFilter(filter: WikiDocumentFilter): boolean {
  return normalizeQuery(filter.query).length > 0 || filter.tags.length > 0
}

export function filterDocumentBlocks(
  blocks: readonly WikiDocumentBlock[],
  filter: WikiDocumentFilter
): WikiDocumentBlock[] {
  const query = normalizeQuery(filter.query)
  if (!query && filter.tags.length === 0) return [...blocks]
  return filterBlockList(blocks, query, filter.tags)
}

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN")
}

function inlineText(nodes: readonly WikiDocumentInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "inlineCode":
          return node.value
        case "break":
          return " "
        default:
          return inlineText(node.children)
      }
    })
    .join("")
}

function matches(texts: readonly string[], query: string): boolean {
  return texts.some((text) => text.toLocaleLowerCase("zh-CN").includes(query))
}

function sourceLinkTexts(links: readonly WikiDocumentSourceLink[]): string[] {
  return links.flatMap((link) => [
    link.up,
    link.title,
    link.contentType,
    link.sourcePlatform,
  ])
}

/** Inline searchable texts of the leaf blocks whose own text decides a match. */
function blockTexts(block: WikiDocumentBlock): string[] {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return [inlineText(block.children)]
    case "table":
      return [block.header, ...block.rows].map((row) =>
        row.map((cell) => inlineText(cell)).join(" ")
      )
    default:
      return []
  }
}

function cardTexts(card: WikiDocumentCard): string[] {
  return [
    card.title,
    card.subtitle,
    ...card.tags,
    ...sourceLinkTexts(card.links),
  ]
}

function cardMatchesTags(card: WikiDocumentCard, tags: readonly string[]) {
  if (!tags.length) return true
  return card.tags.some((tag) => tags.includes(tag))
}

/**
 * Keeps a heading when it matches itself or when anything in its own section
 * survives, so a filtered page still reads as titled sections instead of a flat
 * list of orphaned cards.
 */
function filterBlockList(
  blocks: readonly WikiDocumentBlock[],
  query: string,
  tags: readonly string[]
): WikiDocumentBlock[] {
  const output: WikiDocumentBlock[] = []
  let index = 0
  while (index < blocks.length) {
    const block = blocks[index]
    if (block.type !== "heading") {
      const filtered = filterBlock(block, query, tags)
      if (filtered) output.push(filtered)
      index += 1
      continue
    }
    let end = index + 1
    while (end < blocks.length) {
      const candidate = blocks[end]
      if (candidate.type === "heading" && candidate.level <= block.level) break
      end += 1
    }
    const section = filterBlockList(blocks.slice(index + 1, end), query, tags)
    if (section.length || !query || matches(blockTexts(block), query)) {
      output.push(block, ...section)
    }
    index = end
  }
  return output
}

function filterBlock(
  block: WikiDocumentBlock,
  query: string,
  tags: readonly string[]
): WikiDocumentBlock | null {
  switch (block.type) {
    case "links": {
      if (!query) return block
      if (matches([block.title], query)) return block
      const links = block.links.filter((link) =>
        matches(sourceLinkTexts([link]), query)
      )
      return links.length ? { ...block, links } : null
    }
    case "cardGrid": {
      const gridTitleMatches = Boolean(query) && matches([block.title], query)
      const cards = block.cards.filter((card) => {
        const queryMatches =
          !query || gridTitleMatches || matches(cardTexts(card), query)
        // Only grids that opt into `filter="tags"` react to the facet bar.
        const tagsMatch =
          block.filter === "tags" ? cardMatchesTags(card, tags) : true
        return queryMatches && tagsMatch
      })
      return cards.length ? { ...block, cards } : null
    }
    case "tabs": {
      const items = block.items.flatMap((tab) => {
        const tabTitleMatches = Boolean(query) && matches([tab.title], query)
        const children = filterBlockList(
          tab.children,
          tabTitleMatches ? "" : query,
          tags
        )
        return children.length ? [{ ...tab, children }] : []
      })
      return items.length ? { ...block, items } : null
    }
    // Containers keep filtering their children so cards and source links
    // nested inside them stay searchable and tag-filterable.
    case "blockquote":
    case "callout":
    case "details": {
      const children = filterBlockList(block.children, query, tags)
      return children.length ? { ...block, children } : null
    }
    case "list": {
      const items = block.items.flatMap((item) => {
        const children = filterBlockList(item.children, query, tags)
        return children.length ? [{ ...item, children }] : []
      })
      return items.length ? { ...block, items } : null
    }
    case "thematicBreak":
      return query ? null : block
    case "heading":
      return block
    default:
      if (!query) return block
      return matches(blockTexts(block), query) ? block : null
  }
}
