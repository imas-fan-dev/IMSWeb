import { ArrowLeftIcon, HouseIcon, SearchIcon } from "lucide-react"
import { Link } from "react-router"

import { WikiViewSwitchIcon } from "~/components/wiki/wiki-view-switch-icon"
import { buttonVariants } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { cn } from "~/lib/utils"
import type { WikiPublicStories, WikiPublicStoryCategory } from "~/lib/api"

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
  const agencyHref = `/wiki/modern?agency=${encodeURIComponent(stories.agency.name)}`
  const classicHref =
    `/story?agency=${encodeURIComponent(stories.agency.name)}` +
    `&idol=${encodeURIComponent(stories.idol.name)}`

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        <Link
          to="/"
          onClick={onNavigate}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "min-w-0"
          )}
        >
          <HouseIcon data-icon="inline-start" />
          首页
        </Link>
        <Link
          to={agencyHref}
          onClick={onNavigate}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "min-w-0"
          )}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          企划目录
        </Link>
      </div>

      <Link
        to={classicHref}
        onClick={onNavigate}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "w-full"
        )}
      >
        <WikiViewSwitchIcon data-icon="inline-start" />
        经典视图
      </Link>

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
        {categories.map((category, index) => (
          <a
            key={category.name}
            href={`#story-category-${index}`}
            onClick={onNavigate}
            className="flex min-w-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="min-w-0 truncate">{category.name}</span>
            <span className="shrink-0 text-xs font-normal text-muted-foreground">
              {category.cards.length}
            </span>
          </a>
        ))}
      </nav>
    </div>
  )
}
