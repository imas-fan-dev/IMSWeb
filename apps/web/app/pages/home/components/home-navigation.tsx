import { ExternalLinkIcon } from "lucide-react"

import { homepageLinkAccentClasses } from "~/components/homepage/homepage-link-options"
import {
  HomepageLinkGrid,
  HomepageLinkGridSkeleton,
  isExternalHomepageLink,
} from "~/components/homepage/homepage-links"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Skeleton } from "~/components/ui/skeleton"
import type { HomepageLink } from "~/lib/api"
import { cn } from "~/lib/utils"
import { useHomepageLinks } from "../hooks/use-homepage-links"

function FriendLink({ item }: { item: HomepageLink }) {
  const external = isExternalHomepageLink(item.href)

  return (
    <NavigationLink
      href={item.href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="group relative flex min-h-24 items-center gap-4 border-b px-4 py-5 transition-colors hover:bg-muted/35 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:px-5 nth-last-[-n+2]:sm:border-b-0 nth-last-[-n+3]:lg:border-b-0"
    >
      <span
        className={cn(
          "h-9 w-1 shrink-0 rounded-full",
          homepageLinkAccentClasses[item.accent]
        )}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{item.title}</span>
        <span className="mt-1 block text-xs/5 text-muted-foreground">
          {item.description}
        </span>
      </span>
      <ExternalLinkIcon
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        aria-hidden="true"
      />
    </NavigationLink>
  )
}

function LinkSectionError() {
  return (
    <Alert>
      <AlertTitle>首页链接暂时不可用</AlertTitle>
      <AlertDescription>稍后刷新即可重新获取。</AlertDescription>
    </Alert>
  )
}

export function PortalDirectory() {
  const { data, loading, error } = useHomepageLinks()
  const items = data.sections.navigation

  return (
    <section aria-labelledby="portal-heading">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="mb-5 sm:mb-7">
          <p className="text-xs font-semibold text-primary">DIRECTORY</p>
          <h2
            id="portal-heading"
            className="mt-2 text-xl font-semibold sm:text-2xl"
          >
            站点导航
          </h2>
        </div>
        {loading ? (
          <HomepageLinkGridSkeleton />
        ) : error ? (
          <LinkSectionError />
        ) : items.length ? (
          <HomepageLinkGrid items={items} />
        ) : (
          <p className="border-y py-8 text-sm text-muted-foreground">
            当前没有站点导航。
          </p>
        )}
      </div>
    </section>
  )
}

export function FriendLinks() {
  const { data, loading, error } = useHomepageLinks()
  const items = data.sections.friend

  return (
    <section aria-labelledby="friends-heading">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-7">
          <p className="text-xs font-semibold text-primary">COMMUNITY LINKS</p>
          <h2 id="friends-heading" className="mt-2 text-2xl font-semibold">
            友情链接
          </h2>
        </div>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-24 w-full rounded-md" />
            ))}
          </div>
        ) : error ? (
          <LinkSectionError />
        ) : items.length ? (
          <div className="grid gap-x-8 border-y sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <FriendLink key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="border-y py-8 text-sm text-muted-foreground">
            当前没有友情链接。
          </p>
        )}
      </div>
    </section>
  )
}
