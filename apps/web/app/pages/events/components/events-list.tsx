import {
  CalendarDaysIcon,
  ContactRoundIcon,
  ImageIcon,
  UserRoundIcon,
} from "lucide-react"

import { editorialCoverStyle } from "~/components/editorial/editorial-cover"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { Skeleton } from "~/components/ui/skeleton"
import type { EventListItem } from "~/lib/api"

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
})

function formatDate(value?: string | null) {
  if (!value) return "发布时间待补充"
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? "发布时间待补充"
    : `${dateFormatter.format(date)}发布`
}

function contactUrl(value?: string | null) {
  const candidate = value?.trim()
  if (!candidate || !/^https?:\/\/\S+$/i.test(candidate)) return null
  try {
    return new URL(candidate).href
  } catch {
    return null
  }
}

function safeImageUrl(value?: string | null) {
  const candidate = value?.trim()
  if (!candidate || candidate.startsWith("//")) return null
  if (candidate.startsWith("/")) return candidate

  try {
    const url = new URL(candidate)
    return url.protocol === "http:" || url.protocol === "https:"
      ? candidate
      : null
  } catch {
    return null
  }
}

export function EventRow({ event }: { event: EventListItem }) {
  // The endpoint normalizer owns API-origin resolution. The contract accepts a
  // plain string, so this render boundary only rejects unsafe URL schemes.
  const imageUrl = safeImageUrl(event.image_url)
  const href = contactUrl(event.contact)

  return (
    <NavigationLink
      href={`/events/${encodeURIComponent(event.id)}`}
      className="group block rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <article className="relative grid h-44 grid-cols-[6.5rem_minmax(0,1fr)] gap-4 overflow-hidden border-b p-4 transition-colors duration-200 group-hover:bg-muted/30 group-active:bg-muted/45 sm:grid-cols-[10.5rem_minmax(0,1fr)] sm:gap-5 sm:px-5">
        <span
          className="absolute inset-y-5 left-0 w-px bg-border transition-colors duration-200 group-hover:bg-primary"
          aria-hidden="true"
        />
        <div className="relative flex aspect-4/3 w-full items-center justify-center self-center overflow-hidden rounded-md border bg-muted/55 text-muted-foreground shadow-xs">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`${event.title}封面`}
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
              style={editorialCoverStyle(event.cover_transform)}
            />
          ) : (
            <ImageIcon aria-hidden="true" className="size-6" />
          )}
          <span
            className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-b from-black/20 to-transparent"
            aria-hidden="true"
          />
          <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-background/88 px-2 py-1 text-xs font-medium text-foreground opacity-100 shadow-sm backdrop-blur-sm transition-opacity duration-200 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
            {event.kind === "event" ? "具体活动" : "社区动态"}
          </span>
        </div>

        <div className="flex min-w-0 flex-col py-0.5">
          <h2 className="line-clamp-2 text-base/6 font-semibold wrap-anywhere whitespace-pre-line sm:text-lg/6">
            {event.title}
          </h2>
          {event.summary ? (
            <p className="mt-1 line-clamp-1 text-sm/6 wrap-anywhere text-muted-foreground">
              {event.summary}
            </p>
          ) : null}
          <div className="mt-2 flex min-w-0 flex-nowrap items-center gap-2 border-t border-border/70 pt-2 text-sm text-muted-foreground">
            <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
              <UserRoundIcon aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate" title={event.name || "发布者未署名"}>
                {event.name || "发布者未署名"}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5">
              <CalendarDaysIcon aria-hidden="true" className="size-3.5" />
              {formatDate(event.created_at)}
            </span>
          </div>
          {event.contact ? (
            <div className="mt-1 flex min-w-0 items-start gap-1.5 text-sm/5 text-muted-foreground">
              <ContactRoundIcon
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              {/* 整行已经是通往详情页的链接，联系方式不能再嵌一个 a。 */}
              <span
                className={
                  href
                    ? "line-clamp-1 min-w-0 break-all text-primary"
                    : "line-clamp-1 min-w-0 wrap-anywhere whitespace-pre-line"
                }
                title={event.contact}
              >
                {event.contact}
              </span>
            </div>
          ) : null}
        </div>
      </article>
    </NavigationLink>
  )
}

export function EventsSkeleton() {
  return (
    <div className="divide-y" aria-label="正在加载活动">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="grid h-44 grid-cols-[6.5rem_minmax(0,1fr)] gap-4 p-4 sm:grid-cols-[10.5rem_minmax(0,1fr)] sm:gap-5 sm:px-5"
        >
          <Skeleton className="aspect-4/3 w-full self-center" />
          <div className="space-y-3 py-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  )
}
