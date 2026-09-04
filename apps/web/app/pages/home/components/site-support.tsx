import { ExternalLinkIcon } from "lucide-react"

import { homepageLinkAccentClasses } from "~/components/homepage/homepage-link-options"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Skeleton } from "~/components/ui/skeleton"
import { cn } from "~/lib/utils"
import { useHomepageLinks } from "../hooks/use-homepage-links"
import { NavigationLink } from "~/components/navigation/navigation-link"

export function SiteSupport() {
  const { data, loading, error } = useHomepageLinks()
  const items = data.sections.support

  return (
    <section className="border-t" aria-labelledby="support-heading">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-7">
          <p className="text-xs font-semibold text-primary">SITE SUPPORT</p>
          <h2 id="support-heading" className="mt-2 text-2xl font-semibold">
            网站支持
          </h2>
        </div>
        {loading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-24 w-full rounded-md" />
            ))}
          </div>
        ) : error ? (
          <Alert>
            <AlertTitle>网站支持暂时不可用</AlertTitle>
            <AlertDescription>稍后刷新即可重新获取。</AlertDescription>
          </Alert>
        ) : items.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {items.map((link) => (
              <NavigationLink
                key={link.id}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="group flex min-h-24 items-center gap-4 rounded-md border bg-card px-5 py-4 transition-colors hover:bg-muted/35 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "h-9 w-1 shrink-0 rounded-full",
                    homepageLinkAccentClasses[link.accent]
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {link.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {link.description}
                  </span>
                </span>
                <ExternalLinkIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </NavigationLink>
            ))}
          </div>
        ) : (
          <p className="border-y py-8 text-sm text-muted-foreground">
            当前没有网站支持信息。
          </p>
        )}
      </div>
    </section>
  )
}
