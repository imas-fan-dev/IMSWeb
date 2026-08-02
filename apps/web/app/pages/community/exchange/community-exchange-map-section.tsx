import {
  Building2Icon,
  LoaderCircleIcon,
  MapIcon,
  MapPinOffIcon,
  RefreshCwIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react"
import { Link } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button, buttonVariants } from "~/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"
import {
  getFudabaMapConfig,
  getFudabaMapOffices,
  type FudabaMapBounds,
  type FudabaMapOffice,
} from "~/lib/api"
import { cn } from "~/lib/utils"
import {
  groupMapOffices,
  mergeMapOfficeResponses,
  type FudabaMapOfficeGroup,
} from "./exchange-map-model"
import type { ExchangeOfficeMapProps } from "./exchange-office-map"

type MapComponent = ComponentType<ExchangeOfficeMapProps>
type ConfigState =
  | { phase: "loading"; styleUrl: null; error: null }
  | { phase: "ready"; styleUrl: string; error: null }
  | { phase: "error"; styleUrl: null; error: string }

interface MapDataState {
  phase: "idle" | "loading" | "ready" | "error"
  items: FudabaMapOffice[]
  truncated: boolean
  error: string | null
}

const initialConfigState: ConfigState = {
  phase: "loading",
  styleUrl: null,
  error: null,
}

const initialDataState: MapDataState = {
  phase: "idle",
  items: [],
  truncated: false,
  error: null,
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function useNarrowMapLayout() {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
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
        <p className="text-xs font-semibold text-muted-foreground">
          约 0.1° 区域位置
        </p>
        <h3 className="mt-1 text-base font-semibold">
          {group.offices.length} 个交换事务所
        </h3>
      </div>
      <div className="divide-y border-y">
        {group.offices.map((office) => (
          <article key={office.id} className="py-4 first:pt-3 last:pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="font-medium wrap-break-word">{office.name}</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  {office.city}
                </p>
              </div>
              <OfficeStatus open={office.isOpen} />
            </div>
            <Link
              to={`/community/exchange/offices/${encodeURIComponent(office.slug)}`}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "mt-3"
              )}
            >
              查看事务所
            </Link>
          </article>
        ))}
      </div>
    </div>
  )
}

function OfficeGroupList({
  groups,
  selectedGroupKey,
  onSelect,
}: {
  groups: FudabaMapOfficeGroup[]
  selectedGroupKey: string | null
  onSelect: (groupKey: string) => void
}) {
  if (!groups.length) {
    return (
      <p className="py-3 text-sm text-muted-foreground">
        当前地图范围内没有公开事务所。
      </p>
    )
  }

  return (
    <div className="divide-y border-y">
      {groups.map((group) => (
        <button
          key={group.key}
          type="button"
          aria-pressed={selectedGroupKey === group.key}
          aria-label={`${group.offices
            .map((office) => office.name)
            .join("、")}，${group.offices.length} 个事务所`}
          className="flex w-full items-center gap-3 py-3 text-left outline-none hover:bg-muted/45 focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted/60"
          onClick={() => onSelect(group.key)}
        >
          <span
            className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background text-sm font-semibold"
            aria-hidden="true"
          >
            {group.offices.length}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              {group.offices[0]?.name}
            </span>
            <span className="block text-xs text-muted-foreground">
              {group.offices[0]?.city} · {group.offices.length} 个事务所
            </span>
          </span>
          <span className="flex h-5 w-2 shrink-0 flex-col overflow-hidden rounded-sm">
            {group.colors.slice(0, 6).map((color) => (
              <span
                key={color}
                className="min-h-px flex-1"
                style={{ backgroundColor: color }}
              />
            ))}
          </span>
        </button>
      ))}
    </div>
  )
}

function MapUnavailable({
  message,
  onRetry,
  onSwitchDirectory,
}: {
  message: string
  onRetry: () => void
  onSwitchDirectory: () => void
}) {
  return (
    <Empty className="absolute inset-0 bg-muted/25 px-5">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MapPinOffIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>地图暂时不可用</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" variant="outline" onClick={onRetry}>
          <RefreshCwIcon aria-hidden="true" />
          重试地图
        </Button>
        <Button type="button" onClick={onSwitchDirectory}>
          <Building2Icon aria-hidden="true" />
          查看事务所名录
        </Button>
      </div>
    </Empty>
  )
}

export function CommunityExchangeMapSection({
  city,
  series,
  open,
  onSwitchDirectory,
}: {
  city?: string
  series?: string
  open?: boolean
  onSwitchDirectory: () => void
}) {
  const [config, setConfig] = useState<ConfigState>(initialConfigState)
  const [MapComponent, setMapComponent] = useState<MapComponent | null>(null)
  const [moduleError, setModuleError] = useState<string | null>(null)
  const [moduleAttempt, setModuleAttempt] = useState(0)
  const [data, setData] = useState<MapDataState>(initialDataState)
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const configGeneration = useRef(0)
  const dataGeneration = useRef(0)
  const lastBoundsRef = useRef<FudabaMapBounds[] | null>(null)
  const isNarrow = useNarrowMapLayout()

  const loadConfig = useCallback(async () => {
    const generation = ++configGeneration.current
    setConfig(initialConfigState)
    setModuleError(null)
    setMapComponent(null)
    try {
      const result = await getFudabaMapConfig().send()
      if (configGeneration.current !== generation) return
      setConfig({ phase: "ready", styleUrl: result.styleUrl, error: null })
    } catch (error) {
      if (configGeneration.current !== generation) return
      setConfig({
        phase: "error",
        styleUrl: null,
        error: errorMessage(error, "地图配置无法加载"),
      })
    }
  }, [])

  useEffect(() => {
    void loadConfig()
    return () => {
      configGeneration.current += 1
    }
  }, [loadConfig])

  useEffect(() => {
    if (config.phase !== "ready") return
    let active = true
    setModuleError(null)
    void import("./exchange-office-map")
      .then((module) => {
        if (active) setMapComponent(() => module.ExchangeOfficeMap)
      })
      .catch((error) => {
        if (active) {
          setModuleError(errorMessage(error, "地图模块无法加载"))
        }
      })
    return () => {
      active = false
    }
  }, [config.phase, moduleAttempt])

  const loadBounds = useCallback(
    async (bounds: FudabaMapBounds[]) => {
      const generation = ++dataGeneration.current
      lastBoundsRef.current = bounds
      setData((current) => ({
        ...current,
        phase: "loading",
        error: null,
      }))
      try {
        const responses = await Promise.all(
          bounds.map((bbox) =>
            getFudabaMapOffices({
              bbox,
              city,
              series,
              open,
              limit: 200,
            }).send()
          )
        )
        if (dataGeneration.current !== generation) return
        const merged = mergeMapOfficeResponses(responses)
        setData({
          phase: "ready",
          items: merged.items,
          truncated: merged.truncated,
          error: null,
        })
      } catch (error) {
        if (dataGeneration.current !== generation) return
        setData((current) => ({
          ...current,
          phase: "error",
          error: errorMessage(error, "地图范围内的事务所无法加载"),
        }))
      }
    },
    [city, open, series]
  )

  useEffect(() => {
    const bounds = lastBoundsRef.current
    if (bounds) void loadBounds(bounds)
    return () => {
      dataGeneration.current += 1
    }
  }, [loadBounds])

  const groups = useMemo(() => groupMapOffices(data.items), [data.items])
  const selectedGroup =
    groups.find((group) => group.key === selectedGroupKey) ?? null

  useEffect(() => {
    if (selectedGroupKey && !selectedGroup) {
      setSelectedGroupKey(null)
      setMobileSheetOpen(false)
    }
  }, [selectedGroup, selectedGroupKey])

  const selectGroup = useCallback(
    (groupKey: string) => {
      setSelectedGroupKey(groupKey)
      if (isNarrow) setMobileSheetOpen(true)
    },
    [isNarrow]
  )

  const mapFailure =
    config.phase === "error" ? config.error : (moduleError ?? null)

  function retryMap() {
    if (config.phase === "error") void loadConfig()
    else setModuleAttempt((attempt) => attempt + 1)
  }

  function handleFatalError(error: Error) {
    setModuleError(error.message)
    setMapComponent(null)
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <MapIcon aria-hidden="true" className="size-4 text-primary" />
          <span className="font-medium">区域地图</span>
          {data.phase === "loading" ? (
            <span
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
              aria-live="polite"
            >
              <LoaderCircleIcon
                aria-hidden="true"
                className="size-3.5 animate-spin motion-reduce:animate-none"
              />
              更新中
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          位置已按约 0.1° 区域显示
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="relative h-120 min-h-96 bg-muted/35 sm:h-136 lg:h-144">
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
              styleUrl={config.styleUrl}
              groups={groups}
              selectedGroupKey={selectedGroupKey}
              onSelectGroup={selectGroup}
              onViewportChange={(bounds) => void loadBounds(bounds)}
              onFatalError={handleFatalError}
            />
          ) : null}
          {mapFailure ? (
            <MapUnavailable
              message={mapFailure}
              onRetry={retryMap}
              onSwitchDirectory={onSwitchDirectory}
            />
          ) : null}
          {data.phase === "error" && !mapFailure ? (
            <Alert className="absolute inset-x-3 top-3 z-10 bg-background/95">
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
                  onClick={() => {
                    const bounds = lastBoundsRef.current
                    if (bounds) void loadBounds(bounds)
                  }}
                >
                  重试
                </Button>
                <Button type="button" size="sm" onClick={onSwitchDirectory}>
                  查看名录
                </Button>
              </div>
            </Alert>
          ) : null}
        </div>

        <aside className="hidden min-h-144 border-l p-4 lg:block">
          {selectedGroup ? (
            <OfficeGroupDetails group={selectedGroup} />
          ) : (
            <>
              <h3 className="font-semibold">当前地图中的事务所</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                选择区域点查看事务所。
              </p>
              <div className="mt-4 max-h-116 overflow-y-auto pr-1">
                <OfficeGroupList
                  groups={groups}
                  selectedGroupKey={selectedGroupKey}
                  onSelect={selectGroup}
                />
              </div>
            </>
          )}
        </aside>
      </div>

      {data.truncated ? (
        <Alert className="rounded-none border-x-0 border-b-0">
          <MapIcon aria-hidden="true" />
          <AlertTitle>当前范围内事务所较多</AlertTitle>
          <AlertDescription>
            请放大地图或收窄筛选条件以查看完整结果。
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="border-t p-3 lg:hidden">
        <h3 className="text-sm font-semibold">地图中的事务所列表</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          列表与地图使用相同的区域结果。
        </p>
        <div className="mt-2 max-h-40 overflow-y-auto pr-1">
          <OfficeGroupList
            groups={groups}
            selectedGroupKey={selectedGroupKey}
            onSelect={selectGroup}
          />
        </div>
      </div>

      <Sheet
        open={isNarrow && mobileSheetOpen && Boolean(selectedGroup)}
        onOpenChange={setMobileSheetOpen}
      >
        <SheetContent side="bottom" className="max-h-[78dvh] overflow-y-auto">
          <SheetHeader className="border-b pr-14">
            <SheetTitle>区域交换事务所</SheetTitle>
            <SheetDescription>地图仅展示约 0.1° 的区域位置。</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-5">
            {selectedGroup ? (
              <OfficeGroupDetails group={selectedGroup} />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
