import { useContext } from "react"
import { ExchangeDataRevision } from "./exchange-page-surface"
import {
  Building2Icon,
  LoaderCircleIcon,
  MapIcon,
  MapPinOffIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button, buttonVariants } from "~/components/ui/button"
import { Empty, EmptyDescription, EmptyTitle } from "~/components/ui/empty"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"
import {
  getFudabaMapConfig,
  type FudabaSeries,
  type FudabaMapConfig,
  type FudabaOffice,
} from "~/lib/api"
import { APP_FLOATING_CONTROL_OFFSET, IS_APP_TARGET } from "~/lib/app-target"
import { cn } from "~/lib/utils"
import {
  groupMapOffices,
  type FudabaMapOfficeGroup,
} from "~/pages/community/exchange/maps/exchange-map-model"
import type { ExchangeMapAttribution } from "~/pages/community/exchange/maps/exchange-map-attribution"
import { mapFailureDescription } from "~/lib/maps/map-errors"
import {
  loadExchangeMapRenderer,
  type ExchangeMapRenderer,
} from "~/pages/community/exchange/maps/exchange-map-renderer"
import { NavigationLink } from "~/components/navigation/navigation-link"
import {
  useMapWorkspaceSearch,
  type WorkspaceSearchResult,
} from "~/pages/community/exchange/hooks/use-map-workspace-search"
import { useExchangeMapOffices } from "~/pages/community/exchange/hooks/use-exchange-map-offices"
import { loadExchangeMapSearch } from "~/pages/community/exchange/maps/exchange-map-search"
import {
  MapSearchError,
  type MapPlaceSearcher,
  type MapSearchPlace,
} from "~/lib/maps/map-search"
import {
  ExchangeSearchCard,
  type ExchangeSearchCardTools,
} from "./exchange-search-card"
import type { NativeGlassFrame } from "~/lib/native-glass-panel"
import { ExchangeWebMapWorkspace } from "./exchange-web-map-workspace"
import { ExchangeMapPointPopup } from "./exchange-map-point-popup"
import { ExchangeWebMapOffices } from "./exchange-web-map-offices"
import type { ExchangeDiscoveryRailProps } from "./exchange-discovery-rail"
import "~/pages/community/exchange/maps/exchange-web-map.css"

type ConfigState =
  | { phase: "loading"; error: null }
  | { phase: "ready"; value: FudabaMapConfig; error: null }
  | { phase: "error"; error: Error }

const initialConfigState: ConfigState = {
  phase: "loading",
  error: null,
}

const EMPTY_SERIES_CATALOG: readonly FudabaSeries[] = []

function useNarrowMapLayout() {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    if (!window.matchMedia) return
    const media = window.matchMedia("(max-width: 1023px)")
    const update = () => setIsNarrow(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return isNarrow
}

function OfficeStatus({ open }: { open: boolean }) {
  return (
    <Badge variant={open ? "secondary" : "outline"}>
      {open ? "开放交换" : "暂未开放"}
    </Badge>
  )
}

function OfficeGroupDetails({ group }: { group: FudabaMapOfficeGroup }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">地图区域</p>
        <h3 className="mt-1 text-base font-semibold">
          {group.offices.length} 个交换事务所
        </h3>
      </div>
      <div className="divide-y border-y">
        {group.offices.map((office) => (
          <article
            key={office.id}
            className="border-l-2 py-4 pl-3 first:pt-3 last:pb-3"
            style={{ borderLeftColor: office.accent }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="font-medium wrap-break-word">{office.name}</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  {office.address}
                </p>
              </div>
              <OfficeStatus open={office.isOpen} />
            </div>
            <NavigationLink
              to={`/community/exchange/offices/${encodeURIComponent(office.slug)}`}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "mt-3"
              )}
            >
              查看事务所
            </NavigationLink>
          </article>
        ))}
      </div>
    </div>
  )
}

function MapUnavailable({
  message,
  onRetry,
  onSwitchDirectory,
}: {
  message: Error
  onRetry: () => void
  onSwitchDirectory: () => void
}) {
  return (
    <Empty className="absolute inset-0 z-10 gap-0 rounded-none border-0 bg-[#e8f2f4] p-4 text-left sm:p-6">
      <div
        role="status"
        aria-labelledby="exchange-map-unavailable-title"
        className="w-full max-w-sm rounded-lg border border-slate-200/90 bg-white/95 p-5 text-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.14)] backdrop-blur-sm sm:p-6"
      >
        <div className="flex items-start gap-3.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
            <MapPinOffIcon className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <EmptyTitle
              id="exchange-map-unavailable-title"
              className="text-base font-semibold text-slate-950"
            >
              地图暂时不可用
            </EmptyTitle>
            <EmptyDescription className="mt-1.5 text-left text-sm/6 text-slate-600">
              {mapFailureDescription(message)}
            </EmptyDescription>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={onSwitchDirectory}
          >
            <Building2Icon aria-hidden="true" />
            查看事务所名录
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="w-full border-slate-300 bg-white text-slate-800 hover:bg-slate-100 hover:text-slate-950"
            onClick={onRetry}
          >
            <RefreshCwIcon aria-hidden="true" />
            重试地图
          </Button>
        </div>
      </div>
    </Empty>
  )
}

export function CommunityExchangeMapSection({
  city,
  series,
  seriesCatalog = EMPTY_SERIES_CATALOG,
  open,
  onSwitchDirectory,
  onAttributionChange,
  onSearchAttributionChange,
  searchTools,
  webDiscovery,
}: {
  city?: string
  series?: readonly string[]
  seriesCatalog?: readonly FudabaSeries[]
  open?: boolean
  onSwitchDirectory: () => void
  onAttributionChange?: (value: ExchangeMapAttribution | null) => void
  onSearchAttributionChange?: (value: string[]) => void
  searchTools?: ExchangeSearchCardTools
  webDiscovery?: ExchangeDiscoveryRailProps
}) {
  const dataRevision = useContext(ExchangeDataRevision)
  const [config, setConfig] = useState<ConfigState>(initialConfigState)
  const [MapComponent, setMapComponent] = useState<ExchangeMapRenderer | null>(
    null
  )
  const [moduleError, setModuleError] = useState<Error | null>(null)
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const mapSurface = useRef<HTMLElement>(null)
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null)
  const [groupFocus, setGroupFocus] = useState<{
    key: string
    sequence: number
  } | null>(null)
  const groupFocusSequence = useRef(0)
  const clearOfficeSelection = useCallback(() => {
    setSelectedGroupKey(null)
    setSelectedOfficeId(null)
    setGroupFocus(null)
  }, [])
  const [officeListOpen, setOfficeListOpen] = useState(false)
  const webWorkspace = !IS_APP_TARGET && Boolean(webDiscovery && searchTools)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<MapSearchPlace | null>(
    null
  )
  const initialLocation = useRef({
    claimed: false,
    controller: new AbortController(),
  })
  const claimInitialLocation = useCallback(() => {
    const attempt = initialLocation.current
    if (attempt.claimed || attempt.controller.signal.aborted) return null
    attempt.claimed = true
    return attempt.controller.signal
  }, [])
  useLayoutEffect(() => {
    if (selectedPlace) initialLocation.current.controller.abort()
  }, [selectedPlace])
  const configGeneration = useRef(0)
  const isNarrow = useNarrowMapLayout()
  const [searchPlaces, setSearchPlaces] = useState<MapPlaceSearcher | null>(
    null
  )
  const workspaceSearch = useMapWorkspaceSearch(searchPlaces)
  const searchModel = workspaceSearch.model
  function selectSearchResult(result: WorkspaceSearchResult) {
    if ("office" in result) {
      const location = result.office.location
      if (!location) return
      initialLocation.current.controller.abort()
      setSelectedPlace({
        id: result.id,
        label: result.label,
        address: result.address,
        zoom: location.precision === "exact" ? 15 : 10,
        target: {
          kind: "wgs84",
          position: [location.longitude, location.latitude],
        },
      })
      setSelectedAttribution("")
      clearOfficeSelection()
      setMobileSheetOpen(false)
      return
    }
    setSelectedPlace(result)
    setSelectedAttribution(result.attribution ?? searchModel.attribution)
    clearOfficeSelection()
    setMobileSheetOpen(false)
  }
  const searchViewport = useRef<
    import("~/lib/maps/map-engine").MapPosition | undefined
  >(undefined)
  const devicePosition = useRef<
    | {
        position: import("~/lib/maps/map-engine").MapPosition
        obtainedAt: number
      }
    | undefined
  >(undefined)
  const reportSearchViewport = useCallback(
    (position: import("~/lib/maps/map-engine").MapPosition) => {
      searchViewport.current = [...position]
    },
    []
  )
  const reportDevicePosition = useCallback(
    (position: import("~/lib/maps/map-engine").MapPosition) => {
      devicePosition.current = {
        position: [...position],
        obtainedAt: Date.now(),
      }
    },
    []
  )
  const [selectedAttribution, setSelectedAttribution] = useState("")
  useEffect(() => {
    if (!IS_APP_TARGET) return
    onSearchAttributionChange?.(
      [...new Set([searchModel.attribution, selectedAttribution])].filter(
        Boolean
      )
    )
  }, [searchModel.attribution, selectedAttribution, onSearchAttributionChange])
  useEffect(
    () => () => {
      if (IS_APP_TARGET) onSearchAttributionChange?.([])
    },
    [onSearchAttributionChange]
  )
  const [occlusion, setOcclusion] = useState<NativeGlassFrame | null>(null)
  const updateOcclusion = useCallback((frame: NativeGlassFrame | null) => {
    setOcclusion((current) =>
      current?.x === frame?.x &&
      current?.y === frame?.y &&
      current?.width === frame?.width &&
      current?.height === frame?.height
        ? current
        : frame
    )
  }, [])

  const loadConfig = useCallback(() => {
    const generation = ++configGeneration.current
    return getFudabaMapConfig()
      .send()
      .then((result) => {
        if (configGeneration.current !== generation) return
        setConfig({ phase: "ready", value: result, error: null })
      })
      .catch((error: unknown) => {
        if (configGeneration.current !== generation) return
        setConfig({
          phase: "error",
          error: error instanceof Error ? error : new Error("地图配置无法加载"),
        })
      })
  }, [])

  useEffect(() => {
    let active = true
    // Let StrictMode retire its initial probe before starting an owned request.
    void Promise.resolve().then(() => {
      if (active) return loadConfig()
    })
    return () => {
      active = false
      configGeneration.current += 1
    }
  }, [loadConfig])

  useEffect(() => {
    if (config.phase !== "ready") return
    let active = true
    const pendingSearch = loadExchangeMapSearch(config.value.search).catch(
      () => {
        const unavailable: MapPlaceSearcher = async () => {
          throw new MapSearchError("failed")
        }
        return unavailable
      }
    )
    const searcher: MapPlaceSearcher = async (query, signal) => {
      const viewportCenter = searchViewport.current
        ? ([...searchViewport.current] as [number, number])
        : undefined
      const fix = devicePosition.current
      const origin =
        fix && Date.now() - fix.obtainedAt <= 60_000
          ? ([...fix.position] as [number, number])
          : undefined
      const search = await pendingSearch
      signal.throwIfAborted()
      return search(query, signal, { viewportCenter, devicePosition: origin })
    }
    const load = loadExchangeMapRenderer(config.value).then((Renderer) => {
      if (!active) return
      setMapComponent(() => Renderer)
      setSearchPlaces(() => searcher)
    })
    void load.catch((error) => {
      if (active)
        setModuleError(
          error instanceof Error ? error : new Error("地图模块无法加载")
        )
    })
    return () => {
      active = false
    }
  }, [config])

  const {
    data,
    onViewportChange,
    refresh: refreshMapOffices,
  } = useExchangeMapOffices({ city, series, open, dataRevision })

  const selectedOffice =
    webDiscovery?.offices.find((office) => office.id === selectedOfficeId) ??
    data.items.find((office) => office.id === selectedOfficeId)

  const seriesColorKey = JSON.stringify(
    seriesCatalog
      .map(({ code, color }) => ({ code, color: color.toLowerCase() }))
      .sort((a, b) => a.code.localeCompare(b.code))
  )
  const [groupCatalog, setGroupCatalog] = useState({
    key: seriesColorKey,
    value: seriesCatalog,
  })
  if (groupCatalog.key !== seriesColorKey)
    setGroupCatalog({ key: seriesColorKey, value: seriesCatalog })
  const stableCatalog =
    groupCatalog.key === seriesColorKey ? groupCatalog.value : seriesCatalog
  const groups = useMemo(
    () => groupMapOffices(data.items, stableCatalog),
    [data.items, stableCatalog]
  )
  const selectedGroup =
    groups.find((group) => group.key === selectedGroupKey) ?? null
  const popupOffice =
    selectedOffice ??
    (selectedGroup?.offices.length === 1 ? selectedGroup.offices[0] : undefined)

  const [sheetContext, setSheetContext] = useState({
    isNarrow,
    selectedGroupKey,
  })
  if (
    sheetContext.isNarrow !== isNarrow ||
    sheetContext.selectedGroupKey !== selectedGroupKey
  ) {
    setSheetContext({ isNarrow, selectedGroupKey })
    setMobileSheetOpen(isNarrow && Boolean(selectedGroup))
  }
  if (selectedGroupKey && !selectedGroup) {
    setSelectedGroupKey(null)
    setMobileSheetOpen(false)
  }

  const selectGroup = useCallback(
    (groupKey: string) => {
      initialLocation.current.controller.abort()
      setSelectedOfficeId(null)
      setGroupFocus(null)
      setSelectedGroupKey(groupKey)
      if (webWorkspace) setOfficeListOpen(false)
      if (isNarrow) setMobileSheetOpen(true)
    },
    [isNarrow, webWorkspace]
  )

  const mapFailure =
    config.phase === "error" ? config.error : (moduleError ?? null)

  const clearSearchSelection = useCallback(() => {
    setSelectedPlace(null)
    setSelectedAttribution("")
  }, [])

  function retryMap() {
    setConfig(initialConfigState)
    setModuleError(null)
    setMapComponent(null)
    setSearchPlaces(null)
    setSelectedPlace(null)
    setSelectedAttribution("")
    void loadConfig()
  }

  function handleFatalError(error: Error) {
    setModuleError(error)
    setMapComponent(null)
  }

  function selectDirectoryOffice(office: Pick<FudabaOffice, "id">) {
    initialLocation.current.controller.abort()
    setOfficeListOpen(false)
    setSelectedOfficeId(office.id)
    const group = groups.find((group) =>
      group.offices.some((item) => item.id === office.id)
    )
    setSelectedGroupKey(group?.key ?? null)
    setGroupFocus(
      group ? { key: group.key, sequence: ++groupFocusSequence.current } : null
    )
  }

  return (
    <section
      ref={mapSurface}
      className="relative size-full min-h-0 overflow-hidden bg-[#e8f2f4]"
      aria-label="区域地图"
      data-exchange-web-map={IS_APP_TARGET ? undefined : ""}
      data-exchange-web-workspace={webWorkspace ? "" : undefined}
      data-office-list-open={webWorkspace && officeListOpen ? "" : undefined}
      data-map-results-state={data.phase}
    >
      {config.phase === "loading" ||
      (config.phase === "ready" && !MapComponent && !moduleError) ? (
        <div
          className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground"
          aria-live="polite"
        >
          <LoaderCircleIcon
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          正在准备区域地图
        </div>
      ) : null}

      {config.phase === "ready" && MapComponent ? (
        <MapComponent
          groups={groups}
          selectedGroupKey={selectedGroupKey}
          groupFocus={webWorkspace ? groupFocus : undefined}
          selectedPlace={selectedPlace}
          occlusion={occlusion}
          attributionPlacement={
            webWorkspace ? (isNarrow ? "above-overlay" : "corner") : undefined
          }
          claimInitialLocation={claimInitialLocation}
          onDevicePosition={reportDevicePosition}
          onSearchViewportCenter={reportSearchViewport}
          onSelectGroup={selectGroup}
          onViewportChange={onViewportChange}
          onFatalError={handleFatalError}
          onRetry={retryMap}
          onClearSearchSelection={clearSearchSelection}
          onAttributionChange={onAttributionChange}
        />
      ) : null}

      {mapFailure && !searchExpanded ? (
        <MapUnavailable
          message={mapFailure}
          onRetry={retryMap}
          onSwitchDirectory={onSwitchDirectory}
        />
      ) : null}

      {!mapFailure &&
      !webWorkspace &&
      !searchExpanded &&
      data.phase !== "error" &&
      ((!data.hasResult && data.phase !== "ready") ||
        !groups.length ||
        data.truncated) ? (
        <div
          className={cn(
            "pointer-events-none absolute left-3 z-10 max-w-[calc(100%-5.5rem)] rounded-lg border bg-background/95 px-2.5 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur-sm",
            IS_APP_TARGET && "exchange-map-app-surface",
            IS_APP_TARGET
              ? "top-[calc(var(--app-header-inset)+0.75rem)]"
              : "top-3 lg:top-20 lg:left-4 lg:max-w-72 xl:max-w-80",
            !IS_APP_TARGET && selectedPlace && "lg:hidden"
          )}
          data-map-point-count
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-1.5">
            {data.phase === "loading" && !data.hasResult ? (
              <LoaderCircleIcon
                className="size-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <MapIcon className="size-3.5 text-primary" aria-hidden="true" />
            )}
            {data.phase === "idle"
              ? "等待地图范围"
              : data.phase === "loading" && !data.hasResult
                ? "正在更新地图结果"
                : groups.length
                  ? `${groups.length} 个区域点`
                  : "当前范围内没有公开事务所"}
          </span>
          {data.truncated ? (
            <span className="mt-1 block text-warning-foreground">
              当前范围结果较多，请放大地图或收窄筛选。
            </span>
          ) : null}
        </div>
      ) : null}

      {webWorkspace ? (
        <ExchangeWebMapOffices
          open={officeListOpen}
          onOpenChange={setOfficeListOpen}
          items={data.items}
          series={seriesCatalog}
          hasResult={data.hasResult}
          truncated={data.truncated}
          error={data.phase === "error" ? data.error : null}
          onSelect={selectDirectoryOffice}
          onOpenDirectory={onSwitchDirectory}
          onRetry={refreshMapOffices}
        />
      ) : null}

      {webWorkspace && searchTools ? (
        <Button
          type="button"
          size="icon-lg"
          variant="secondary"
          className="exchange-web-refresh"
          aria-label="刷新地图结果"
          disabled={searchTools.refreshing}
          onClick={() => {
            refreshMapOffices()
            searchTools.onRefresh()
          }}
        >
          <RefreshCwIcon
            className={cn(
              searchTools.refreshing &&
                "animate-spin motion-reduce:animate-none"
            )}
            aria-hidden="true"
          />
        </Button>
      ) : null}

      {data.phase === "error" &&
      !mapFailure &&
      !searchExpanded &&
      !(webWorkspace && officeListOpen) ? (
        <Alert
          className={cn(
            "absolute inset-x-3 z-10 bg-background/95 shadow-sm sm:left-auto sm:w-96",
            webWorkspace && "exchange-web-map-warning",
            IS_APP_TARGET
              ? APP_FLOATING_CONTROL_OFFSET
              : "bottom-[max(2.75rem,calc(env(safe-area-inset-bottom)+2.25rem))]"
          )}
        >
          <RefreshCwIcon aria-hidden="true" />
          <AlertTitle>地图数据更新失败</AlertTitle>
          <AlertDescription>
            {data.error}。已保留上次成功结果。
          </AlertDescription>
          <div className="col-start-2 mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={refreshMapOffices}
            >
              重试
            </Button>
            <Button type="button" size="sm" onClick={onSwitchDirectory}>
              查看名录
            </Button>
          </div>
        </Alert>
      ) : null}

      {selectedGroup && !webWorkspace ? (
        <aside
          className={cn(
            "absolute top-3 right-3 z-10 hidden w-80 overflow-y-auto rounded-lg border bg-background/97 p-4 shadow-md backdrop-blur-sm lg:block",
            IS_APP_TARGET
              ? "max-h-[calc(var(--app-content-height)-1.5rem)]"
              : "top-4 right-4 max-h-[calc(100%-2rem)]"
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-2 right-2"
            aria-label="关闭区域详情"
            onClick={() => setSelectedGroupKey(null)}
          >
            <XIcon aria-hidden="true" />
          </Button>
          <div className="pr-8">
            <OfficeGroupDetails group={selectedGroup} />
          </div>
        </aside>
      ) : null}

      {searchTools && !webWorkspace ? (
        <ExchangeSearchCard
          tabs={workspaceSearch.tabs}
          {...searchTools}
          onExpandedChange={setSearchExpanded}
          modalOpen={
            searchTools.modalOpen || (mobileSheetOpen && Boolean(selectedGroup))
          }
          model={{
            ...searchModel,
            attribution: searchModel.attribution || selectedAttribution,
          }}
          selectedPlace={selectedPlace}
          onSelect={selectSearchResult}
          onClear={() => {
            setSelectedPlace(null)
            setSelectedAttribution("")
          }}
          pointCount={groups.length}
          feedbackKind={
            mapFailure || data.phase === "error"
              ? "error"
              : data.truncated
                ? "notice"
                : data.phase === "loading" && !data.hasResult
                  ? "loading"
                  : "empty"
          }
          feedbackMessage={
            mapFailure
              ? mapFailureDescription(mapFailure)
              : data.phase === "error"
                ? `地图数据更新失败：${data.error}。已保留上次成功结果。`
                : data.truncated
                  ? "当前范围结果较多，请放大地图或收窄筛选。"
                  : data.phase === "loading" && !data.hasResult
                    ? "正在更新地图结果"
                    : data.phase === "ready" && !groups.length
                      ? "当前范围内没有公开事务所"
                      : undefined
          }
          onRetry={
            mapFailure
              ? retryMap
              : data.phase === "error"
                ? refreshMapOffices
                : undefined
          }
          onOcclusion={updateOcclusion}
        />
      ) : null}

      {webWorkspace && webDiscovery && searchTools ? (
        <>
          <ExchangeWebMapWorkspace
            tabs={workspaceSearch.tabs}
            covered={isNarrow && officeListOpen}
            onActivate={() => {
              if (isNarrow) setOfficeListOpen(false)
              clearOfficeSelection()
            }}
            model={searchModel}
            searchOwner={workspaceSearch.owner}
            available={
              workspaceSearch.available &&
              (workspaceSearch.tabs.active === "offices" || !mapFailure)
            }
            automatic={
              workspaceSearch.tabs.active === "offices" ||
              (config.phase === "ready" &&
                config.value.search.provider !== "nominatim")
            }
            tools={searchTools}
            selectionKey={selectedGroupKey}
            selectedPlace={selectedPlace}
            selectedAttribution={selectedAttribution}
            onSelect={selectSearchResult}
            onClear={clearSearchSelection}
            onOcclusion={updateOcclusion}
          />
          <ExchangeMapPointPopup
            map={mapSurface}
            groupKey={selectedGroup?.key ?? null}
            focusRequest={groupFocus?.sequence}
            covered={Boolean(searchTools.modalOpen) || officeListOpen}
            onClose={clearOfficeSelection}
          >
            {popupOffice ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 text-base/7 font-semibold wrap-break-word">
                    {popupOffice.name}
                  </h3>
                  <OfficeStatus open={popupOffice.isOpen} />
                </div>
                <p className="text-sm/6 wrap-break-word text-muted-foreground">
                  {popupOffice.address}
                </p>
                {"intro" in popupOffice && popupOffice.intro ? (
                  <p className="text-sm/6 wrap-break-word">
                    {popupOffice.intro}
                  </p>
                ) : null}
                <NavigationLink
                  to={`/community/exchange/offices/${encodeURIComponent(popupOffice.slug)}`}
                  className={cn(
                    buttonVariants({ variant: "default" }),
                    "w-full"
                  )}
                >
                  查看事务所
                </NavigationLink>
              </div>
            ) : selectedGroup ? (
              <OfficeGroupDetails group={selectedGroup} />
            ) : null}
          </ExchangeMapPointPopup>
        </>
      ) : null}

      <Sheet
        open={
          !webWorkspace && isNarrow && mobileSheetOpen && Boolean(selectedGroup)
        }
        onOpenChange={setMobileSheetOpen}
      >
        <SheetContent
          side="bottom"
          className="exchange-map-detail-sheet overflow-y-auto"
        >
          <SheetHeader className="border-b pr-14">
            <SheetTitle>区域交换事务所</SheetTitle>
            <SheetDescription>
              地图使用区域化位置，并展示事务所公开地址。
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-2">
            {selectedGroup ? (
              <OfficeGroupDetails group={selectedGroup} />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}
