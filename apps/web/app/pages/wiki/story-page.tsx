import {
  AlertCircleIcon,
  ArrowLeftIcon,
  BookOpenIcon,
  HistoryIcon,
  Link2Icon,
  SearchIcon,
} from "lucide-react"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button, buttonVariants } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Skeleton } from "~/components/ui/skeleton"
import { StoryCategorySection } from "~/pages/wiki/components/story-category-section"
import { safeWikiColor, storyCardMatches } from "~/pages/wiki/wiki-model"
import { cn } from "~/lib/utils"
import { getWikiStories, isApiError } from "~/shared/api"
import type { WikiPublicStories } from "~/shared/api"

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "剧情内容暂时无法加载"
}

export function StoryPage() {
  const [searchParams] = useSearchParams()
  const agencyName = searchParams.get("agency")?.trim() ?? ""
  const idolName = searchParams.get("idol")?.trim() ?? ""
  const [storyRequest, setStoryRequest] = useState<{
    key: string
    data: WikiPublicStories | null
    error: unknown
  }>({ key: "", data: null, error: null })
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const requestKey = `${agencyName}\u0000${idolName}\u0000${refreshVersion}`

  useEffect(() => {
    if (!agencyName || !idolName) return
    let active = true
    void getWikiStories(agencyName, idolName)
      .send()
      .then((data) => {
        if (active) setStoryRequest({ key: requestKey, data, error: null })
      })
      .catch((error: unknown) => {
        if (active) setStoryRequest({ key: requestKey, data: null, error })
      })
    return () => {
      active = false
    }
  }, [agencyName, idolName, requestKey])

  const hasTarget = Boolean(agencyName && idolName)
  const requestIsCurrent = storyRequest.key === requestKey
  const stories = requestIsCurrent ? storyRequest.data : null
  const storiesError = requestIsCurrent ? storyRequest.error : null
  const loading = hasTarget && !requestIsCurrent
  const visibleCategories = useMemo(() => {
    if (!stories) return []
    return stories.categories.flatMap((category) => {
      const cards = category.cards.filter((card) =>
        storyCardMatches(category, card, deferredQuery)
      )
      return cards.length ? [{ ...category, cards }] : []
    })
  }, [deferredQuery, stories])
  const cardCount = stories?.categories.reduce(
    (sum, category) => sum + category.cards.length,
    0
  )
  const linkCount = stories?.categories.reduce(
    (sum, category) =>
      sum +
      category.cards.reduce((count, card) => count + card.links.length, 0),
    0
  )

  if (!hasTarget) {
    return (
      <main
        id="main-content"
        className="mx-auto flex min-h-[60svh] w-full max-w-3xl flex-col items-start justify-center px-4 py-16 sm:px-6"
      >
        <BookOpenIcon className="size-8 text-primary" />
        <h1 className="mt-4 text-2xl font-semibold">请选择一位角色</h1>
        <p className="mt-2 text-muted-foreground">
          剧情地址缺少企划或角色信息。
        </p>
        <Link
          to="/wiki"
          className={cn(buttonVariants({ variant: "default" }), "mt-6")}
        >
          返回剧情档案
        </Link>
      </main>
    )
  }

  return (
    <main id="main-content">
      {storiesError ? (
        <div className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>剧情内容暂时无法加载</AlertTitle>
            <AlertDescription>
              <p>{errorMessage(storiesError)}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRefreshVersion((current) => current + 1)}
                >
                  重新加载
                </Button>
                <Link
                  to={`/wiki?agency=${encodeURIComponent(agencyName)}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  返回角色目录
                </Link>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      ) : loading ? (
        <div
          className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
          aria-label="正在加载剧情"
        >
          <Skeleton className="h-36 w-full rounded-lg" />
          <Skeleton className="mt-8 h-10 w-full max-w-md" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="aspect-4/3 rounded-lg" />
            ))}
          </div>
        </div>
      ) : stories ? (
        <>
          <section className="border-b bg-card">
            <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 md:grid-cols-[10rem_1fr] md:items-center lg:px-8">
              <div
                className="aspect-square max-w-40 overflow-hidden rounded-lg border bg-muted"
                style={{ borderColor: safeWikiColor(stories.idol.color) }}
              >
                <img
                  src={stories.idol.imageUrl}
                  alt={stories.idol.name}
                  className="size-full"
                  style={{ objectFit: stories.idol.imageFit }}
                />
              </div>
              <div className="min-w-0">
                <Link
                  to={`/wiki?agency=${encodeURIComponent(stories.agency.name)}`}
                  className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeftIcon className="size-4" />
                  {stories.agency.name}
                </Link>
                <h1 className="wrap-break-words mt-3 text-3xl font-semibold">
                  {stories.idol.name}
                </h1>
                <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <span>{visibleCategories.length} 个分类</span>
                  <span>{cardCount ?? 0} 张卡片</span>
                  <span>{linkCount ?? 0} 个剧情来源</span>
                </p>
                <Link
                  to={`/story/classic?agency=${encodeURIComponent(stories.agency.name)}&idol=${encodeURIComponent(stories.idol.name)}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "mt-4"
                  )}
                >
                  <HistoryIcon data-icon="inline-start" />
                  经典视图
                </Link>
              </div>
            </div>
          </section>

          <div className="sticky top-16 z-30 border-b bg-background/95 backdrop-blur-sm">
            <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <label className="relative block min-w-0 flex-1 sm:max-w-sm">
                <span className="sr-only">搜索剧情</span>
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索卡片、标题或投稿者"
                  className="pl-9"
                />
              </label>
              <nav
                aria-label="剧情分类"
                className="hidden min-w-0 flex-1 gap-2 overflow-x-auto lg:flex"
              >
                {visibleCategories.map((category, index) => (
                  <a
                    key={category.name}
                    href={`#story-category-${index}`}
                    className="shrink-0 rounded-md border px-2.5 py-2 text-xs font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {category.name}
                  </a>
                ))}
              </nav>
            </div>
          </div>

          <div className="mx-auto w-full max-w-7xl space-y-12 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            {visibleCategories.length ? (
              visibleCategories.map((category, index) => (
                <StoryCategorySection
                  key={category.name}
                  category={category}
                  categoryId={`story-category-${index}`}
                  fallbackImage={stories.idol.imageUrl}
                  accentColor={stories.idol.color ?? stories.agency.color}
                />
              ))
            ) : (
              <div className="rounded-lg border border-dashed px-6 py-16 text-center">
                <Link2Icon className="mx-auto size-7 text-muted-foreground" />
                <p className="mt-4 font-medium">
                  {query ? "没有匹配的剧情" : "当前没有已收录剧情"}
                </p>
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="mt-2 text-sm font-medium text-primary hover:underline"
                  >
                    清除搜索词
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </>
      ) : null}
    </main>
  )
}
