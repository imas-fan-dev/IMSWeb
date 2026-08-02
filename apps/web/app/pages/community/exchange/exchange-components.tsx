import {
  BookmarkIcon,
  Building2Icon,
  EyeIcon,
  HeartIcon,
  MapPinIcon,
  Repeat2Icon,
} from "lucide-react"
import { Link } from "react-router"

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
  FudabaOffice,
  FudabaPlacedCard,
  FudabaSeries,
} from "~/lib/api"
import { cn } from "~/lib/utils"

const seriesTone: Record<string, string> = {
  "765as": "border-franchise-765/45 bg-franchise-765/12",
  cinderella: "border-franchise-cg/45 bg-franchise-cg/12",
  "million-live": "border-franchise-ml/55 bg-franchise-ml/15",
  sidem: "border-franchise-sidem/45 bg-franchise-sidem/12",
  "shiny-colors": "border-franchise-sc/55 bg-franchise-sc/15",
  gakuen: "border-franchise-gk/55 bg-franchise-gk/15",
}

export function SeriesBadge({
  code,
  series,
}: {
  code: string
  series: ReadonlyMap<string, FudabaSeries>
}) {
  return (
    <Badge
      variant="outline"
      className={cn("max-w-full", seriesTone[code] ?? "bg-muted")}
    >
      <span className="truncate">{series.get(code)?.displayName ?? code}</span>
    </Badge>
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
            <Link
              to={`/community/exchange/offices/${encodeURIComponent(office.slug)}`}
              className="rounded-sm outline-none after:absolute after:inset-0 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {office.name}
            </Link>
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
            <span className="truncate">{office.city}</span>
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
        {office.seriesCodes.map((code) => (
          <SeriesBadge key={code} code={code} series={series} />
        ))}
      </CardFooter>
    </Card>
  )
}

function CardMediaPair({ card }: { card: FudabaCard }) {
  return (
    <div className="grid grid-cols-2 gap-px border-b bg-border">
      <CoverImagePreview
        src={card.frontImageUrl}
        alt={`${card.displayName}正面`}
        previewLabel="名片"
        className="aspect-3/2 rounded-none bg-muted"
        imageClassName="object-contain"
      />
      <CoverImagePreview
        src={card.backImageUrl}
        alt={`${card.displayName}背面`}
        previewLabel="名片"
        className="aspect-3/2 rounded-none bg-muted"
        imageClassName="object-contain"
      />
    </div>
  )
}

export function ExchangeCard({
  card,
  series,
}: {
  card: FudabaCard
  series: ReadonlyMap<string, FudabaSeries>
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
            {card.displayName}
          </CardTitle>
          <Badge variant={card.available ? "default" : "secondary"}>
            {card.available ? "可交换" : "仅展示"}
          </Badge>
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {card.producerName}
          {card.favoriteIdol ? ` · ${card.favoriteIdol}` : ""}
        </p>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="line-clamp-2 text-sm/6 text-muted-foreground">
          {card.tradeNote || card.bio || "暂未填写交换说明。"}
        </p>
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-3">
        <SeriesBadge code={card.seriesCode} series={series} />
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <span
            className="inline-flex items-center gap-1"
            aria-label={`${card.interactions.likes} 次点赞`}
          >
            <HeartIcon
              className={cn(
                "size-3.5",
                card.interactions.viewerLiked && "fill-current"
              )}
              aria-hidden="true"
            />
            {card.interactions.likes}
          </span>
          <span
            className="inline-flex items-center gap-1"
            aria-label={`${card.interactions.favorites} 次收藏`}
          >
            <BookmarkIcon
              className={cn(
                "size-3.5",
                card.interactions.viewerFavorited && "fill-current"
              )}
              aria-hidden="true"
            />
            {card.interactions.favorites}
          </span>
        </span>
      </CardFooter>
    </Card>
  )
}

export function PlacedCardWall({ cards }: { cards: FudabaPlacedCard[] }) {
  return (
    <div
      className="relative min-h-96 overflow-hidden border bg-muted/40 sm:aspect-video sm:min-h-0"
      aria-label="名片墙放置区域"
    >
      <SeriesAccentStrip className="absolute inset-x-0 top-0 h-1" />
      {cards.map((card) => (
        <div
          key={card.id}
          className="absolute w-[clamp(7rem,18vw,13rem)] [--wall-x-inset:4.5rem] [--wall-y-inset:3.5rem] sm:[--wall-x-inset:7.5rem] sm:[--wall-y-inset:6rem]"
          style={{
            left: `clamp(var(--wall-x-inset), ${card.placement.x}%, calc(100% - var(--wall-x-inset)))`,
            top: `clamp(var(--wall-y-inset), ${card.placement.y}%, calc(100% - var(--wall-y-inset)))`,
            zIndex: card.placement.zIndex,
            transform: `translate(-50%, -50%) rotate(${card.placement.rotation}deg)`,
          }}
        >
          <CoverImagePreview
            src={card.frontImageUrl}
            alt={`${card.displayName}正面`}
            previewLabel="名片"
            className="aspect-3/2 w-full border bg-card shadow-sm"
            imageClassName="object-contain"
          />
        </div>
      ))}
      <div className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-1.5 border bg-background/90 px-2 py-1 text-xs text-muted-foreground">
        <Repeat2Icon className="size-3.5" aria-hidden="true" />
        {cards.length} 张名片
      </div>
    </div>
  )
}
