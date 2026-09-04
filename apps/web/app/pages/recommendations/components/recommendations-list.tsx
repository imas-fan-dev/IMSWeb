import { ArrowUpRightIcon, ImageIcon } from "lucide-react"

import { Skeleton } from "~/components/ui/skeleton"
import { resolveSafeMediaUrl, type Recommendation } from "~/lib/api"
import { NavigationLink } from "~/components/navigation/navigation-link"

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
    : dateFormatter.format(date)
}

export function RecommendationRow({ item }: { item: Recommendation }) {
  const href = resolveSafeMediaUrl(item.content)
  const thumbnail = resolveSafeMediaUrl(item.thumbnail)

  const content = (
    <>
      <div className="flex aspect-4/3 w-full items-center justify-center self-start overflow-hidden rounded-md bg-warning/14 text-warning-foreground">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <ImageIcon aria-hidden="true" className="size-6" />
        )}
      </div>
      <div className="min-w-0 py-0.5">
        <p className="text-xs font-medium text-primary">推荐 #{item.id}</p>
        <h2 className="mt-1.5 text-base/6 font-semibold wrap-anywhere group-hover:text-primary sm:text-lg/7">
          {item.title}
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {formatDate(item.date)}
        </p>
      </div>
      {href ? (
        <ArrowUpRightIcon
          aria-hidden="true"
          className="mt-1 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
        />
      ) : null}
    </>
  )

  const className =
    "group grid min-h-36 min-w-0 max-w-full grid-cols-[6.5rem_minmax(0,1fr)_auto] gap-4 border-b py-5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:gap-6"

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
    <article className={className}>{content}</article>
  )
}

export function RecommendationsSkeleton() {
  return (
    <div className="divide-y" aria-label="正在加载推荐">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="grid min-h-36 grid-cols-[6.5rem_minmax(0,1fr)] gap-4 py-5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6"
        >
          <Skeleton className="aspect-4/3 w-full" />
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
