import { Layers3Icon } from "lucide-react"
import { type CSSProperties } from "react"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { WikiDocumentRenderer } from "~/components/wiki/wiki-document-renderer"
import type {
  WikiImageTransform,
  WikiPublicStories,
  WikiPublicStoryCard,
  WikiPublicStoryCategory,
} from "~/lib/api"
import { cn } from "~/lib/utils"
import {
  hasStorySource,
  storyCardAspectRatio,
  storyCardColumns,
  storyCardGap,
} from "~/pages/wiki/wiki-model"

import {
  ClassicSCardCastFilter,
  type ClassicSCardCastFilterProps,
} from "./classic-s-card-cast-filter"

interface ClassicStoryContentProps {
  stories: WikiPublicStories
  categories: WikiPublicStoryCategory[]
  selectedCategory: string
  cardCount: number
  highlightedCardId: number | null
  castFilter: ClassicSCardCastFilterProps | null
  onSelectCategory: (category: string) => void
  onSelectCard: (
    category: WikiPublicStoryCategory,
    card: WikiPublicStoryCard
  ) => void
}

export function ClassicStoryContent({
  stories,
  categories,
  selectedCategory,
  cardCount,
  highlightedCardId,
  castFilter,
  onSelectCategory,
  onSelectCard,
}: ClassicStoryContentProps) {
  return (
    <section className="wiki-classic-story-content">
      {stories.document ? (
        <article className="wiki-classic-story-document">
          <WikiDocumentRenderer
            document={stories.document}
            highlightedCardId={highlightedCardId}
            categories={categories}
            renderStoryCategory={({ category, categoryId }) => (
              <ClassicStoryCategorySection
                category={category}
                categoryId={categoryId}
                fallbackImage={stories.idol.imageUrl}
                fallbackTransform={stories.idol.imageTransform}
                onSelectCard={onSelectCard}
              />
            )}
          />
        </article>
      ) : null}
      {castFilter ? (
        <ClassicSCardCastFilter {...castFilter} />
      ) : (
        <div className="wiki-classic-story-tabs">
          <div>
            <Layers3Icon />
            <strong>分类筛选</strong>
          </div>
          <nav aria-label="剧情分类">
            <button
              type="button"
              className={selectedCategory === "all" ? "is-active" : ""}
              onClick={() => onSelectCategory("all")}
            >
              全部展开
              <small>{cardCount}</small>
            </button>
            {stories.categories.map((category) => (
              <button
                key={category.name}
                type="button"
                className={
                  selectedCategory === category.name ? "is-active" : ""
                }
                onClick={() => onSelectCategory(category.name)}
              >
                {category.name}
                <small>{category.cards.length}</small>
              </button>
            ))}
          </nav>
        </div>
      )}

      {stories.document ? null : (
        <div className="wiki-classic-story-categories">
          {categories.map((category) => (
            <ClassicStoryCategorySection
              key={category.name}
              category={category}
              categoryId={`classic-story-${category.name}`}
              fallbackImage={stories.idol.imageUrl}
              fallbackTransform={stories.idol.imageTransform}
              onSelectCard={onSelectCard}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * One structured category pool in classic styling.
 *
 * Used both by the standalone list of `structured` entries and inline wherever a
 * `document` embeds `::story-category`, so one pool looks identical in both
 * modes.
 */
export function ClassicStoryCategorySection({
  category,
  categoryId,
  fallbackImage,
  fallbackTransform,
  onSelectCard,
}: {
  category: WikiPublicStoryCategory
  categoryId: string
  fallbackImage: string
  fallbackTransform: WikiImageTransform
  onSelectCard: (
    category: WikiPublicStoryCategory,
    card: WikiPublicStoryCard
  ) => void
}) {
  return (
    <section
      id={categoryId}
      className="wiki-classic-story-category"
      aria-labelledby={`${categoryId}-title`}
    >
      <header>
        <h2 id={`${categoryId}-title`}>
          <span>📂</span> ({category.name})
        </h2>
        <small>{category.cards.length} 张卡片</small>
      </header>
      {category.cards.length ? (
        <div
          className="wiki-classic-story-grid"
          style={
            {
              "--classic-story-grid-columns": storyCardColumns(category.name),
              "--classic-story-grid-gap": storyCardGap(category.name),
            } as CSSProperties
          }
        >
          {category.cards.map((card) => {
            const textOnly = !card.img
            const hasStory = hasStorySource(card.links)
            return (
              <button
                key={`${category.name}\u0000${card.name}`}
                type="button"
                className={cn(
                  "wiki-classic-story-card",
                  textOnly && "is-text-only"
                )}
                data-story-state={hasStory ? "available" : "unavailable"}
                aria-label={
                  !hasStory ? `${card.name}，暂无剧情来源` : undefined
                }
                onClick={() => onSelectCard(category, card)}
              >
                {!textOnly ? (
                  <span
                    className="wiki-classic-story-card-image"
                    style={{ aspectRatio: storyCardAspectRatio(category.name) }}
                  >
                    <WikiTransformedImage
                      src={card.img || fallbackImage}
                      alt=""
                      transform={card.imageTransform}
                      fallbackSrc={fallbackImage}
                      fallbackTransform={fallbackTransform}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                ) : null}
                <span className="wiki-classic-story-card-body">
                  <strong>{card.name}</strong>
                  {card.subtitle ? <small>{card.subtitle}</small> : null}
                  <span>{card.links.length} 个来源</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="wiki-classic-story-empty">此分类下暂无剧情</p>
      )}
    </section>
  )
}
