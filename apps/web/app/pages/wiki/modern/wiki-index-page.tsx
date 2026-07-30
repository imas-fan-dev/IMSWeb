import {
  AlertCircleIcon,
  BookOpenIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Skeleton } from "~/components/ui/skeleton"
import {
  UNGROUPED_FILTER,
  WikiGroupFilter,
  type WikiGroupFilterValue,
} from "~/pages/wiki/modern/components/wiki-group-filter"
import { WikiHero } from "~/pages/wiki/modern/components/wiki-hero"
import { WikiIdolGrid } from "~/pages/wiki/modern/components/wiki-idol-grid"
import { getWikiCatalog, getWikiRandomBackground, isApiError } from "~/lib/api"
import type { WikiPublicCatalog, WikiRandomBackground } from "~/lib/api"

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "剧情档案暂时无法加载"
}

export function meta() {
  return [
    { title: "剧情档案 | IMSWeb" },
    {
      name: "description",
      content: "偶像大师各企划内容页、剧情卡片与影像来源档案。",
    },
  ]
}

export function WikiIndexPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedAgency = searchParams.get("agency")?.trim() ?? ""
  const requestedGroup = searchParams.get("group")?.trim() ?? ""
  const [catalogRequest, setCatalogRequest] = useState<{
    key: string
    data: WikiPublicCatalog | null
    error: unknown
  }>({ key: "", data: null, error: null })
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [backgroundRequest, setBackgroundRequest] = useState<{
    key: string
    data: WikiRandomBackground | null
  }>({ key: "", data: null })
  const [backgroundVersion, setBackgroundVersion] = useState(0)
  const requestKey = `${requestedAgency}\u0000${refreshVersion}`
  const backgroundKey = String(backgroundVersion)

  useEffect(() => {
    let active = true
    void getWikiCatalog(requestedAgency || undefined)
      .send()
      .then((data) => {
        if (active) setCatalogRequest({ key: requestKey, data, error: null })
      })
      .catch((error: unknown) => {
        if (active) {
          setCatalogRequest((current) => ({
            key: requestKey,
            data: current.data,
            error,
          }))
        }
      })
    return () => {
      active = false
    }
  }, [requestKey, requestedAgency])

  useEffect(() => {
    let active = true
    void getWikiRandomBackground()
      .send()
      .then((data) => {
        if (active) setBackgroundRequest({ key: backgroundKey, data })
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [backgroundKey])

  const requestIsCurrent = catalogRequest.key === requestKey
  const catalog = requestIsCurrent ? catalogRequest.data : null
  const availableCatalog = catalogRequest.data
  const catalogError = requestIsCurrent ? catalogRequest.error : null
  const loading = !requestIsCurrent
  const backgroundLoading = backgroundRequest.key !== backgroundKey
  const selection = catalog?.selection ?? null
  const requestedGroupId = Number(requestedGroup)
  const selectedGroup = selection?.groups.find(
    (group) =>
      Number.isInteger(requestedGroupId) && group.id === requestedGroupId
  )
  const showUngroupedOnly = Boolean(
    selection?.ungroupedIdols.length && requestedGroup === UNGROUPED_FILTER
  )
  const groupFilterValue: WikiGroupFilterValue = selectedGroup
    ? selectedGroup.id
    : showUngroupedOnly
      ? UNGROUPED_FILTER
      : null
  const visibleGroups = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("zh-CN")
    if (!selection || showUngroupedOnly) return []
    const groups = selectedGroup ? [selectedGroup] : selection.groups
    if (!normalized) return groups
    return groups
      .map((group) => ({
        ...group,
        idols: group.name.toLocaleLowerCase("zh-CN").includes(normalized)
          ? group.idols
          : group.idols.filter((idol) =>
              idol.name.toLocaleLowerCase("zh-CN").includes(normalized)
            ),
      }))
      .filter((group) => group.idols.length)
  }, [deferredQuery, selectedGroup, selection, showUngroupedOnly])
  const visibleUngroupedIdols = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("zh-CN")
    if (!selection || selectedGroup) return []
    if (!normalized) return selection.ungroupedIdols
    return selection.ungroupedIdols.filter((idol) =>
      idol.name.toLocaleLowerCase("zh-CN").includes(normalized)
    )
  }, [deferredQuery, selectedGroup, selection])
  const contentPageCount = selection
    ? new Set(
        [
          ...selection.groups.flatMap((group) => group.idols),
          ...selection.ungroupedIdols,
        ].map((idol) => idol.id)
      ).size
    : 0

  function selectGroup(value: WikiGroupFilterValue) {
    if (!selection) return
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.set("agency", selection.agency.name)
    if (value === null) nextSearchParams.delete("group")
    else nextSearchParams.set("group", String(value))
    setSearchParams(nextSearchParams, { preventScrollReset: true })
  }

  return (
    <main id="main-content">
      <WikiHero
        background={backgroundRequest.data}
        loading={backgroundLoading}
        classicHref={`/wiki/classic${requestedAgency ? `?agency=${encodeURIComponent(requestedAgency)}` : ""}`}
        onRefresh={() => setBackgroundVersion((current) => current + 1)}
      />

      <section className="border-b bg-card" aria-label="企划选择">
        <div
          className="mx-auto flex w-full max-w-7xl gap-2 overflow-x-auto overscroll-x-contain px-4 py-3 sm:px-6 lg:px-8"
          data-testid="wiki-agency-tabs"
          role="tablist"
          aria-label="偶像大师企划"
          aria-busy={!requestIsCurrent}
        >
          {(availableCatalog?.agencies ?? []).map((agency) => {
            const active = requestIsCurrent
              ? selection?.agency.name === agency.name
              : requestedAgency === agency.name
            const iconUrl = agency.iconUrl ?? ""
            return (
              <button
                key={agency.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setQuery("")
                  setSearchParams(
                    { agency: agency.name },
                    { preventScrollReset: true }
                  )
                }}
                className="relative flex h-12 shrink-0 items-center gap-2.5 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                style={
                  active
                    ? {
                        borderColor: agency.color,
                        boxShadow: `inset 0 -3px 0 ${agency.color}`,
                      }
                    : undefined
                }
              >
                <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: agency.color }}
                    aria-hidden="true"
                  />
                  {iconUrl ? (
                    <WikiTransformedImage
                      src={iconUrl}
                      alt=""
                      transform={agency.imageTransform}
                      className="absolute inset-0 bg-background p-1"
                      onError={(event) => {
                        event.currentTarget.hidden = true
                      }}
                    />
                  ) : null}
                </span>
                {agency.name}
                <span className="text-xs text-muted-foreground">
                  {agency.entryCount ?? agency.idolCount}
                </span>
              </button>
            )
          })}
          {loading ? (
            <>
              <Skeleton className="h-12 w-32 shrink-0" />
              <Skeleton className="h-12 w-36 shrink-0" />
              <Skeleton className="h-12 w-32 shrink-0" />
            </>
          ) : null}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {catalogError ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>剧情档案暂时无法加载</AlertTitle>
            <AlertDescription>
              <p>{errorMessage(catalogError)}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRefreshVersion((current) => current + 1)}
              >
                重新加载
              </Button>
            </AlertDescription>
          </Alert>
        ) : loading ? (
          <div aria-label="正在加载内容目录">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="mt-5 h-10 w-full max-w-md" />
            <div className="mt-6 grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 12 }, (_, index) => (
                <Skeleton key={index} className="aspect-4/5 rounded-lg" />
              ))}
            </div>
          </div>
        ) : selection ? (
          <>
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <BookOpenIcon className="size-4" />
                  {selection.agency.code.toUpperCase()} ARCHIVE
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {selection.agency.name}
                </h2>
                <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <UsersIcon className="size-4" />
                  {contentPageCount} 个内容页
                </p>
              </div>
              <label className="relative block w-full sm:max-w-sm">
                <span className="sr-only">搜索内容页</span>
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索偶像、组合或剧情"
                  className="pl-9"
                />
              </label>
            </div>

            <WikiGroupFilter
              groups={selection.groups}
              ungroupedCount={selection.ungroupedIdols.length}
              totalCount={contentPageCount}
              value={groupFilterValue}
              agencyColor={selection.agency.color}
              onValueChange={selectGroup}
            />

            <div className="mt-6">
              {visibleGroups.length || visibleUngroupedIdols.length ? (
                <WikiIdolGrid
                  agency={selection.agency.name}
                  groups={visibleGroups}
                  ungroupedIdols={visibleUngroupedIdols}
                />
              ) : (
                <div className="rounded-lg border border-dashed px-6 py-14 text-center">
                  <p className="font-medium">没有匹配的内容页</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {query
                      ? "清除搜索词后可查看当前范围内的完整目录。"
                      : groupFilterValue !== null
                        ? "当前组合或分类还没有可展示的内容页。"
                        : "当前企划还没有可展示的内容页。"}
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed px-6 py-14 text-center">
            <p className="font-medium">当前没有可展示的 Wiki 数据</p>
          </div>
        )}
      </section>
    </main>
  )
}

export default WikiIndexPage
