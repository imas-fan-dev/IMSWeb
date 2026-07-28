import { ExternalLinkIcon, UserRoundIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import type { WikiImageTransform, WikiPublicStoryCategory } from "~/shared/api"

import { safeExternalStoryUrl, safeWikiColor } from "../wiki-model"

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {category.cards.map((card) => {
          const cardKey = `${category.name}\u0000${card.name}`
          return (
            <Card key={cardKey} className="rounded-lg py-0">
              <div className="aspect-16/10 overflow-hidden bg-muted">
                <WikiTransformedImage
                  src={card.img || fallbackImage}
                  alt={card.name}
                  transform={card.img ? card.imageTransform : fallbackTransform}
                  fallbackSrc={fallbackImage}
                  fallbackTransform={fallbackTransform}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <CardHeader className="pt-4">
                <h3 className="font-heading text-base/snug font-medium">
                  {card.name}
                </h3>
                {card.subtitle ? (
                  <CardDescription>{card.subtitle}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-2 pb-4">
                {card.links.map((link) => {
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
                })}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
