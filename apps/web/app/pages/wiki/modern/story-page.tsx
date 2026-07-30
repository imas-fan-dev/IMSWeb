import {
  AlertCircleIcon,
  ArrowLeftIcon,
  BookOpenIcon,
  HistoryIcon,
  Link2Icon,
  ListFilterIcon,
  SearchIcon,
} from "lucide-react"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { Link, useLocation, useSearchParams } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { WikiEntryKindBadge } from "~/components/wiki/wiki-entry-kind"
import { Button, buttonVariants } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet"
import { Skeleton } from "~/components/ui/skeleton"
import { StoryCategorySection } from "~/pages/wiki/modern/components/story-category-section"
import { StoryNavigationPanel } from "~/pages/wiki/modern/components/story-navigation-panel"
import { safeWikiColor, storyCardMatches } from "~/pages/wiki/wiki-model"
import { cn } from "~/lib/utils"
import { getWikiStories, isApiError } from "~/lib/api"
import type { WikiPublicStories } from "~/lib/api"

const TARGET_CARD_HIGHLIGHT_MS = 1800

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "剧情内容暂时无法加载"
}

export function meta() {
  return [
    { title: "剧情详情 | IMSWeb" },
    {
      name: "description",
      content: "按分类浏览内容页的剧情卡片与投稿来源。",
    },
  ]
}

export function StoryPage() {
  const location = useLocation()
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
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
  const [highlightedCardId, setHighlightedCardId] = useState<number | null>(
    null
  )
  const deferredQuery = useDeferredValue(query)
  const requestKey = `${agencyName}\u0000${idolName}\u0000${refreshVersion}`
  const targetCardIdMatch = /^#story-card-(\d+)$/.exec(location.hash)
  const targetCardId = targetCardIdMatch ? Number(targetCardIdMatch[1]) : null

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

  useEffect(() => {
    let highlightTimer: number | undefined
    const activationTimer = window.setTimeout(() => {
      if (
        storyRequest.key !== requestKey ||
        !storyRequest.data ||
        !targetCardId
      ) {
        setHighlightedCardId(null)
        return
      }
      const targetCard = document.getElementById(`story-card-${targetCardId}`)
      if (!targetCard) {
        setHighlightedCardId(null)
        return
      }
      targetCard.focus()
      setHighlightedCardId(targetCardId)
      highlightTimer = window.setTimeout(() => {
        if (document.activeElement === targetCard) targetCard.blur()
        setHighlightedCardId((current) =>
          current === targetCardId ? null : current
        )
      }, TARGET_CARD_HIGHLIGHT_MS)
    }, 0)
    return () => {
      window.clearTimeout(activationTimer)
      if (highlightTimer !== undefined) window.clearTimeout(highlightTimer)
    }
  }, [requestKey, storyRequest, targetCardId])

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
        <h1 className="mt-4 text-2xl font-semibold">请选择一个内容页</h1>
        <p className="mt-2 text-muted-foreground">
          剧情地址缺少企划或内容页信息。
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
                  返回内容目录
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
            <div
              data-testid="story-profile-grid"
              className="mx-auto grid w-full max-w-7xl grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-4 px-4 py-6 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-6 sm:px-6 sm:py-8 md:grid-cols-[10rem_minmax(0,1fr)] lg:px-8"
            >
              <div
                className="aspect-square overflow-hidden rounded-lg border bg-muted"
                style={{ borderColor: safeWikiColor(stories.idol.color) }}
              >
                <WikiTransformedImage
                  src={stories.idol.imageUrl}
                  alt={stories.idol.name}
                  transform={stories.idol.imageTransform}
                />
              </div>
              <div className="min-w-0">
                <Link
                  to={`/wiki?agency=${encodeURIComponent(stories.agency.name)}`}
                  className="inline-flex max-w-full items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeftIcon className="size-4 shrink-0" />
                  <span className="truncate">{stories.agency.name}</span>
                </Link>
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 sm:mt-3">
                  <h1 className="min-w-0 text-2xl font-semibold wrap-break-word sm:text-3xl">
                    {stories.idol.name}
                  </h1>
                  <WikiEntryKindBadge
                    kind={stories.idol.entryKind}
                    subtype={stories.idol.entrySubtype}
                    variant="secondary"
                  />
                </div>
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground sm:mt-3 sm:gap-x-5 sm:text-sm">
                  <span>{visibleCategories.length} 个分类</span>
                  <span>{cardCount ?? 0} 张卡片</span>
                  <span>{linkCount ?? 0} 个内容来源</span>
                </p>
                <Link
                  to={`/story/classic?agency=${encodeURIComponent(stories.agency.name)}&idol=${encodeURIComponent(stories.idol.name)}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "mt-3 sm:mt-4"
                  )}
                >
                  <HistoryIcon data-icon="inline-start" />
                  经典视图
                </Link>
              </div>
            </div>
          </section>

          <div
            data-testid="story-search-bar"
            className="border-b bg-background/95 backdrop-blur-sm"
          >
            <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <label className="relative block min-w-0 flex-1 sm:max-w-sm">
                <span className="sr-only">搜索剧情</span>
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  data-testid="story-primary-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索卡片、类型、平台或发布者"
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

          <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_13rem] lg:items-start lg:px-8 lg:py-10">
            <div className="min-w-0 space-y-12">
              {visibleCategories.length ? (
                visibleCategories.map((category, index) => (
                  <StoryCategorySection
                    key={category.name}
                    category={category}
                    categoryId={`story-category-${index}`}
                    fallbackImage={stories.idol.imageUrl}
                    fallbackTransform={stories.idol.imageTransform}
                    accentColor={stories.idol.color ?? stories.agency.color}
                    highlightedCardId={highlightedCardId}
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

            <aside
              data-testid="story-navigation-sidebar"
              aria-label="快捷导航"
              className="sticky top-20 hidden max-h-[calc(100svh-6rem)] self-start overflow-y-auto rounded-lg border border-r-4 bg-card p-3 lg:block"
              style={{
                borderRightColor: safeWikiColor(
                  stories.idol.color ?? stories.agency.color
                ),
              }}
            >
              <p className="mb-3 text-sm font-semibold">快捷导航</p>
              <StoryNavigationPanel
                stories={stories}
                categories={visibleCategories}
                query={query}
                onQueryChange={setQuery}
              />
            </aside>
          </div>

          <Sheet
            open={mobileNavigationOpen}
            onOpenChange={setMobileNavigationOpen}
          >
            <SheetTrigger
              render={
                <Button
                  type="button"
                  className="fixed bottom-4 left-4 z-40 shadow-lg lg:hidden"
                  aria-label={`打开${stories.idol.name}剧情导航`}
                />
              }
            >
              <ListFilterIcon data-icon="inline-start" />
              剧情导航
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="max-h-[82svh] overflow-y-auto rounded-t-lg"
            >
              <SheetHeader className="border-b pr-14">
                <SheetTitle>{stories.idol.name} · 快捷导航</SheetTitle>
                <SheetDescription className="sr-only">
                  搜索剧情或前往分类
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <StoryNavigationPanel
                  stories={stories}
                  categories={visibleCategories}
                  query={query}
                  onQueryChange={setQuery}
                  onNavigate={() => setMobileNavigationOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : null}
    </main>
  )
}

export default StoryPage
