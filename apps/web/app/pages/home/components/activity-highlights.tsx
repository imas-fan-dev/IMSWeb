import { useRequest } from "alova/client"
import { ArrowRightIcon } from "lucide-react"

import { editorialCoverStyle } from "~/components/editorial/editorial-cover"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { CoverImagePreview } from "~/components/shared/cover-image-preview"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Skeleton } from "~/components/ui/skeleton"
import { getCommunitySpotlight } from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"
import { cn } from "~/lib/utils"

export function ActivityHighlights() {
  const { data, loading, error, onError } = useRequest(
    getCommunitySpotlight(),
    {
      initialData: { items: [] },
    }
  )
  onError(() => undefined)
  const items = data.items.map((item) => ({
    category: item.category === "activity" ? "活动资讯" : "同人活动",
    title: item.title,
    href: `/events/${item.id}`,
    image: item.image_url ?? "",
    coverTransform: item.cover_transform,
  }))

  return (
    <section
      className="border-y bg-muted/20"
      aria-labelledby="highlights-heading"
    >
      <div
        className={cn(
          "mx-auto w-full max-w-7xl py-12",
          IS_APP_TARGET ? "px-(--app-safe-inline)" : "px-4 sm:px-6 lg:px-8"
        )}
      >
        <div className="mb-7">
          <p className="text-xs font-semibold text-primary">SPOTLIGHTS</p>
          <h2 id="highlights-heading" className="mt-2 text-2xl font-semibold">
            活动资讯与同人活动
          </h2>
        </div>
        {loading ? (
          <div
            className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 md:grid-cols-3"
            role="status"
            aria-label="正在加载活动资讯"
          >
            {[0, 1, 2].map((item) => (
              <div key={item} className="overflow-hidden rounded-md border">
                <Skeleton className="aspect-video w-full" />
                <div className="space-y-2 p-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <Alert>
            <AlertTitle>活动资讯暂时不可用</AlertTitle>
            <AlertDescription>稍后刷新即可重新获取。</AlertDescription>
          </Alert>
        ) : items.length ? (
          <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 md:grid-cols-3">
            {items.map((item) => (
              <article
                key={item.href + item.title}
                className="group overflow-hidden rounded-md border bg-card transition-colors hover:border-foreground/25"
              >
                <CoverImagePreview
                  src={item.image}
                  alt={`${item.title}封面`}
                  className="aspect-video w-full rounded-none bg-muted"
                  imageClassName="transition-transform duration-300 group-hover:scale-[1.025]"
                  imageStyle={editorialCoverStyle(item.coverTransform)}
                />
                <NavigationLink
                  href={item.href}
                  className="flex min-h-20 items-center gap-3 px-4 py-3 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-primary">
                      {item.category}
                    </span>
                    <span className="mt-1 line-clamp-2 block font-medium wrap-anywhere">
                      {item.title}
                    </span>
                  </span>
                  <ArrowRightIcon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </NavigationLink>
              </article>
            ))}
          </div>
        ) : (
          <p className="border-y py-8 text-sm text-muted-foreground">
            当前没有已发布的活动资讯。
          </p>
        )}
      </div>
    </section>
  )
}
