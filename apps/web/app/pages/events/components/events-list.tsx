import {
  CalendarDaysIcon,
  ContactRoundIcon,
  ImageIcon,
  UserRoundIcon,
} from "lucide-react"

import { CoverImagePreview } from "~/components/shared/cover-image-preview"
import { Skeleton } from "~/components/ui/skeleton"
import type { EventListItem } from "~/shared/api"

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

function safeImageUrl(value?: string | null) {
  if (!value) return null
  try {
    const origin =
      typeof window === "undefined"
        ? "https://imsweb.invalid"
        : window.location.origin
    const url = new URL(value, origin)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null
  } catch {
    return null
  }
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

export function EventRow({ event }: { event: EventListItem }) {
  const imageUrl = safeImageUrl(event.image_url)
  const href = contactUrl(event.contact)

  return (
    <article className="grid min-h-36 grid-cols-[6.5rem_minmax(0,1fr)] gap-4 border-b py-5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
      <div className="flex aspect-[4/3] w-full items-center justify-center self-start overflow-hidden rounded-md bg-info/12 text-info">
        {imageUrl ? (
          <CoverImagePreview
            src={imageUrl}
            alt={`${event.title}封面`}
            className="size-full"
          />
        ) : (
          <ImageIcon aria-hidden="true" className="size-6" />
        )}
      </div>

      <div className="min-w-0 py-0.5">
        <p className="text-xs font-medium text-primary">活动 #{event.id}</p>
        <h2 className="mt-1.5 text-base leading-6 font-semibold whitespace-pre-line sm:text-lg sm:leading-7">
          {event.title}
        </h2>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <UserRoundIcon aria-hidden="true" className="size-3.5" />
            {event.name || "发布者未署名"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDaysIcon aria-hidden="true" className="size-3.5" />
            {formatDate(event.created_at)}
          </span>
        </div>
        {event.contact ? (
          <div className="mt-2 flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
            <ContactRoundIcon
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0"
            />
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 break-all text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {event.contact}
              </a>
            ) : (
              <span className="min-w-0 [overflow-wrap:anywhere] whitespace-pre-line">
                {event.contact}
              </span>
            )}
          </div>
        ) : null}
      </div>
    </article>
  )
}

export function EventsSkeleton() {
  return (
    <div className="divide-y" aria-label="正在加载活动">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="grid min-h-36 grid-cols-[6.5rem_minmax(0,1fr)] gap-4 py-5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6"
        >
          <Skeleton className="aspect-[4/3] w-full" />
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
