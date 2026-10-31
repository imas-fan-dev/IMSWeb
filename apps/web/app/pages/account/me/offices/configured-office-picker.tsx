import { canonicalCameraPosition } from "~/lib/maps/map-camera-change"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Button } from "~/components/ui/button"
import { NavigationLink } from "~/components/navigation/navigation-link"
import {
  isApiError,
  type FudabaMapConfig,
  type FudabaPlaceReverseResponse,
} from "~/lib/api"
import type { MapPosition, MapViewport } from "~/lib/maps/map-engine"
import {
  MapSearchError,
  type MapPlaceSearcher,
  type MapSearchPlace,
  type MapSearchTarget,
} from "~/lib/maps/map-search"
import {
  MapPlaceSearch,
  ExchangePlaceSearch,
} from "~/pages/community/exchange/components/exchange-place-search"
import {
  loadExchangeMapRenderer,
  type ExchangeMapRenderer,
} from "~/pages/community/exchange/maps/exchange-map-renderer"
import { loadExchangeMapSearch } from "~/pages/community/exchange/maps/exchange-map-search"
import {
  createPointAddressResolver,
  type PointAddressResolver,
} from "~/pages/community/exchange/maps/resolve-point-address"
import { DEFAULT_EXCHANGE_MAP_VIEWPORT } from "~/pages/community/exchange/maps/exchange-map-model"
import { usePlaceSearch } from "~/pages/community/exchange/hooks/use-place-search"
import type { OfficeDraft } from "./office-location-model"
import {
  ownerOfficePlaceServices,
  type OfficePlaceServices,
} from "./office-place-services"

const emptyGroups: [] = []
const ignore = () => {}

function draftPosition(draft: OfficeDraft): MapPosition | null {
  if (!draft.longitude.trim() || !draft.latitude.trim()) return null
  const position: MapPosition = [
    Number(draft.longitude),
    Number(draft.latitude),
  ]
  return Math.abs(position[0]) <= 180 && Math.abs(position[1]) <= 90
    ? canonicalCameraPosition(position)
    : null
}

export function ConfiguredOfficePicker({
  draft,
  disabled,
  onChange,
  onClose,
  onResolved,
  placeServices = ownerOfficePlaceServices,
}: {
  draft: OfficeDraft
  disabled: boolean
  onChange(draft: OfficeDraft): void
  onClose(): void
  onResolved?(attribution: FudabaPlaceReverseResponse["attribution"]): void
  placeServices?: OfficePlaceServices
}) {
  const latest = useRef({ draft, disabled, onChange, onClose, onResolved })
  useLayoutEffect(() => {
    latest.current = { draft, disabled, onChange, onClose, onResolved }
  }, [draft, disabled, onChange, onClose, onResolved])
  const request = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const startingDraft = useRef<OfficeDraft | null>(null)
  const resolved = useRef<{
    point: MapPosition
    starting: OfficeDraft
    result: FudabaPlaceReverseResponse
  } | null>(null)
  const [addressPreview, setAddressPreview] =
    useState<FudabaPlaceReverseResponse | null>(null)
  const [resolving, setResolving] = useState(false)
  const [reverseError, setReverseError] = useState("")
  const [attribution, setAttribution] =
    useState<FudabaPlaceReverseResponse["attribution"]>(null)
  const [attempt, setAttempt] = useState(0)
  const [loadedState, setLoaded] = useState<{
    config: FudabaMapConfig
    searcher: MapPlaceSearcher
    Renderer: ExchangeMapRenderer
    resolveAddress: PointAddressResolver
    placeServices: OfficePlaceServices
  } | null>(null)
  const loaded =
    loadedState?.placeServices === placeServices ? loadedState : null
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<MapSearchPlace | null>(null)
  const [picking, setPicking] = useState(false)
  const [candidate, setCandidate] = useState<MapPosition | null>(() =>
    draftPosition(draft)
  )
  const [pinTarget, setPinTarget] = useState<MapSearchTarget | null>(() =>
    candidate ? { kind: "wgs84", position: [...candidate] } : null
  )
  const pinRef = useRef(pinTarget)
  const [centerAvailable, setCenterAvailable] = useState(false)
  const [canonical, setCanonical] = useState(false)
  const [device, setDevice] = useState<MapPosition>()
  const [initial] = useState<MapViewport>(() => {
    const lng = Number(draft.longitude),
      lat = Number(draft.latitude)
    return draft.longitude &&
      draft.latitude &&
      Number.isFinite(lng) &&
      Number.isFinite(lat) &&
      Math.abs(lng) <= 180 &&
      Math.abs(lat) <= 90
      ? { center: [lng, lat], zoom: 14 }
      : DEFAULT_EXCHANGE_MAP_VIEWPORT
  })
  const center = useRef(initial.center)
  const search = usePlaceSearch(loaded?.searcher ?? null)
  function invalidateResolution() {
    generation.current += 1
    request.current?.abort()
    request.current = null
    setResolving(false)
    setReverseError("")
    setAttribution(null)
    resolved.current = null
    startingDraft.current = null
    setAddressPreview(null)
  }

  function preview(place: MapSearchPlace) {
    if (latest.current.disabled) return
    invalidateResolution()
    setSelected(place)
    setPicking(false)
    setPinTarget({ ...place.target, position: [...place.target.position] })
    pinRef.current = { ...place.target, position: [...place.target.position] }
    setCandidate(
      place.target.kind === "wgs84" &&
        place.source?.calibration !== "amap-forward-estimate"
        ? canonicalCameraPosition(place.target.position)
        : null
    )
  }

  function pick(target: MapSearchTarget) {
    if (latest.current.disabled) return
    const valid =
      target.kind === "wgs84" ? canonicalCameraPosition(target.position) : null
    if (
      valid &&
      pinRef.current?.kind === "wgs84" &&
      pinRef.current.position[0] === valid[0] &&
      pinRef.current.position[1] === valid[1] &&
      (request.current || resolved.current)
    )
      return
    invalidateResolution()
    setPicking(false)
    setSelected(null)
    setCandidate(valid)
    const next: MapSearchTarget | null =
      target.kind === "wgs84"
        ? valid
          ? { kind: "wgs84", position: valid }
          : null
        : { ...target, position: [...target.position] }
    pinRef.current = next
    setPinTarget(next)
    if (valid) void resolvePosition(valid, false)
  }

  function commit(
    position: MapPosition,
    starting: OfficeDraft,
    city: string,
    address: string,
    source: FudabaPlaceReverseResponse["attribution"]
  ) {
    const current = latest.current
    if (current.disabled) return
    current.onChange({
      ...current.draft,
      city: current.draft.city === starting.city ? city : current.draft.city,
      address:
        current.draft.address === starting.address
          ? address
          : current.draft.address,
      longitude: String(position[0]),
      latitude: String(position[1]),
    })
    current.onResolved?.(source)
    current.onClose()
  }

  async function confirm() {
    const valid = candidate && canonicalCameraPosition(candidate)
    if (!valid || picking || request.current || latest.current.disabled) return
    const cached = resolved.current
    if (
      cached &&
      cached.point[0] === valid[0] &&
      cached.point[1] === valid[1] &&
      cached.result.place
    ) {
      commit(
        valid,
        cached.starting,
        cached.result.place.city,
        cached.result.place.address,
        cached.result.attribution
      )
      return
    }
    await resolvePosition(valid, true)
  }

  async function resolvePosition(valid: MapPosition, apply: boolean) {
    if (!loaded || latest.current.disabled || request.current) return
    const starting = startingDraft.current ?? latest.current.draft
    startingDraft.current = starting
    const controller = new AbortController()
    const version = ++generation.current
    request.current = controller
    setResolving(true)
    setReverseError("")
    setAttribution(null)
    try {
      const response = await loaded.resolveAddress(
        [...valid],
        controller.signal
      )
      if (controller.signal.aborted || version !== generation.current) return
      setAttribution(response.attribution)
      setAddressPreview(response)
      if (!response.place) {
        setReverseError("未找到此位置的地址，请重试或使用此位置后手动填写。")
        return
      }
      resolved.current = { point: [...valid], starting, result: response }
      // Preview never changes the form. Bind only after its explicit confirmation.
      if (apply)
        commit(
          valid,
          starting,
          response.place.city,
          response.place.address,
          response.attribution
        )
    } catch (error) {
      if (controller.signal.aborted || version !== generation.current) return
      setReverseError(
        isApiError(error) && error.status === 429
          ? "地址解析请求过于频繁，请稍后重试，或手动填写地址。"
          : (isApiError(error) && error.status === 503) ||
              (error instanceof MapSearchError && error.kind === "unavailable")
            ? "地址解析服务暂不可用，请重试，或手动填写地址。"
            : "地址解析失败，请检查网络后重试，或手动填写地址。"
      )
    } finally {
      if (version === generation.current) {
        request.current = null
        setResolving(false)
      }
    }
  }

  useEffect(
    () => () => {
      generation.current += 1
      request.current?.abort()
    },
    []
  )

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      // Retire a StrictMode probe before starting an abortable/coalesced request.
      await Promise.resolve()
      controller.signal.throwIfAborted()
      const config = await placeServices.loadConfig(controller.signal)
      const [searcher, Renderer] = await Promise.all([
        loadExchangeMapSearch(config.search, placeServices.searchCanonical),
        loadExchangeMapRenderer(config),
      ])
      if (!controller.signal.aborted) {
        setResolving(false)
        setReverseError("")
        setAddressPreview(null)
        setAttribution(null)
        setLoaded({
          config,
          searcher,
          Renderer,
          resolveAddress: createPointAddressResolver(
            config,
            placeServices.reverse
          ),
          placeServices,
        })
      }
    })().catch(() => {
      if (!controller.signal.aborted) setError("地点地图暂时无法加载，请重试。")
    })
    return () => {
      controller.abort()
      generation.current += 1
      request.current?.abort()
      request.current = null
      resolved.current = null
      startingDraft.current = null
    }
  }, [attempt, placeServices])
  const Renderer = loaded?.Renderer
  return (
    <div className="space-y-4">
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              invalidateResolution()
              setCandidate(null)
              setError("")
              setLoaded(null)
              setSelected(null)
              setPicking(false)
              setPinTarget(null)
              pinRef.current = null
              setCenterAvailable(false)
              setAttempt(attempt + 1)
            }}
          >
            重试
          </Button>
        </div>
      ) : !loaded ? (
        <p role="status">正在加载地点地图</p>
      ) : null}
      {loaded && !canonical ? (
        <MapPlaceSearch
          disabled={disabled}
          model={{
            ...search,
            submit: (query, blocked) =>
              search.submit(query, blocked, {
                viewportCenter: center.current,
                devicePosition: device,
              }),
          }}
          onSelect={preview}
        />
      ) : null}
      {Renderer && !error ? (
        <>
          <p className="text-sm text-muted-foreground">
            点击地图放置浮标，拖动浮标微调位置。确认后自动填写城市和详细地址，仍可手动修正。
          </p>
          <div className="relative h-[clamp(15rem,40vh,24rem)] overflow-hidden rounded-md border">
            <Renderer
              groups={emptyGroups}
              selectedGroupKey={null}
              selectedPlace={selected}
              pointPicker={{
                target: pinTarget,
                disabled,
                onPickStart: () => {
                  if (latest.current.disabled) return
                  invalidateResolution()
                  setSelected(null)
                  setPicking(true)
                  setCandidate(null)
                },
                onPick: pick,
              }}
              initialViewport={initial}
              persistViewport={false}
              onSelectGroup={ignore}
              onViewportChange={ignore}
              onFatalError={() => {
                invalidateResolution()
                setCandidate(null)
                setPicking(false)
                setCenterAvailable(false)
                setError("地图暂时无法加载，请重试。")
              }}
              onDevicePosition={(position) => {
                const valid = canonicalCameraPosition(position)
                setDevice(valid ?? undefined)
              }}
              onCameraChange={(position) => {
                if (loaded?.config.provider === "amap") return
                const valid = canonicalCameraPosition(position)
                if (valid) center.current = valid
                setCenterAvailable(Boolean(valid))
              }}
            />
          </div>
          {pinTarget ? (
            <section
              aria-label="浮标地址预览"
              aria-live="polite"
              className="rounded-lg border bg-muted/20 p-3 text-sm"
            >
              <p className="font-medium">
                {pinTarget.kind === "native"
                  ? "浮标位置预览"
                  : addressPreview?.place
                    ? "浮标对应地址（待绑定）"
                    : selected
                      ? "搜索候选（尚未绑定）"
                      : "当前浮标位置（待绑定）"}
              </p>
              <p className="mt-1 text-muted-foreground">
                {resolving
                  ? "正在解析此浮标的城市和街道地址…"
                  : addressPreview?.place
                    ? [addressPreview.place.city, addressPreview.place.address]
                        .filter(Boolean)
                        .join(" · ")
                    : selected?.address ||
                      (pinTarget.kind === "native"
                        ? "请通过规范地址搜索选择可保存的位置。"
                        : "确认此位置后填写城市和详细地址。")}
              </p>
            </section>
          ) : null}
          {selected?.source?.calibration === "amap-forward-estimate" ? (
            <p role="status" className="text-sm text-muted-foreground">
              此搜索结果仅供预览，请在底图点击选点或拖动浮标后确认位置。
            </p>
          ) : null}
          {loaded?.config.provider === "amap" ? (
            <>
              <p className="text-sm">
                当前地图支持位置预览。请选择规范地址搜索填写精确位置。
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  invalidateResolution()
                  setCandidate(null)
                  setCanonical(true)
                }}
              >
                规范地址搜索
              </Button>
            </>
          ) : null}
          {pinTarget?.kind === "native" ? (
            <p role="status" className="text-sm text-muted-foreground">
              此地图位置仅供预览，请通过规范地址搜索确认可保存的位置。
            </p>
          ) : null}
        </>
      ) : null}
      {canonical ? (
        <ExchangePlaceSearch
          searcher={placeServices.searchCanonical}
          disabled={disabled}
          onSelect={(place) => {
            preview({
              id: place.id,
              label: place.label,
              address: place.address,
              target: {
                kind: "wgs84",
                position: [place.location.longitude, place.location.latitude],
              },
            })
          }}
        />
      ) : null}
      {loaded && !error ? (
        <div className="flex flex-wrap gap-3">
          {loaded.config.provider !== "amap" ? (
            <Button
              type="button"
              variant="outline"
              disabled={disabled || !centerAvailable || picking}
              onClick={() =>
                pick({ kind: "wgs84", position: [...center.current] })
              }
            >
              使用地图中心
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={disabled || !candidate || resolving || picking}
            onClick={() => void confirm()}
          >
            {resolving ? "正在解析地址" : "确认位置并填写地址"}
          </Button>
          {reverseError && candidate ? (
            <Button
              type="button"
              variant="outline"
              disabled={disabled || resolving}
              onClick={() =>
                commit(
                  candidate,
                  startingDraft.current ?? latest.current.draft,
                  "",
                  "",
                  attribution
                )
              }
            >
              使用此位置，手动填写地址
            </Button>
          ) : null}
        </div>
      ) : null}
      {picking ? <p role="status">正在调整浮标，松开后可确认位置。</p> : null}
      {resolving ? <p role="status">正在解析城市和详细地址，请稍候。</p> : null}
      {reverseError ? <p role="alert">{reverseError}</p> : null}
      {attribution ? (
        <NavigationLink
          className="block text-xs text-muted-foreground underline"
          href={attribution.url}
          target="_blank"
          rel="noreferrer"
        >
          {attribution.text}
        </NavigationLink>
      ) : null}
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          invalidateResolution()
          onClose()
        }}
      >
        取消选点
      </Button>
    </div>
  )
}
