import { ExternalLinkIcon, UserRoundIcon } from "lucide-react"
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
import type {
  WikiImageTransform,
  WikiPublicStoryCard,
  WikiPublicStoryCategory,
} from "~/shared/api"

import {
  safeExternalStoryUrl,
  safeWikiColor,
  storyCardAspectRatio,
  storyCardColumns,
  storyCardGap,
} from "../wiki-model"

export function StoryCategorySection({
  category,
  categoryId,
  fallbackImage,
  fallbackTransform,
  accentColor,
}: {
  category: WikiPublicStoryCategory
  categoryId: string
  fallbackImage: string
  fallbackTransform: WikiImageTransform
  accentColor: string
}) {
  const [selectedCard, setSelectedCard] = useState<WikiPublicStoryCard | null>(
    null
  )

  return (
    <section id={categoryId} aria-labelledby={`${categoryId}-title`}>
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
        className="grid"
        style={{
          gridTemplateColumns: storyCardColumns(category.name),
          gap: storyCardGap(category.name),
        }}
      >
        {category.cards.map((card) => {
          const cardKey = `${category.name}\u0000${card.name}`
          const textOnly = !card.img
          const accentColorValue = safeWikiColor(accentColor)
          return (
            <button
              key={cardKey}
              type="button"
              className={
                textOnly
                  ? "flex min-h-13 items-center justify-center rounded-lg border-2 bg-white px-4 py-3 text-center text-[15px] font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  : "overflow-hidden rounded-lg border bg-card text-left shadow-sm transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              }
              style={
                textOnly
                  ? {
                      borderColor: accentColorValue,
                      color: accentColorValue,
                    }
                  : undefined
              }
              onMouseEnter={
                textOnly
                  ? (event) => {
                      event.currentTarget.style.backgroundColor =
                        accentColorValue
                      event.currentTarget.style.color = "#fff"
                    }
                  : undefined
              }
              onMouseLeave={
                textOnly
                  ? (event) => {
                      event.currentTarget.style.backgroundColor = ""
                      event.currentTarget.style.color = accentColorValue
                    }
                  : undefined
              }
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
                  <div className="space-y-1 px-4 py-3">
                    <h3 className="font-heading text-base/snug font-medium">
                      {card.name}
                    </h3>
                    {card.subtitle ? (
                      <p className="text-sm text-muted-foreground">
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
