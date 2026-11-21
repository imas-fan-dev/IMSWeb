import { ArrowLeftIcon, HouseIcon, SearchIcon } from "lucide-react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { buttonVariants } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { WikiViewSwitchIcon } from "~/components/wiki/wiki-view-switch-icon"
import { documentOutline } from "~/components/wiki/wiki-document-model"
import type { WikiPublicStories, WikiPublicStoryCategory } from "~/lib/api"
import { webOnly } from "~/lib/navigation/navigation-target"
import { cn } from "~/lib/utils"
import { storyCategoryAnchorId } from "~/pages/wiki/wiki-model"

export function StoryNavigationPanel({
  stories,
  categories,
  query,
  onQueryChange,
  onNavigate,
}: {
  stories: WikiPublicStories
  categories: WikiPublicStoryCategory[]
  query: string
  onQueryChange: (value: string) => void
  onNavigate?: () => void
}) {
  const agencyHref = `/wiki?agency=${encodeURIComponent(stories.agency.name)}`
  const classicHref =
    `/story/classic?agency=${encodeURIComponent(stories.agency.name)}` +
    `&idol=${encodeURIComponent(stories.idol.name)}`
  // A hybrid document interleaves Markdown headings and embedded structured
  // pools, so the outline is the document order rather than two stacked lists.
  const outline = stories.document
    ? documentOutline(stories.document, categories)
    : categories.map((category) => ({
        kind: "category" as const,
        id: storyCategoryAnchorId(category.name),
        name: category.name,
        count: category.cards.length,
      }))
  const hasHeadings = outline.some((entry) => entry.kind === "heading")

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        <NavigationLink
          to="/"
          onClick={onNavigate}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "min-w-0"
          )}
        >
          <HouseIcon data-icon="inline-start" />
          首页
        </NavigationLink>
        <NavigationLink
          to={agencyHref}
          onClick={onNavigate}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "min-w-0"
          )}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          企划目录
        </NavigationLink>
      </div>

      <NavigationLink
        to={webOnly(classicHref)}
        onClick={onNavigate}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "w-full"
        )}
      >
        <WikiViewSwitchIcon data-icon="inline-start" />
        经典视图
      </NavigationLink>

      <label className="relative block min-w-0">
        <span className="sr-only">快速搜索剧情</span>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="快速搜索"
          className="pl-9"
        />
      </label>

      <nav aria-label="剧情分类" className="grid gap-1">
        {hasHeadings ? (
          <p className="px-3 pt-2 text-xs font-semibold text-muted-foreground">
            文档目录
          </p>
        ) : null}
        {outline.map((entry) =>
          entry.kind === "heading" ? (
            <a
              key={`heading-${entry.id}`}
              href={`#${entry.id}`}
              onClick={onNavigate}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                entry.level === 3 && "pl-6 text-muted-foreground"
              )}
            >
              <span className="min-w-0 truncate">{entry.text}</span>
            </a>
          ) : (
            <a
              key={`category-${entry.id}`}
              href={`#${entry.id}`}
              onClick={onNavigate}
              className="flex min-w-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="min-w-0 truncate">{entry.name}</span>
              <span className="shrink-0 text-xs font-normal text-muted-foreground">
                {entry.count}
              </span>
            </a>
          )
        )}
      </nav>
    </div>
  )
}
