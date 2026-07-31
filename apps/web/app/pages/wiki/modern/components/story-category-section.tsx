import { ExternalLinkIcon, UserRoundIcon } from "lucide-react"
import type { CSSProperties } from "react"
import { useState } from "react"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { Badge } from "~/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { cn } from "~/lib/utils"
import type {
  WikiImageTransform,
  WikiPublicStoryCard,
  WikiPublicStoryCategory,
} from "~/lib/api"

import {
  isPortraitStoryCategory,
  safeExternalStoryUrl,
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
          const hasSources = card.links.length > 0
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
                !hasSources &&
                  "opacity-60 grayscale hover:opacity-80 focus-visible:opacity-80",
                "scroll-mt-24",
                isTargetCard && "shadow-lg ring-3 ring-primary ring-offset-3"
              )}
              data-source-state={hasSources ? "available" : "empty"}
              data-cover-target={isTargetCard ? "true" : undefined}
              aria-label={!hasSources ? `${card.name}，暂无来源` : undefined}
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

      <Dialog
        open={selectedCard !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCard(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <p className="text-sm text-muted-foreground">{category.name}</p>
            <DialogTitle>{selectedCard?.name}</DialogTitle>
            {selectedCard?.subtitle ? (
              <DialogDescription>{selectedCard.subtitle}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="space-y-2">
            {selectedCard?.links.length ? (
              selectedCard.links.map((link) => {
                const href = safeExternalStoryUrl(link.url)
                const label = link.title || "查看剧情"
                return href ? (
                  <a
                    key={link.id}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="group/link flex min-h-12 items-center gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <UserRoundIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex flex-wrap gap-1.5">
                        <Badge variant="secondary">{link.contentType}</Badge>
                        <Badge variant="outline">{link.sourcePlatform}</Badge>
                      </span>
                      <span className="block text-sm font-medium wrap-break-word">
                        {label}
                      </span>
                      <span className="block text-xs wrap-break-word text-muted-foreground">
                        {link.up || "未知发布者"}
                      </span>
                    </span>
                    <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground group-hover/link:text-foreground" />
                  </a>
                ) : (
                  <div
                    key={link.id}
                    className="rounded-md border border-dashed px-3 py-2"
                  >
                    <span className="mb-1 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{link.contentType}</Badge>
                      <Badge variant="outline">{link.sourcePlatform}</Badge>
                    </span>
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {link.up || "未知发布者"} · 链接不可用
                    </span>
                  </div>
                )
              })
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                暂无可用剧情来源
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
