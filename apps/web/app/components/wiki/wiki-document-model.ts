import type {
  WikiDocumentBlock,
  WikiDocumentCard,
  WikiDocumentInline,
  WikiDocumentSourceLink,
  WikiPublicStoryCategory,
  WikiPublicStoryDocument,
} from "~/lib/api"
import { storyCategoryAnchorId } from "~/pages/wiki/wiki-model"

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
  /**
   * Embedded structured categories the page's own filter currently hides
   * (empty card lists after search/cast filtering). `undefined` keeps them.
   */
  hiddenCategories?: readonly string[]
}

/** One table-of-contents entry of a hybrid document page. */
export type WikiDocumentOutlineEntry =
  | { kind: "heading"; id: string; level: 2 | 3; text: string }
  | { kind: "category"; id: string; name: string; count: number }

/**
 * Merges document headings and embedded categories in document order.
 *
 * A hybrid page must jump from a Markdown heading into the structured pool the
 * author embedded next, then on to the following heading. `document.headings`
 * stays the source of truth for the heading entries (it is what the compiler
 * extracted for the TOC), while the block tree decides where each heading and
 * category sits; headings the block tree no longer carries are appended so the
 * outline never loses an entry.
 */
export function documentOutline(
  document: WikiPublicStoryDocument,
  categories: readonly WikiPublicStoryCategory[]
): WikiDocumentOutlineEntry[] {
  const byName = new Map(
    categories.map((category) => [category.name, category])
  )
  const headings = document.headings.map((heading, index) => ({
    heading,
    index,
  }))
  const emittedHeadings = new Set<number>()
  const outline: WikiDocumentOutlineEntry[] = []
  const pushHeading = (entry: {
    id: string
    level: 2 | 3
    text: string
  }): void => {
    outline.push({
      kind: "heading",
      id: entry.id,
      level: entry.level,
      text: entry.text,
    })
  }
  const pushCategory = (category: WikiPublicStoryCategory): void => {
    outline.push({
      kind: "category",
      id: storyCategoryAnchorId(category.name),
      name: category.name,
      count: category.cards.length,
    })
  }
  const visit = (blocks: readonly WikiDocumentBlock[]): void => {
    for (const block of blocks) {
      switch (block.type) {
        case "heading": {
          const known = headings.find(
            ({ heading, index }) =>
              !emittedHeadings.has(index) && heading.id === block.id
          )
          if (known) emittedHeadings.add(known.index)
          pushHeading(
            known
              ? known.heading
              : {
                  id: block.id,
                  level: block.level,
                  text: inlineText(block.children),
                }
          )
          break
        }
        case "storyCategory":
          if (block.categoryName === null) {
            categories.forEach(pushCategory)
          } else {
            const category = byName.get(block.categoryName)
            if (category) pushCategory(category)
          }
          break
        case "tabs":
          for (const tab of block.items) visit(tab.children)
          break
        case "blockquote":
        case "callout":
        case "details":
          visit(block.children)
          break
        case "list":
          for (const item of block.items) visit(item.children)
          break
        default:
          break
      }
    }
  }
  visit(document.blocks)
  for (const { heading, index } of headings) {
    if (!emittedHeadings.has(index)) pushHeading(heading)
  }
  return outline
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
  return filterBlockList(
    blocks,
    query,
    filter.tags,
    filter.hiddenCategories ?? []
  )
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
    case "media":
      return [block.caption]
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
  tags: readonly string[],
  hidden: readonly string[]
): WikiDocumentBlock[] {
  const output: WikiDocumentBlock[] = []
  let index = 0
  while (index < blocks.length) {
    const block = blocks[index]
    if (block.type !== "heading") {
      const filtered = filterBlock(block, query, tags, hidden)
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
    const section = filterBlockList(
      blocks.slice(index + 1, end),
      query,
      tags,
      hidden
    )
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
  tags: readonly string[],
  hidden: readonly string[]
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
          tags,
          hidden
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
      const children = filterBlockList(block.children, query, tags, hidden)
      return children.length ? { ...block, children } : null
    }
    case "list": {
      const items = block.items.flatMap((item) => {
        const children = filterBlockList(item.children, query, tags, hidden)
        return children.length ? [{ ...item, children }] : []
      })
      return items.length ? { ...block, items } : null
    }
    case "thematicBreak":
      return query ? null : block
    case "heading":
      return block
    // An embedded category disappears while the page filter hides it (`null`
    // means "every category", which the renderer narrows per category itself).
    case "storyCategory":
      return block.categoryName && hidden.includes(block.categoryName)
        ? null
        : block
    default:
      if (!query) return block
      return matches(blockTexts(block), query) ? block : null
  }
}

/** Header counters a `document` story page shows instead of structured counts. */
export interface WikiDocumentSummary {
  sections: number
  cards: number
  sources: number
}

/**
 * Counts what the compiled AST actually renders.
 *
 * A document page carries no structured categories, so the modern header must
 * derive its numbers from the block tree (including cards and source links
 * nested inside callouts, details, quotes, lists and tabs).
 */
export function documentSummary(
  document: WikiPublicStoryDocument
): WikiDocumentSummary {
  let cards = 0
  let sources = 0
  const visit = (blocks: readonly WikiDocumentBlock[]): void => {
    for (const block of blocks) {
      switch (block.type) {
        case "cardGrid":
          cards += block.cards.length
          sources += block.cards.reduce(
            (count, card) => count + card.links.length,
            0
          )
          break
        case "links":
          sources += block.links.length
          break
        case "tabs":
          for (const tab of block.items) visit(tab.children)
          break
        case "blockquote":
        case "callout":
        case "details":
          visit(block.children)
          break
        case "list":
          for (const item of block.items) visit(item.children)
          break
        default:
          break
      }
    }
  }
  visit(document.blocks)
  return { sections: document.headings.length, cards, sources }
}
