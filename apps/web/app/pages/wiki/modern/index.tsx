import { AlertCircleIcon, BookOpenIcon, SearchIcon } from "lucide-react"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Skeleton } from "~/components/ui/skeleton"
import { WikiGlobalSearchResults } from "~/components/wiki/wiki-global-search-results"
import { WikiMobileSearch } from "~/components/wiki/wiki-mobile-search"
import { shouldKeepCgIdol } from "~/pages/wiki/cg-voiced-idols"
import { WikiAgencyDial } from "~/pages/wiki/modern/components/wiki-agency-dial"
import { WikiGroupFilter } from "~/pages/wiki/modern/components/wiki-group-filter"
import { WikiHero } from "~/pages/wiki/modern/components/wiki-hero"
import { WikiIdolGrid } from "~/pages/wiki/modern/components/wiki-idol-grid"
import { WikiVoicedFilter } from "~/pages/wiki/modern/components/wiki-voiced-filter"
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
  const [hideUnvoiced, setHideUnvoiced] = useState(true)
  const showOnlyVoiced = hideUnvoiced && selection?.agency.code === "cg"
  const visibleGroups = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("zh-CN")
    if (!selection) return []
    return selection.groups
      .map((group) => {
        let idols = group.idols
        if (
          normalized &&
          !group.name.toLocaleLowerCase("zh-CN").includes(normalized)
        ) {
          idols = idols.filter((idol) =>
            idol.name.toLocaleLowerCase("zh-CN").includes(normalized)
          )
        }
        if (showOnlyVoiced) idols = idols.filter(shouldKeepCgIdol)
        return { ...group, idols }
      })
      .filter((group) => group.idols.length)
  }, [deferredQuery, selection, showOnlyVoiced])

  const visibleUngroupedIdols = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("zh-CN")
    if (!selection) return []
    let idols = selection.ungroupedIdols
    if (normalized) {
      idols = idols.filter((idol) =>
        idol.name.toLocaleLowerCase("zh-CN").includes(normalized)
      )
    }
    if (showOnlyVoiced) idols = idols.filter(shouldKeepCgIdol)
    return idols
  }, [deferredQuery, selection, showOnlyVoiced])

  function selectAgency(agency: string) {
    setQuery("")
    setSearchParams({ agency }, { preventScrollReset: true })
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
                onClick={() => selectAgency(agency.name)}
                className={[
                  "relative flex shrink-0 items-center rounded-md border bg-background font-medium",
                  "transition-colors hover:bg-muted",
                  "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  "h-11 w-11 justify-center gap-0 px-0 text-xs",
                  "sm:h-10 sm:w-auto sm:justify-start sm:gap-1.5 sm:px-2.5 sm:text-sm",
                  "md:h-12 md:gap-2.5 md:px-3",
                ].join(" ")}
                aria-label={agency.name}
                style={
                  active
                    ? {
                        borderColor: agency.color,
                        boxShadow: `inset 0 -3px 0 ${agency.color}`,
                      }
                    : undefined
                }
              >
                <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/40 sm:size-7 md:size-8">
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
                <span className="hidden sm:inline">{agency.name}</span>
              </button>
            )
          })}
          {loading ? (
            <>
              <Skeleton className="size-11 shrink-0 sm:h-10 sm:w-32 md:h-12 md:w-36" />
              <Skeleton className="size-11 shrink-0 sm:h-10 sm:w-32 md:h-12 md:w-36" />
              <Skeleton className="size-11 shrink-0 sm:h-10 sm:w-32 md:h-12 md:w-36" />
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
                <div
                  key={index}
                  className="overflow-hidden rounded-lg border bg-card"
                >
                  <Skeleton
                    data-testid="wiki-idol-avatar-skeleton"
                    className="aspect-square w-full rounded-none"
                  />
                  <div className="flex min-h-14 items-center px-3 py-2.5">
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
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
              </div>
              <div className="relative hidden w-full sm:max-w-sm md:block">
                <label className="relative block">
                  <span className="sr-only">全局搜索内容页</span>
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索全站偶像或内容页"
                    className="pl-9"
                  />
                </label>
                <WikiGlobalSearchResults
                  entries={availableCatalog?.searchEntries ?? []}
                  query={query}
                  view="modern"
                  onNavigate={() => setQuery("")}
                />
              </div>
            </div>

            <WikiGroupFilter
              groups={selection.groups}
              ungroupedCount={selection.ungroupedIdols.length}
              action={
                selection.agency.code === "cg" ? (
                  <WikiVoicedFilter
                    hideUnvoiced={hideUnvoiced}
                    onToggle={() => setHideUnvoiced((current) => !current)}
                  />
                ) : null
              }
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
      <WikiAgencyDial
        agencies={availableCatalog?.agencies ?? []}
        selectedAgency={selection?.agency.name || requestedAgency || null}
        disabled={!requestIsCurrent}
        onSelectAgency={selectAgency}
      />
      <WikiMobileSearch
        entries={availableCatalog?.searchEntries ?? []}
        view="modern"
        className="md:hidden"
      />
    </main>
  )
}

export default WikiIndexPage
