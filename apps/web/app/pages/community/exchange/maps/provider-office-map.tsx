import { LoaderCircleIcon, LocateFixedIcon } from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { Button } from "~/components/ui/button"
import { IS_APP_TARGET } from "~/lib/app-target"
import { GeolocationFailure, getCurrentCoordinates } from "~/lib/geolocation"
import { useNativeGlassControl } from "~/lib/native-glass-controls"
import { awaitMapSearch } from "~/lib/maps/map-search-abort"
import { cn } from "~/lib/utils"
import { createUserLocationMarker } from "./user-location-marker"
import { createPointPickerMarker } from "./point-picker-marker"
import type {
  MapDriver,
  MapView,
  MapMarker,
  MapPosition,
} from "~/lib/maps/map-engine"
import {
  createClusterMarker,
  createOfficeGroupMarker,
} from "./exchange-map-markers"
import {
  DEFAULT_EXCHANGE_MAP_VIEWPORT,
  exchangeMapInitialViewport,
  EXCHANGE_MAP_MIN_ZOOM,
  EXCHANGE_MAP_SEARCH_ZOOM,
  EXCHANGE_MAP_FLOATING_GROUP,
  splitViewportBounds,
  groupMapMarkers,
} from "./exchange-map-model"
import type { ExchangeMapInteractionProps } from "./exchange-map-provider"
import type { ExchangeMapAttribution } from "./exchange-map-attribution"

type Props = ExchangeMapInteractionProps & {
  driver: MapDriver
  attribution: ExchangeMapAttribution
  regionSession?: number
  initialTarget?: import("~/lib/maps/map-search").MapSearchTarget
  initialMapZoom?: number
  focusSelectedPlace?: boolean
  persistViewport?: boolean
  onRegionCamera?(
    camera: import("~/pages/community/exchange/maps/regional/model").RegionalCamera
  ): void
  onRegionalSessionCamera?(
    camera: import("~/pages/community/exchange/maps/regional/model").RegionalCamera,
    session: number
  ): void
}
const reducedMotion = () =>
  Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)

export function ProviderOfficeMap(props: Props) {
  const {
    driver,
    groups,
    selectedGroupKey,
    groupFocus,
    selectedPlace,
    occlusion,
    attributionPlacement,
    pointPicker,
    regionSession,
    initialTarget,
    initialMapZoom,
    persistViewport,
    onRegionCamera,
    onRegionalSessionCamera,
    focusSelectedPlace = true,
  } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  const runtime = useRef<MapView | null>(null)
  const [ready, setReady] = useState(false)
  const [resourceError, setResourceError] = useState(false)
  const [location, setLocation] = useState({
    busy: false,
    message: "",
    error: false,
  })
  const [size, setSize] = useState({ width: 0, height: 0 })
  const locationRequest = useRef(0)
  const userMarker = useRef<MapMarker | null>(null)
  const userLocationContent = useRef<ReturnType<
    typeof createUserLocationMarker
  > | null>(null)
  const refreshMarkers = useRef(() => {})
  useLayoutEffect(() => {
    latest.current = props
  })

  const focus = useCallback(
    async (
      map: MapView,
      position: MapPosition | import("~/lib/maps/map-search").MapSearchTarget,
      zoom: number,
      avoidSearch = false,
      signal?: AbortSignal
    ) => {
      const frame = avoidSearch ? latest.current.occlusion : null
      const options = {
        zoom,
        duration:
          latest.current.persistViewport === false || frame || reducedMotion()
            ? 0
            : 900,
        ...(signal ? { signal } : {}),
      }
      const outcome = Array.isArray(position)
        ? await map.focus(position, options)
        : await map.focusSearch(position, options)
      if (outcome === false) return false
      if (!frame || runtime.current !== map || signal?.aborted) return
      // Keep the target in the centre of the unobscured map surface.
      if (frame.width < (containerRef.current?.clientWidth ?? 0) * 0.65)
        map.panBy(
          { x: (frame.x + frame.width + 12) / 2, y: 0 },
          reducedMotion() ? 0 : 900
        )
      else
        map.panBy(
          {
            x: 0,
            y: -((containerRef.current?.clientHeight ?? 0) - frame.y + 12) / 2,
          },
          reducedMotion() ? 0 : 900
        )
    },
    []
  )

  const locateUser = useCallback(
    async (initialSignal?: AbortSignal) => {
      const current = runtime.current
      if (!current) return
      if (!initialSignal) latest.current.claimInitialLocation?.()
      const request = ++locationRequest.current
      userLocationContent.current?.dismissHint()
      setLocation({
        busy: true,
        message: initialSignal ? "" : "正在获取您的位置",
        error: false,
      })
      try {
        const coordinates = await (initialSignal
          ? awaitMapSearch(getCurrentCoordinates(), initialSignal)
          : getCurrentCoordinates())
        if (request !== locationRequest.current || runtime.current !== current)
          return
        if (initialSignal?.aborted) {
          setLocation({ busy: false, message: "", error: false })
          return
        }
        const position: MapPosition = [
          coordinates.longitude,
          coordinates.latitude,
        ]
        const content = createUserLocationMarker()
        const marker = await current.addMarker({
          position,
          element: content.element,
          anchor: "center",
        })
        if (
          request !== locationRequest.current ||
          runtime.current !== current ||
          initialSignal?.aborted
        ) {
          marker.remove()
          if (
            request === locationRequest.current &&
            runtime.current === current
          )
            setLocation({ busy: false, message: "", error: false })
          return
        }
        userMarker.current?.remove()
        userLocationContent.current?.dismissHint()
        userMarker.current = marker
        userLocationContent.current = content
        latest.current.onDevicePosition?.(position)
        const outcome = await focus(
          current,
          position,
          Math.max(current.read().zoom, 8),
          false,
          initialSignal
        )
        if (request !== locationRequest.current || runtime.current !== current)
          return
        setLocation({
          busy: false,
          message: initialSignal || outcome === false ? "" : "定位完成",
          error: false,
        })
        if (!initialSignal && outcome !== false) content.showHint()
      } catch (error) {
        if (request !== locationRequest.current || runtime.current !== current)
          return
        setLocation({
          busy: false,
          error: !initialSignal,
          message: initialSignal
            ? ""
            : error instanceof GeolocationFailure &&
                error.kind === "permission-denied"
              ? "未获得位置权限"
              : "暂时无法获取您的位置，请重试",
        })
      }
    },
    [focus]
  )
  const { controlRef, refreshGeometry } = useNativeGlassControl(
    persistViewport === false ? "office-picker-locate" : "locate",
    {
      kind: "icon-button",
      icon: location.busy ? "loader-circle" : "locate-fixed",
      label: "回到我的位置",
      group:
        persistViewport === false
          ? "office-picker"
          : EXCHANGE_MAP_FLOATING_GROUP,
      disabled: !ready || location.busy,
    },
    () => {
      void locateUser()
    }
  )
  useLayoutEffect(() => {
    refreshGeometry()
  }, [refreshGeometry, occlusion, size])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let disposed = false
    let map: MapView | null = null
    const controller = new AbortController()
    const markers = new Map<
      string,
      { marker: MapMarker; element: HTMLElement; signature: string }
    >()
    let renderGeneration = 0
    let initialized = false
    let failed = false
    let cameraTimer: ReturnType<typeof setTimeout> | undefined
    setReady(false)
    setResourceError(false)
    setLocation({ busy: false, message: "", error: false })
    const measure = () => {
      setSize({ width: container.clientWidth, height: container.clientHeight })
      if (initialized && map) {
        map.resize?.()
        updateViewport()
      }
    }
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    measure()
    const fail = (error?: Error) => {
      if (disposed || failed) return
      failed = true
      controller.abort()
      container.dataset.mapState = "error"
      latest.current.onFatalError(
        error ?? new Error("地图无法加载，请检查地图服务配置和网络")
      )
    }
    const updateViewport = (
      change?: import("~/lib/maps/map-camera-change").MapCameraChange
    ) => {
      if (!map || disposed) return
      latest.current.onViewportChange(splitViewportBounds(map.read().bounds))
      if (map.readCamera) {
        const camera = map.readCamera()
        if (camera.target.kind === "wgs84") {
          latest.current.onSearchViewportCenter?.(camera.target.position)
          latest.current.onCameraChange?.(camera.target.position, change)
        }
      }
      const current = map
      if ((onRegionCamera || onRegionalSessionCamera) && current.readCamera) {
        clearTimeout(cameraTimer)
        cameraTimer = setTimeout(() => {
          if (!disposed && runtime.current === current && current.readCamera) {
            const snapshot = current.readCamera()
            onRegionCamera?.(snapshot)
            onRegionalSessionCamera?.(snapshot, regionSession ?? 0)
          }
        }, 180)
      }
      refreshMarkers.current()
    }
    const initTimer = setTimeout(fail, 20000)
    void driver
      .open(container, {
        viewport:
          latest.current.initialViewport ??
          (IS_APP_TARGET
            ? exchangeMapInitialViewport()
            : DEFAULT_EXCHANGE_MAP_VIEWPORT),
        ...(initialTarget ? { initialTarget } : {}),
        ...(initialMapZoom === undefined
          ? {}
          : {
              viewport: {
                center: DEFAULT_EXCHANGE_MAP_VIEWPORT.center,
                zoom: initialMapZoom,
              },
            }),
        ...(persistViewport === undefined ? {} : { persistViewport }),
        minZoom: EXCHANGE_MAP_MIN_ZOOM,
        signal: controller.signal,
        onChange: updateViewport,
        onResourceError: () => {
          if (!disposed) setResourceError(true)
        },
        onMapClick: (target) => {
          const picker = latest.current.pointPicker
          if (!disposed && picker && !picker.disabled)
            picker.onPick(target, "click")
        },
      })
      .then((view) => {
        if (disposed || controller.signal.aborted) {
          view.destroy()
          return
        }
        map = view
        runtime.current = view
        refreshMarkers.current = () => {
          const generation = ++renderGeneration
          const currentGroups = latest.current.groups
          void Promise.resolve()
            .then(async () => {
              if (!map || disposed || generation !== renderGeneration) return
              const selected = !IS_APP_TARGET
                ? currentGroups.find(
                    (group) => group.key === latest.current.selectedGroupKey
                  )
                : undefined
              const cells = groupMapMarkers(
                selected
                  ? currentGroups.filter((group) => group !== selected)
                  : currentGroups,
                view.read().zoom
              )
              // A directory selection may target a point inside a cluster.
              if (selected) cells.push([selected])
              const seen = new Set<string>()
              for (const cell of cells) {
                const group = cell[0]!
                const position: MapPosition = [group.longitude, group.latitude]
                const key =
                  cell.length > 1
                    ? `cluster:${cell.map((item) => item.key).join(";")}`
                    : `office:${group.key}`
                seen.add(key)
                const signature = JSON.stringify({
                  position,
                  groups: cell.map((item) => ({
                    colors: item.colors,
                    offices: item.offices.map(({ id, name }) => [id, name]),
                  })),
                })
                const existing = markers.get(key)
                if (existing?.signature === signature) {
                  if (cell.length === 1) {
                    const selected =
                      group.key === latest.current.selectedGroupKey
                    existing.element.setAttribute(
                      "aria-pressed",
                      String(selected)
                    )
                    existing.element.classList.toggle("ring-3", selected)
                    existing.element.classList.toggle(
                      "ring-primary/60",
                      selected
                    )
                  }
                  continue
                }
                markers.delete(key)
                existing?.marker.remove()
                const element =
                  cell.length > 1
                    ? createClusterMarker(cell.length)
                    : createOfficeGroupMarker(
                        group,
                        group.key === latest.current.selectedGroupKey
                      )
                element.addEventListener("click", () => {
                  if (cell.length > 1 && map)
                    void focus(map, position, map.read().zoom + 2).catch(
                      (error: unknown) => {
                        if (!disposed)
                          latest.current.onFatalError(
                            error instanceof Error
                              ? error
                              : new Error("地图无法定位")
                          )
                      }
                    )
                  else latest.current.onSelectGroup(group.key)
                })
                const marker = await view.addMarker({
                  position,
                  element,
                  anchor: "bottom",
                })
                if (disposed || generation !== renderGeneration) {
                  marker.remove()
                  return
                }
                markers.set(key, {
                  element,
                  signature,
                  marker,
                })
              }
              for (const [key, { marker }] of markers) {
                if (!seen.has(key)) {
                  marker.remove()
                  markers.delete(key)
                }
              }
            })
            .catch((error: unknown) => {
              if (!disposed && generation === renderGeneration)
                latest.current.onFatalError(
                  error instanceof Error ? error : new Error("地图点位无法加载")
                )
            })
        }
        initialized = true
        clearTimeout(initTimer)
        container.dataset.mapState = "ready"
        setReady(true)
        latest.current.onAttributionChange?.(latest.current.attribution)
        updateViewport()
        const initialSignal = latest.current.claimInitialLocation?.()
        if (
          initialSignal &&
          !initialSignal.aborted &&
          !latest.current.selectedPlace
        )
          void locateUser(initialSignal)
      })
      .catch((error: unknown) => {
        if (!disposed)
          fail(error instanceof Error ? error : new Error("地图加载失败"))
      })
    return () => {
      disposed = true
      clearTimeout(initTimer)
      clearTimeout(cameraTimer)
      observer.disconnect()
      userMarker.current?.remove()
      userMarker.current = null
      userLocationContent.current?.dismissHint()
      userLocationContent.current = null
      for (const { marker } of markers.values()) marker.remove()
      latest.current.onAttributionChange?.(null)
      refreshMarkers.current = () => {}
      runtime.current = null
      controller.abort()
      map?.destroy()
    }
  }, [
    driver,
    focus,
    locateUser,
    regionSession,
    initialMapZoom,
    initialTarget,
    onRegionCamera,
    onRegionalSessionCamera,
    persistViewport,
  ])

  useEffect(() => {
    if (ready) refreshMarkers.current()
  }, [groups, selectedGroupKey, ready])
  useEffect(() => {
    const current = runtime.current
    if (
      !current ||
      !ready ||
      !groupFocus ||
      groupFocus.key !== selectedGroupKey
    )
      return
    const group = latest.current.groups.find(
      (item) => item.key === groupFocus.key
    )
    if (!group) return
    const controller = new AbortController()
    void focus(
      current,
      [group.longitude, group.latitude],
      current.read().zoom,
      false,
      controller.signal
    ).catch((error: unknown) => {
      if (!controller.signal.aborted && runtime.current === current)
        latest.current.onFatalError(
          error instanceof Error ? error : new Error("地图无法定位")
        )
    })
    return () => controller.abort()
  }, [groupFocus, selectedGroupKey, ready, focus])
  const pickerEnabled = Boolean(pointPicker)
  useEffect(() => {
    const current = runtime.current
    if (!current || !ready || !selectedPlace) return
    const element = document.createElement("div")
    element.className =
      "size-5 rounded-full border-3 border-background bg-primary shadow-md"
    element.setAttribute("role", "img")
    element.setAttribute("aria-label", `搜索地点：${selectedPlace.label}`)
    let disposed = false
    const controller = new AbortController()
    let marker: MapMarker | undefined
    const target = selectedPlace.target
    void (async () => {
      if (!pickerEnabled) {
        const next = await current.addSearchMarker({
          target,
          element,
          anchor: "center",
        })
        if (disposed || runtime.current !== current) {
          next.remove()
          return
        }
        marker = next
      }
      if (!focusSelectedPlace) return
      await focus(
        current,
        target,
        selectedPlace.zoom ?? EXCHANGE_MAP_SEARCH_ZOOM,
        true,
        controller.signal
      )
    })().catch((error: unknown) => {
      if (!disposed && runtime.current === current)
        latest.current.onFatalError(
          error instanceof Error ? error : new Error("搜索地点定位失败")
        )
    })
    return () => {
      disposed = true
      controller.abort()
      marker?.remove()
    }
    // Occlusion changes must not repeatedly move an already selected place.
  }, [selectedPlace, ready, focus, focusSelectedPlace, pickerEnabled])

  const pickerTarget = pointPicker?.target
  const pickerDisabled = pointPicker?.disabled ?? true
  useEffect(() => {
    const current = runtime.current
    if (!current || !ready || !pickerTarget) return
    let disposed = false
    let marker: MapMarker | undefined
    const activePicker = () => {
      const picker = latest.current.pointPicker
      return !disposed &&
        runtime.current === current &&
        picker &&
        !picker.disabled
        ? picker
        : null
    }
    void current
      .addSearchMarker({
        target: pickerTarget,
        element: createPointPickerMarker(pickerDisabled),
        anchor: "bottom",
        draggable: !pickerDisabled,
        onDragStart: () => activePicker()?.onPickStart?.(),
        onDragEnd: (target) => activePicker()?.onPick(target, "drag"),
      })
      .then((next) => {
        if (disposed || runtime.current !== current) next.remove()
        else marker = next
      })
      .catch((error: unknown) => {
        if (!disposed && runtime.current === current)
          latest.current.onFatalError(
            error instanceof Error ? error : new Error("选点浮标无法加载")
          )
      })
    return () => {
      disposed = true
      marker?.remove()
    }
  }, [pickerTarget, pickerDisabled, ready])

  const bottom = occlusion
    ? occlusion.width < size.width * 0.65
      ? 12
      : Math.max(12, size.height - occlusion.y + 12)
    : undefined
  const attributionOcclusion =
    attributionPlacement === "corner" ? null : occlusion
  const sidePanel =
    attributionPlacement !== "above-overlay" &&
    attributionOcclusion &&
    attributionOcclusion.width < size.width * 0.65
  const attributionBottom =
    attributionOcclusion && !sidePanel
      ? Math.max(8, size.height - attributionOcclusion.y + 12)
      : 8
  const attributionLeft =
    attributionOcclusion && sidePanel
      ? Math.max(8, attributionOcclusion.x + attributionOcclusion.width + 12)
      : 8
  return (
    <div className="relative size-full min-h-0 bg-[#e8f2f4]">
      <div
        ref={containerRef}
        className={cn("size-full min-h-0", driver.containerClassName)}
        style={
          {
            "--map-attribution-bottom":
              attributionPlacement === "corner"
                ? "calc(8px + env(safe-area-inset-bottom, 0px))"
                : `${attributionBottom}px`,
            "--map-attribution-left": `${attributionLeft}px`,
            "--map-attribution-right": attributionOcclusion ? "64px" : "0px",
          } as CSSProperties
        }
        data-exchange-office-map
        data-map-provider={driver.id}
        data-map-state="loading"
        aria-label="区域事务所地图工作面"
      />
      {resourceError ? (
        <div
          role="status"
          className="absolute top-3 right-3 z-20 max-w-xs rounded-md border bg-background/95 p-3 text-sm shadow-sm"
        >
          <p>部分地图资源加载失败，已保留当前地图。</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              if (latest.current.onRetry) latest.current.onRetry()
              else latest.current.onFatalError(new Error("地图资源加载失败"))
            }}
          >
            重试地图
          </Button>
        </div>
      ) : null}
      <div
        className={
          occlusion
            ? cn(
                "exchange-map-side-controls",
                IS_APP_TARGET && "exchange-map-app-surface"
              )
            : "contents"
        }
        data-exchange-side-controls={occlusion ? "" : undefined}
        style={{ bottom }}
      >
        <div data-exchange-refresh-anchor />
        <Button
          ref={controlRef}
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            "absolute z-10",
            IS_APP_TARGET
              ? "exchange-map-app-control exchange-map-app-surface exchange-map-app-pill-top right-3 bottom-[calc(var(--app-floating-bottom)+3rem)] size-12 md:right-2.5 md:bottom-[calc(var(--app-floating-bottom)+2.5rem)] md:size-10"
              : "right-2.5 bottom-20 bg-background/95 shadow-sm backdrop-blur-sm"
          )}
          data-native-glass-control="locate"
          aria-label="回到我的位置"
          aria-busy={location.busy}
          disabled={!ready || location.busy}
          onClick={() => void locateUser()}
        >
          {location.busy ? (
            <LoaderCircleIcon className="size-5 animate-spin motion-reduce:animate-none" />
          ) : (
            <LocateFixedIcon className="size-5" />
          )}
        </Button>
      </div>
      <p
        role="status"
        className={cn(
          "pointer-events-none absolute right-16 bottom-20 z-10 max-w-56",
          location.error ? "rounded bg-background/95 px-2 text-xs" : "sr-only"
        )}
        style={{ bottom }}
      >
        {location.message}
      </p>
    </div>
  )
}
