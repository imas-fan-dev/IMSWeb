import { Building2Icon, EyeIcon, MapPinIcon } from "lucide-react"

import { CoverImagePreview } from "~/components/shared/cover-image-preview"
import { SeriesAccentStrip } from "~/components/shared/series-accent-strip"
import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import type {
  FudabaCard,
  FudabaCardInteractions,
  FudabaOffice,
  FudabaSeries,
} from "~/lib/api"
import { cn } from "~/lib/utils"
import { cardLabel } from "./card-label"
import {
  CardInteractionBar,
  CardInteractionScope,
} from "./exchange-card-interactions"
import { CardReactionArea } from "./exchange-card-reaction-area"
import { ExchangeCardPreviewActions } from "./exchange-card-preview-actions"
import { NavigationLink } from "~/components/navigation/navigation-link"

export { PlacedCardWall } from "./exchange-card-wall"
export { CardInteractionBar } from "./exchange-card-interactions"
export { CardReactionBar } from "./exchange-card-reactions"

/** A card belongs to one or more series; every code gets its own chip. */
export function SeriesBadge({
  codes,
  series,
}: {
  codes: readonly string[]
  series: ReadonlyMap<string, FudabaSeries>
}) {
  return (
    <>
      {codes.map((code) => {
        const catalogSeries = series.get(code)
        return (
          <Badge
            key={code}
            variant="outline"
            className={cn("max-w-full", !catalogSeries && "bg-muted")}
            style={
              catalogSeries
                ? {
                    borderColor: catalogSeries.color,
                    backgroundColor: `color-mix(in srgb, ${catalogSeries.color} 12%, transparent)`,
                  }
                : undefined
            }
          >
            <span className="truncate">
              {catalogSeries?.displayName ?? code}
            </span>
          </Badge>
        )
      })}
    </>
  )
}

export function OfficeCard({
  office,
  series,
}: {
  office: FudabaOffice
  series: ReadonlyMap<string, FudabaSeries>
}) {
  return (
    <Card
      className="group relative h-full overflow-hidden border-t-2 transition-colors hover:border-foreground/25"
      style={{ borderTopColor: office.accent }}
    >
      {office.coverUrl ? (
        <div className="aspect-16/7 overflow-hidden border-b bg-muted">
          <img
            src={office.coverUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
          />
        </div>
      ) : (
        <div className="relative flex aspect-16/7 items-center justify-center overflow-hidden border-b bg-muted/60">
          <SeriesAccentStrip className="absolute inset-x-0 top-0 h-1" />
          <Building2Icon
            className="size-8 text-muted-foreground/70"
            aria-hidden="true"
          />
        </div>
      )}
      <CardHeader className="gap-2">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <CardTitle className="min-w-0 truncate text-base">
            <NavigationLink
              to={`/community/exchange/offices/${encodeURIComponent(office.slug)}`}
              className="rounded-sm outline-none after:absolute after:inset-0 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {office.name}
            </NavigationLink>
          </CardTitle>
          <Badge
            variant="secondary"
            className={cn(
              office.isOpen
                ? "bg-success/20 text-success-foreground"
                : "text-muted-foreground"
            )}
          >
            {office.isOpen ? "开放交换" : "暂未开放"}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPinIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{office.address}</span>
          </span>
          <span
            className="inline-flex items-center gap-1.5"
            aria-label={`${office.visitorCount.toLocaleString("zh-CN")} 次访问`}
          >
            <EyeIcon className="size-3.5" aria-hidden="true" />
            {office.visitorCount.toLocaleString("zh-CN")}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="line-clamp-2 text-sm/6 text-muted-foreground">
          {office.intro || "事务所暂未填写介绍。"}
        </p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-1.5">
        <SeriesBadge codes={office.seriesCodes} series={series} />
      </CardFooter>
    </Card>
  )
}

function CardMediaPair({ card }: { card: FudabaCard }) {
  return (
    <div
      className={
        card.backImageUrl
          ? "grid grid-cols-2 gap-px border-b bg-border"
          : "grid grid-cols-1 gap-px border-b bg-border"
      }
    >
      <CoverImagePreview
        src={card.frontImageUrl}
        alt={`${cardLabel(card)}正面`}
        previewLabel="名片"
        previewActions={<ExchangeCardPreviewActions card={card} />}
        className="aspect-3/2 rounded-none bg-muted"
        imageClassName="object-contain"
      />
      {card.backImageUrl ? (
        <CoverImagePreview
          src={card.backImageUrl}
          alt={`${cardLabel(card)}背面`}
          previewLabel="名片"
          previewActions={<ExchangeCardPreviewActions card={card} />}
          className="aspect-3/2 rounded-none bg-muted"
          imageClassName="object-contain"
        />
      ) : null}
    </div>
  )
}

function ExchangeCardContent({
  card,
  series,
  onInteractionsChange,
}: {
  card: FudabaCard
  series: ReadonlyMap<string, FudabaSeries>
  onInteractionsChange?: (interactions: FudabaCardInteractions) => void
}) {
  return (
    <Card
      className="h-full overflow-hidden border-t-2"
      style={{ borderTopColor: card.accent }}
    >
      <CardMediaPair card={card} />
      <CardHeader className="gap-2">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <CardTitle className="min-w-0 truncate text-sm">
            {card.producerName}
          </CardTitle>
          <Badge
            variant={card.exchangeMode === "none" ? "secondary" : "default"}
          >
            {card.exchangeMode === "none"
              ? "仅展示"
              : card.exchangeMode === "auto"
                ? "自动交换"
                : "可交换"}
          </Badge>
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {card.seriesCodes
            .map((code) => series.get(code)?.displayName ?? code)
            .join(" · ")}
        </p>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="line-clamp-2 text-sm/6 text-muted-foreground">
          {card.tradeNote || card.bio || "暂未填写交换说明。"}
        </p>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2">
        <div className="flex items-center justify-between gap-3">
          <SeriesBadge codes={card.seriesCodes} series={series} />
          <CardInteractionBar card={card} onChange={onInteractionsChange} />
        </div>
        <CardReactionArea cardId={card.id} />
      </CardFooter>
    </Card>
  )
}

export function ExchangeCard(props: Parameters<typeof ExchangeCardContent>[0]) {
  return (
    <CardInteractionScope>
      <ExchangeCardContent {...props} />
    </CardInteractionScope>
  )
}
