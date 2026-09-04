import { ArrowRightIcon, ExternalLinkIcon } from "lucide-react"

import {
  homepageLinkAccentClasses,
  homepageLinkIcons,
} from "~/components/homepage/homepage-link-options"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { Skeleton } from "~/components/ui/skeleton"
import type { HomepageLink } from "~/lib/api"
import { cn } from "~/lib/utils"

export function isExternalHomepageLink(href: string) {
  return href.startsWith("http://") || href.startsWith("https://")
}

function HomepageLinkTile({ item }: { item: HomepageLink }) {
  const Icon = homepageLinkIcons[item.icon]
  const external = isExternalHomepageLink(item.href)

  return (
    <NavigationLink
      href={item.href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="group relative flex min-h-16 items-center gap-3 overflow-hidden rounded-md border bg-card p-3 transition-colors hover:border-foreground/25 hover:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-24 sm:gap-4 sm:px-5 sm:py-4"
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          homepageLinkAccentClasses[item.accent]
        )}
        aria-hidden="true"
      />
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground sm:size-10">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm/5 font-medium wrap-break-word sm:text-base">
          {item.title}
        </span>
        <span
          className="mt-1 block text-sm text-muted-foreground max-sm:sr-only"
          data-testid="portal-link-description"
        >
          {item.description}
        </span>
        {external ? <span className="sr-only">（外部链接）</span> : null}
      </span>
      {external ? (
        <ExternalLinkIcon
          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          aria-hidden="true"
          data-testid="external-link-icon"
        />
      ) : (
        <ArrowRightIcon
          className="hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
          aria-hidden="true"
        />
      )}
    </NavigationLink>
  )
}

export function HomepageLinkGrid({ items }: { items: HomepageLink[] }) {
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3"
      data-testid="portal-directory-grid"
    >
      {items.map((item) => (
        <HomepageLinkTile key={item.id} item={item} />
      ))}
    </div>
  )
}

export function HomepageLinkGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3"
      role="status"
      aria-label="正在加载应用"
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-md sm:h-24" />
      ))}
    </div>
  )
}

export function HomepageCompactLinkList({
  items,
  labelledBy,
}: {
  items: HomepageLink[]
  labelledBy: string
}) {
  return (
    <div
      className="grid grid-cols-2 gap-x-3 border-y"
      aria-labelledby={labelledBy}
    >
      {items.map((item) => {
        const external = isExternalHomepageLink(item.href)

        return (
          <NavigationLink
            key={item.id}
            href={item.href}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
            className="relative flex min-h-24 items-center border-b py-3 pr-2 pl-3 transition-colors hover:bg-muted/35 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none nth-last-[-n+2]:border-b-0"
          >
            <span
              className={cn(
                "absolute inset-y-2 left-0 w-0.5 rounded-full",
                homepageLinkAccentClasses[item.accent]
              )}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium wrap-break-word">
                {item.title}
              </span>
              <span className="mt-0.5 block text-xs/5 wrap-break-word text-muted-foreground">
                {item.description}
              </span>
              {external ? <span className="sr-only">（外部链接）</span> : null}
            </span>
          </NavigationLink>
        )
      })}
    </div>
  )
}
