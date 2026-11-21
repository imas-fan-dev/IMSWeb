import type { CSSProperties } from "react"
import { useState } from "react"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { StorySourceDialog } from "~/components/wiki/story-source-dialog"
import { structuredCardSelection } from "~/components/wiki/story-source-model"
import { cn } from "~/lib/utils"
import type {
  WikiImageTransform,
  WikiPublicStoryCard,
  WikiPublicStoryCategory,
} from "~/lib/api"

import {
  hasStorySource,
  isPortraitStoryCategory,
  safeWikiColor,
  storyCardAspectRatio,
  storyCardColumns,
  storyCardGap,
} from "~/pages/wiki/wiki-model"

export function StoryCategorySection({
  category,
  categoryId,
  fallbackImage,
  fallbackTransform,
  accentColor,
  highlightedCardId,
}: {
  category: WikiPublicStoryCategory
  categoryId: string
  fallbackImage: string
  fallbackTransform: WikiImageTransform
  accentColor: string
  highlightedCardId: number | null
}) {
  const [selectedCard, setSelectedCard] = useState<WikiPublicStoryCard | null>(
    null
  )
  const portraitCards = isPortraitStoryCategory(category.name)

  return (
    <section
      id={categoryId}
      aria-labelledby={`${categoryId}-title`}
      className="scroll-mt-20"
    >
      <div className="mb-4 flex items-end justify-between gap-4 border-b pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-8 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: safeWikiColor(accentColor) }}
            aria-hidden="true"
          />
          <h2
            id={`${categoryId}-title`}
            className="text-xl font-semibold wrap-break-word"
          >
            {category.name}
          </h2>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {category.cards.length} 张卡片
        </span>
      </div>

      <div
        className={cn(
          "grid grid-cols-2 gap-3 sm:grid-cols-(--story-card-columns) sm:gap-(--story-card-gap)",
          portraitCards && "grid-cols-3 gap-2"
        )}
        data-card-layout={portraitCards ? "portrait" : "landscape"}
        style={
          {
            "--story-card-columns": storyCardColumns(category.name),
            "--story-card-gap": storyCardGap(category.name),
          } as CSSProperties
        }
      >
        {category.cards.map((card) => {
          const cardKey = `${category.name}\u0000${card.name}`
          const textOnly = !card.img
          const hasStory = hasStorySource(card.links)
          const isTargetCard = card.id === highlightedCardId
          return (
            <button
              key={cardKey}
              id={`story-card-${card.id}`}
              type="button"
              className={cn(
                textOnly
                  ? "flex min-h-13 items-center justify-center rounded-lg border bg-card px-4 py-3 text-center text-[15px] font-bold shadow-sm transition-all duration-500 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  : "overflow-hidden rounded-lg border bg-card text-left shadow-sm transition-[box-shadow,filter,opacity,transform] duration-500 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                !hasStory &&
                  "opacity-60 grayscale hover:opacity-80 focus-visible:opacity-80",
                "scroll-mt-24",
                isTargetCard && "shadow-lg ring-3 ring-primary ring-offset-3"
              )}
              data-story-state={hasStory ? "available" : "unavailable"}
              data-cover-target={isTargetCard ? "true" : undefined}
              aria-label={!hasStory ? `${card.name}，暂无剧情来源` : undefined}
              onClick={() => setSelectedCard(card)}
            >
              {textOnly ? (
                <span className="wrap-break-word">{card.name}</span>
              ) : (
                <>
                  <div
                    className="overflow-hidden bg-muted"
                    style={{
                      aspectRatio: storyCardAspectRatio(category.name),
                    }}
                  >
                    <WikiTransformedImage
                      src={card.img}
                      alt={card.name}
                      transform={card.imageTransform}
                      fallbackSrc={fallbackImage}
                      fallbackTransform={fallbackTransform}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className="space-y-1 p-2 sm:px-4 sm:py-3">
                    <h3 className="font-heading text-sm/snug font-medium wrap-break-word sm:text-base/snug">
                      {card.name}
                    </h3>
                    {card.subtitle ? (
                      <p className="text-xs wrap-break-word text-muted-foreground sm:text-sm">
                        {card.subtitle}
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </button>
          )
        })}
      </div>

      <StorySourceDialog
        selection={
          selectedCard
            ? structuredCardSelection(category.name, selectedCard)
            : null
        }
        onClose={() => setSelectedCard(null)}
      />
    </section>
  )
}
