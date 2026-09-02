import { ArrowUpRightIcon, CalendarDaysIcon, ImageIcon } from "lucide-react"

import { CoverImagePreview } from "~/components/shared/cover-image-preview"
import { editorialCoverStyle } from "~/components/editorial/editorial-cover"
import { Skeleton } from "~/components/ui/skeleton"
import { resolveSafeMediaUrl, type HomeEvent, type HomeNews } from "~/lib/api"
import { NavigationLink } from "~/components/navigation/navigation-link"

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function formatDate(value?: string | null) {
  if (!value) return "日期待定"
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? "日期待定" : dateFormatter.format(date)
}

export function HomeFeedSkeleton() {
  return (
    <div className="grid gap-3" aria-label="正在加载">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex items-center gap-3 border-b pb-3">
          <Skeleton className="h-16 w-20 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function HomeEventRow({ event }: { event: HomeEvent }) {
  const imageUrl = resolveSafeMediaUrl(event.image_url)
  const byline = `${event.name || "发布者未署名"} · ${formatDate(
    event.created_at
  )}`

  return (
    <div className="group grid min-h-24 grid-cols-[5rem_minmax(0,1fr)] gap-3 py-4">
      <span className="flex h-16 w-20 items-center justify-center overflow-hidden rounded-md bg-info/12 text-info">
        {imageUrl ? (
          <CoverImagePreview
            src={imageUrl}
            alt={`${event.title}封面`}
            className="size-full"
            imageStyle={editorialCoverStyle(event.cover_transform)}
          />
        ) : (
          <CalendarDaysIcon aria-hidden="true" className="size-5" />
        )}
      </span>
      <NavigationLink
        href={`/events/${event.id}`}
        className="min-w-0 rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span
          className="line-clamp-2 text-sm font-medium wrap-break-word whitespace-pre-line group-hover:text-primary"
          title={event.title ?? undefined}
        >
          {event.title}
        </span>
        <span
          className="mt-1.5 block truncate text-xs text-muted-foreground"
          title={byline}
        >
          {byline}
        </span>
        {event.contact ? (
          <span
            className="mt-1 block truncate text-xs text-muted-foreground"
            title={event.contact}
          >
            {event.contact}
          </span>
        ) : null}
      </NavigationLink>
    </div>
  )
}

export function HomeNewsRow({ item }: { item: HomeNews }) {
  const href = resolveSafeMediaUrl(item.content)
  const thumbnail = resolveSafeMediaUrl(item.thumbnail)
  const content = (
    <>
      <span className="flex h-16 w-20 items-center justify-center overflow-hidden rounded-md bg-warning/14 text-warning-foreground">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <ImageIcon aria-hidden="true" className="size-5" />
        )}
      </span>
      <span className="min-w-0">
        <span
          className="line-clamp-2 text-sm font-medium wrap-break-word group-hover:text-primary"
          title={item.title}
        >
          {item.title}
        </span>
        <span className="mt-1.5 block text-xs text-muted-foreground">
          {formatDate(item.date)}
        </span>
      </span>
      {href ? (
        <ArrowUpRightIcon
          aria-hidden="true"
          className="ml-auto size-4 shrink-0 self-center text-muted-foreground"
        />
      ) : null}
    </>
  )

  const className =
    "group grid min-h-24 grid-cols-[5rem_minmax(0,1fr)_auto] gap-3 py-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

  return href ? (
    <NavigationLink
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
    >
      {content}
    </NavigationLink>
  ) : (
    <div className={className}>{content}</div>
  )
}
