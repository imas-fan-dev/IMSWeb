import type { CSSProperties, ReactNode } from "react"
import { Fragment, useState } from "react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { Badge } from "~/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  StorySourceDialog,
  StorySourceLinkRow,
} from "~/components/wiki/story-source-dialog"
import {
  documentCardSelection,
  type StorySourceSelection,
} from "~/components/wiki/story-source-model"
import {
  filterDocumentBlocks,
  hasActiveDocumentFilter,
} from "~/components/wiki/wiki-document-model"
import { WikiDocumentTagFilter } from "~/components/wiki/wiki-document-tag-filter"
import type {
  WikiDocumentBlock,
  WikiDocumentCard,
  WikiDocumentCardGridBlock,
  WikiDocumentInline,
  WikiDocumentMediaBlock,
  WikiDocumentStoryCategoryBlock,
  WikiDocumentTab,
  WikiPublicStoryCategory,
  WikiPublicStoryDocument,
} from "~/lib/api"
import { cn } from "~/lib/utils"
import {
  hasStorySource,
  storyCardChrome,
  storyCategoryAnchorId,
} from "~/pages/wiki/wiki-model"

const CALLOUT_LABELS: Record<string, string> = {
  tip: "提示",
  info: "说明",
  warning: "注意",
  spoiler: "剧透",
}

const CALLOUT_TONES: Record<string, string> = {
  tip: "border-emerald-500/60 bg-emerald-500/5",
  info: "border-sky-500/60 bg-sky-500/5",
  warning: "border-amber-500/60 bg-amber-500/5",
  spoiler: "border-violet-500/60 bg-violet-500/5",
}

/** `contain` (policy or author choice) never crops the artwork. */
function documentImageFit(
  fit: "cover" | "contain",
  policy: "inherit" | "contain"
): "cover" | "contain" {
  return policy === "contain" || fit === "contain" ? "contain" : "cover"
}

const CARD_GRID_LAYOUT_CLASS: Record<
  WikiDocumentCardGridBlock["layout"],
  string
> = {
  grid: "grid-cols-2 sm:grid-cols-(--doc-card-columns)",
  portrait: "grid-cols-3 sm:grid-cols-(--doc-card-columns)",
  banner: "grid-cols-1",
  list: "grid-cols-1 gap-2",
}

/**
 * State a nested block needs from the renderer root: the deep-link target and
 * the callback that opens the shared source dialog for a card.
 */
interface DocumentRenderContext {
  highlightedCardId: number | null
  onOpenCard: (card: WikiDocumentCard, groupTitle: string) => void
  /** Embedded structured categories the page currently shows, in page order. */
  categories: readonly WikiPublicStoryCategory[]
  /** Page-owned renderer so both views style the embedded pool natively. */
  renderStoryCategory?: (input: {
    category: WikiPublicStoryCategory
    categoryId: string
  }) => ReactNode
}

function inlineNodes(
  nodes: readonly WikiDocumentInline[],
  keyPrefix: string
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`
    switch (node.type) {
      case "text":
        return node.value
      case "strong":
        return (
          <strong key={key} className="font-semibold">
            {inlineNodes(node.children, key)}
          </strong>
        )
      case "emphasis":
        return <em key={key}>{inlineNodes(node.children, key)}</em>
      case "delete":
        return <del key={key}>{inlineNodes(node.children, key)}</del>
      case "inlineCode":
        return (
          <code
            key={key}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]"
          >
            {node.value}
          </code>
        )
      case "link": {
        // The API compiles and validates every URL into the AST contract
        // (`@imsweb/contracts/wiki`), so this only decides how to navigate.
        const external = !node.url.startsWith("/")
        return (
          <NavigationLink
            key={key}
            {...(external ? { href: node.url } : { to: node.url })}
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
            className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {inlineNodes(node.children, key)}
          </NavigationLink>
        )
      }
      case "break":
        return <br key={key} />
      default:
        return null
    }
  })
}

/**
 * Tabbed document section.
 *
 * Only the active panel is mounted, so a filtered or hidden panel never leaks
 * searchable text into the page's keyword search.
 */
function DocumentTabs({
  items,
  keyPrefix,
  context,
}: {
  items: readonly WikiDocumentTab[]
  keyPrefix: string
  context: DocumentRenderContext
}) {
  const [activeValue, setActiveValue] = useState("0")
  const requestedIndex = items.findIndex(
    (_tab, index) => String(index) === activeValue
  )
  const activeIndex = requestedIndex >= 0 ? requestedIndex : 0
  const current = items[activeIndex]

  return (
    <Tabs
      value={String(activeIndex)}
      onValueChange={(value) => setActiveValue(String(value))}
      className="mt-4 gap-0 rounded-lg border"
    >
      <TabsList aria-label="内容切换" className="m-2 flex-wrap">
        {items.map((tab, index) => (
          <TabsTrigger key={`${keyPrefix}-tab-${index}`} value={String(index)}>
            {tab.title || `选项 ${index + 1}`}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={String(activeIndex)} className="px-4 py-3">
        {current
          ? blockNodes(current.children, `${keyPrefix}-panel`, context)
          : null}
      </TabsContent>
    </Tabs>
  )
}

/**
 * One `:::card` card.
 *
 * Cards reuse the structured card semantics: the whole card is a button that
 * opens the source dialog, cards with no `剧情` source are dimmed, cards that
 * carry an id expose the `#story-card-<id>` deep-link anchor, and zero-link or
 * image-less cards still render as first-class text cards.
 */
function DocumentCardButton({
  card,
  groupTitle,
  ratio,
  context,
}: {
  card: WikiDocumentCard
  groupTitle: string
  ratio: WikiDocumentCardGridBlock["ratio"]
  context: DocumentRenderContext
}) {
  const chrome = storyCardChrome(
    card.title,
    hasStorySource(card.links),
    card.id !== null && card.id === context.highlightedCardId
  )
  return (
    <button
      type="button"
      id={card.id !== null ? `story-card-${card.id}` : undefined}
      data-story-state={chrome.dataStoryState}
      data-cover-target={chrome.isCoverTarget ? "true" : undefined}
      aria-label={chrome.ariaLabel}
      data-card-fit={card.fit}
      className={cn(
        "flex min-h-13 scroll-mt-24 flex-col items-start gap-1 rounded-lg border bg-card px-4 py-3 text-left shadow-sm transition-[box-shadow,filter,opacity,transform] duration-500 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        chrome.className
      )}
      onClick={() => context.onOpenCard(card, groupTitle)}
    >
      {card.imageUrl ? (
        <span
          data-card-media=""
          className="block w-full overflow-hidden rounded-md bg-muted"
          style={ratio ? { aspectRatio: ratio } : undefined}
        >
          <img
            src={card.imageUrl}
            alt=""
            className="size-full"
            style={{
              objectFit: documentImageFit(card.fit, card.presentationPolicy),
            }}
            loading="lazy"
            decoding="async"
          />
        </span>
      ) : null}
      <span className="text-sm font-bold wrap-break-word">{card.title}</span>
      {card.subtitle ? (
        <span className="text-xs wrap-break-word text-muted-foreground">
          {card.subtitle}
        </span>
      ) : null}
      {card.tags.length ? (
        <span className="flex flex-wrap gap-1">
          {card.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </span>
      ) : null}
      {card.links.length ? (
        <span className="text-xs text-muted-foreground">
          {card.links.length} 个来源
        </span>
      ) : null}
    </button>
  )
}

function cardGridStyle(block: WikiDocumentCardGridBlock): CSSProperties {
  const columns = block.cols
    ? `repeat(${block.cols}, minmax(0, 1fr))`
    : "repeat(auto-fill, minmax(200px, 1fr))"
  return { "--doc-card-columns": columns } as CSSProperties
}

/** `:::card-grid` wrapper: collapsible block with a responsive card grid. */
function DocumentCardGrid({
  block,
  keyPrefix,
  context,
}: {
  block: WikiDocumentCardGridBlock
  keyPrefix: string
  context: DocumentRenderContext
}) {
  return (
    <details
      open={!block.collapsed}
      className="mt-4 rounded-lg border px-4 py-3"
    >
      <summary className="cursor-pointer text-sm font-semibold marker:text-muted-foreground">
        {block.title || `${block.cards.length} 张卡片`}
        {block.title ? (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {block.cards.length} 张卡片
          </span>
        ) : null}
      </summary>
      <div
        data-card-layout={block.layout}
        data-card-ratio={block.ratio ?? undefined}
        className={cn("mt-3 grid gap-3", CARD_GRID_LAYOUT_CLASS[block.layout])}
        style={cardGridStyle(block)}
      >
        {block.cards.map((card, index) => (
          <DocumentCardButton
            key={`${keyPrefix}-card-${index}`}
            card={card}
            groupTitle={block.title}
            ratio={block.ratio}
            context={context}
          />
        ))}
      </div>
    </details>
  )
}

/**
 * One `::media{asset=...}` figure.
 *
 * `imageUrl` arrives resolved by the API (uploads and shared covers are served
 * by different routes), so this only decides how to fit the artwork and whether
 * to show a caption. An unresolved reference renders its caption text alone,
 * which is what the author sees after deleting the referenced asset.
 */
function DocumentMedia({
  block,
  keyPrefix,
}: {
  block: WikiDocumentMediaBlock
  keyPrefix: string
}) {
  const fit = documentImageFit(block.fit, block.presentationPolicy)
  return (
    <figure key={keyPrefix} className="mt-4">
      {block.imageUrl ? (
        <img
          src={block.imageUrl}
          alt={block.caption}
          data-media-fit={fit}
          className={cn(
            "w-full rounded-lg border bg-muted",
            fit === "contain" ? "object-contain" : "object-cover"
          )}
          style={{ objectFit: fit }}
          loading="lazy"
          decoding="async"
        />
      ) : null}
      {block.caption ? (
        <figcaption className="mt-2 text-center text-xs text-muted-foreground">
          {block.caption}
        </figcaption>
      ) : null}
    </figure>
  )
}

/**
 * `::story-category{name="..."}` / `::story-categories`.
 *
 * The structured card pool is mounted right where the author placed it, through
 * the page-owned renderer, so Modern and Classic keep their own card styling.
 * A category the page's filter emptied is dropped instead of leaving a header
 * with no cards; `collapsed` wraps the pool in a closed `<details>`.
 */
function DocumentStoryCategory({
  block,
  keyPrefix,
  context,
}: {
  block: WikiDocumentStoryCategoryBlock
  keyPrefix: string
  context: DocumentRenderContext
}) {
  const render = context.renderStoryCategory
  const names =
    block.categoryName === null
      ? context.categories.map((category) => category.name)
      : [block.categoryName]
  const matched = context.categories.filter((category) =>
    names.includes(category.name)
  )
  if (!render || !matched.length) return null
  const sections = matched.map((category) => (
    <Fragment key={`${keyPrefix}-${category.name}`}>
      {render({ category, categoryId: storyCategoryAnchorId(category.name) })}
    </Fragment>
  ))
  if (!block.collapsed) {
    return (
      <div key={keyPrefix} data-story-category-embed="" className="mt-8">
        {sections}
      </div>
    )
  }
  return (
    <details
      key={keyPrefix}
      data-story-category-embed=""
      className="mt-6 rounded-lg border px-4 py-3"
    >
      <summary className="cursor-pointer text-sm font-semibold marker:text-muted-foreground">
        {block.categoryName ?? "全部结构化分类"}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {matched.reduce((sum, category) => sum + category.cards.length, 0)}{" "}
          张卡片
        </span>
      </summary>
      <div className="mt-3 space-y-8">{sections}</div>
    </details>
  )
}

function blockNodes(
  blocks: readonly WikiDocumentBlock[],
  keyPrefix: string,
  context: DocumentRenderContext
): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}-${index}`
    switch (block.type) {
      case "heading": {
        const content = inlineNodes(block.children, key)
        const headingClass = cn(
          "scroll-mt-24 font-semibold text-balance",
          block.level === 2
            ? "mt-8 text-xl sm:text-2xl"
            : "mt-6 text-lg sm:text-xl"
        )
        return block.level === 2 ? (
          <h2 key={key} id={block.id} className={headingClass}>
            {content}
          </h2>
        ) : (
          <h3 key={key} id={block.id} className={headingClass}>
            {content}
          </h3>
        )
      }
      case "paragraph":
        return (
          <p key={key} className="mt-3 leading-7 text-pretty">
            {inlineNodes(block.children, key)}
          </p>
        )
      case "blockquote":
        return (
          <blockquote
            key={key}
            className="mt-3 border-l-4 border-border pl-4 text-muted-foreground"
          >
            {blockNodes(block.children, key, context)}
          </blockquote>
        )
      case "list": {
        const items = block.items.map((item, itemIndex) => (
          <li key={`${key}-${itemIndex}`} className="mt-1.5">
            {blockNodes(item.children, `${key}-${itemIndex}`, context)}
          </li>
        ))
        return block.ordered ? (
          <ol
            key={key}
            start={block.start ?? undefined}
            className="mt-3 list-decimal space-y-1 pl-6"
          >
            {items}
          </ol>
        ) : (
          <ul key={key} className="mt-3 list-disc space-y-1 pl-6">
            {items}
          </ul>
        )
      }
      case "table":
        return (
          <div key={key} className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {block.header.map((cell, cellIndex) => (
                    <th
                      key={`${key}-h-${cellIndex}`}
                      scope="col"
                      className={cn(
                        "border-b bg-muted/60 px-3 py-2 font-semibold",
                        alignClass(block.align[cellIndex])
                      )}
                    >
                      {inlineNodes(cell, `${key}-h-${cellIndex}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={`${key}-r-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={`${key}-r-${rowIndex}-${cellIndex}`}
                        className={cn(
                          "border-b px-3 py-2 align-top",
                          alignClass(block.align[cellIndex])
                        )}
                      >
                        {inlineNodes(cell, `${key}-r-${rowIndex}-${cellIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      case "thematicBreak":
        return <hr key={key} className="my-8 border-border" />
      case "callout":
        return (
          <aside
            key={key}
            role="note"
            data-callout={block.tone}
            className={cn(
              "mt-4 rounded-lg border-l-4 px-4 py-3",
              CALLOUT_TONES[block.tone] ?? CALLOUT_TONES.info
            )}
          >
            {block.title ? (
              <p className="text-sm font-semibold">
                {CALLOUT_LABELS[block.tone] ?? "说明"}：{block.title}
              </p>
            ) : null}
            {blockNodes(block.children, key, context)}
          </aside>
        )
      case "details":
        return (
          <details
            key={key}
            open={block.open}
            className="mt-4 rounded-lg border px-4 py-3"
          >
            <summary className="cursor-pointer text-sm font-semibold marker:text-muted-foreground">
              {block.title || "展开查看"}
            </summary>
            <div className="mt-2">
              {blockNodes(block.children, key, context)}
            </div>
          </details>
        )
      case "tabs":
        return (
          <DocumentTabs
            key={key}
            items={block.items}
            keyPrefix={key}
            context={context}
          />
        )
      case "links":
        return (
          <details
            key={key}
            open={!block.collapsed}
            className="mt-4 rounded-lg border px-4 py-3"
          >
            <summary className="cursor-pointer text-sm font-semibold marker:text-muted-foreground">
              {block.title || "来源列表"}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {block.links.length} 条来源
              </span>
            </summary>
            <ul className="mt-2 space-y-2">
              {block.links.map((link, linkIndex) => (
                <li key={`${key}-link-${linkIndex}`}>
                  <StorySourceLinkRow
                    link={link}
                    id={`${key}-link-${linkIndex}`}
                  />
                </li>
              ))}
            </ul>
          </details>
        )
      case "cardGrid":
        return (
          <DocumentCardGrid
            key={key}
            block={block}
            keyPrefix={key}
            context={context}
          />
        )
      case "media":
        return <DocumentMedia key={key} block={block} keyPrefix={key} />
      case "storyCategory":
        return (
          <DocumentStoryCategory
            key={key}
            block={block}
            keyPrefix={key}
            context={context}
          />
        )
      default:
        return null
    }
  })
}

function alignClass(align: "left" | "center" | "right" | null | undefined) {
  if (align === "center") return "text-center"
  if (align === "right") return "text-right"
  return "text-left"
}

/**
 * Renders the server-compiled Enhanced Markdown AST.
 *
 * Public Web and the Tauri App never parse Markdown and never inject HTML:
 * every node here is a typed React element built from the API contract.
 */
export function WikiDocumentRenderer({
  document,
  className,
  query = "",
  highlightedCardId = null,
  categories = [],
  hiddenCategories = [],
  renderStoryCategory,
}: {
  document: WikiPublicStoryDocument
  className?: string
  /** Page keyword search; filters cards, source links, and sections. */
  query?: string
  highlightedCardId?: number | null
  /** Embedded category card pools the page currently shows. */
  categories?: readonly WikiPublicStoryCategory[]
  /** Embedded categories the page's own filter emptied out. */
  hiddenCategories?: readonly string[]
  /** Page-owned renderer for `::story-category` blocks. */
  renderStoryCategory?: (input: {
    category: WikiPublicStoryCategory
    categoryId: string
  }) => ReactNode
}) {
  const [tagState, setTagState] = useState<{
    document: WikiPublicStoryDocument
    tags: string[]
  }>({ document, tags: [] })
  const [selectedCard, setSelectedCard] = useState<StorySourceSelection | null>(
    null
  )
  // A new document payload (another entry) starts from an unfiltered page.
  const activeTags = tagState.document === document ? tagState.tags : []
  const filter = { query, tags: activeTags, hiddenCategories }
  const visibleBlocks = filterDocumentBlocks(document.blocks, filter)
  const context: DocumentRenderContext = {
    highlightedCardId,
    onOpenCard: (card, groupTitle) =>
      setSelectedCard(documentCardSelection(groupTitle, card)),
    categories,
    renderStoryCategory,
  }
  const updateTags = (next: (current: string[]) => string[]) =>
    setTagState((current) => ({
      document,
      tags: next(current.document === document ? current.tags : []),
    }))

  if (!document.blocks.length) return null
  return (
    <article
      data-testid="wiki-document"
      className={cn("max-w-none min-w-0", className)}
    >
      {document.availableTags.length ? (
        <WikiDocumentTagFilter
          tags={document.availableTags}
          selected={activeTags}
          onToggle={(tag) =>
            updateTags((tags) =>
              tags.includes(tag)
                ? tags.filter((currentTag) => currentTag !== tag)
                : [...tags, tag]
            )
          }
          onClear={() => updateTags(() => [])}
        />
      ) : null}
      {visibleBlocks.length ? (
        blockNodes(visibleBlocks, "block", context)
      ) : hasActiveDocumentFilter(filter) ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          没有匹配的内容
        </p>
      ) : null}
      <StorySourceDialog
        selection={selectedCard}
        onClose={() => setSelectedCard(null)}
      />
    </article>
  )
}
