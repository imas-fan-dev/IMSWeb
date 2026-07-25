import {
  AlertCircleIcon,
  BookOpenIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Skeleton } from "~/components/ui/skeleton"
import { WikiHero } from "~/pages/wiki/components/wiki-hero"
import { WikiIdolGrid } from "~/pages/wiki/components/wiki-idol-grid"
import {
  getWikiCatalog,
  getWikiRandomBackground,
  isApiError,
} from "~/shared/api"
import type { WikiPublicCatalog, WikiRandomBackground } from "~/shared/api"

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "剧情档案暂时无法加载"
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
        if (active) setCatalogRequest({ key: requestKey, data: null, error })
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
  const catalogError = requestIsCurrent ? catalogRequest.error : null
  const loading = !requestIsCurrent
  const backgroundLoading = backgroundRequest.key !== backgroundKey
  const selection = catalog?.selection ?? null
  const visibleGroups = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("zh-CN")
    if (!selection || !normalized) return selection?.groups ?? []
    return selection.groups
      .map((group) => ({
        ...group,
        idols: group.idols.filter((idol) =>
          idol.name.toLocaleLowerCase("zh-CN").includes(normalized)
        ),
      }))
      .filter((group) => group.idols.length)
  }, [deferredQuery, selection])
  const idolCount = selection?.groups.reduce(
    (total, group) => total + group.idols.length,
    0
  )

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
          className="mx-auto flex w-full max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8"
          role="tablist"
          aria-label="偶像大师企划"
        >
          {(catalog?.agencies ?? []).map((agency) => {
            const active = selection?.agency.name === agency.name
            const iconUrl = agency.iconUrl ?? ""
            return (
              <button
                key={agency.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setQuery("")
                  setSearchParams({ agency: agency.name })
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
                    <img
                      src={iconUrl}
                      alt=""
                      className="absolute inset-0 size-full bg-background object-contain p-1"
                      onError={(event) => {
                        event.currentTarget.hidden = true
                      }}
                    />
                  ) : null}
                </span>
                {agency.name}
                <span className="text-xs text-muted-foreground">
                  {agency.idolCount}
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
          <div aria-label="正在加载角色目录">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="mt-5 h-10 w-full max-w-md" />
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 12 }, (_, index) => (
                <Skeleton key={index} className="aspect-[4/5] rounded-lg" />
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
                  {idolCount} 位角色
                </p>
              </div>
              <label className="relative block w-full sm:max-w-sm">
                <span className="sr-only">搜索角色</span>
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索角色"
                  className="pl-9"
                />
              </label>
            </div>

            <div className="mt-6">
              {visibleGroups.length ? (
                <WikiIdolGrid
                  agency={selection.agency.name}
                  groups={visibleGroups}
                />
              ) : (
                <div className="rounded-lg border border-dashed px-6 py-14 text-center">
                  <p className="font-medium">没有匹配的角色</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    清除搜索词后可查看完整目录。
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
