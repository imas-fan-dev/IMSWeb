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
      <article className="relative grid h-36 grid-cols-[6.5rem_minmax(0,1fr)] gap-2 overflow-hidden border-b p-3 transition-colors duration-200 group-hover:bg-muted/30 group-active:bg-muted/45 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
        <span
          className="absolute inset-y-4 left-0 w-px bg-border transition-colors duration-200 group-hover:bg-primary"
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
        </div>

        <div className="flex min-w-0 flex-col justify-center overflow-hidden">
          <h2 className="line-clamp-1 text-base/6 font-semibold wrap-anywhere sm:text-lg/6">
            {event.title}
          </h2>
          <span className="mt-1 w-fit rounded-md bg-accent px-1.5 py-0.5 text-xs/4 font-medium text-accent-foreground">
            {event.kind === "event" ? "具体活动" : "社区动态"}
          </span>
          <div className="mt-1 min-w-0 text-sm/5 text-muted-foreground">
            <div className="flex h-5 min-w-0 items-center gap-1.5">
              <UserRoundIcon aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate" title={event.name || "发布者未署名"}>
                {event.name || "发布者未署名"}
              </span>
            </div>
            <div className="flex h-5 min-w-0 items-center gap-1.5 whitespace-nowrap">
              <CalendarDaysIcon
                aria-hidden="true"
                className="size-3.5 shrink-0"
              />
              {formatDate(event.created_at)}
            </div>
            {event.contact ? (
              <div className="flex h-5 min-w-0 items-center gap-1.5">
                <ContactRoundIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0"
                />
                {/* 整行已经是通往详情页的链接，联系方式不能再嵌一个 a。 */}
                <span
                  className={
                    href ? "min-w-0 truncate text-primary" : "min-w-0 truncate"
                  }
                  title={event.contact}
                >
                  {event.contact}
                </span>
              </div>
            ) : null}
          </div>
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
          className="grid h-36 grid-cols-[6.5rem_minmax(0,1fr)] gap-2 p-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"
        >
          <Skeleton className="aspect-4/3 w-full self-center" />
          <div className="flex min-w-0 flex-col justify-center overflow-hidden">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="mt-1 h-5 w-16" />
            <div className="mt-1 min-w-0">
              <div className="flex h-5 items-center">
                <Skeleton className="h-4 w-2/5" />
              </div>
              <div className="flex h-5 items-center">
                <Skeleton className="h-4 w-1/2" />
              </div>
              <div className="flex h-5 min-w-0 items-center">
                <Skeleton className="h-4 w-3/5" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
