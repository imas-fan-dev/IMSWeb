import {
  ArrowLeftIcon,
  ChevronDownIcon,
  LoaderCircleIcon,
  MapPinIcon,
  PanelLeftCloseIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import type { NativeGlassFrame } from "~/lib/native-glass-panel"
import type {
  PlaceSearchModel,
  PlaceSearchDisplay,
} from "../hooks/use-place-search"
import type { WorkspaceSearchTabs } from "../hooks/use-map-workspace-search"
import { ExchangeSearchTabs } from "./exchange-search-tabs"
import type { ExchangeSearchCardTools } from "./exchange-search-card"
import { ExchangeMapToolsMenu } from "./exchange-map-tools-menu"
import {
  ExchangeSearchStatus,
  exchangeSearchStatus,
} from "./exchange-search-status"

interface Props<Place extends PlaceSearchDisplay> {
  model: PlaceSearchModel<Place>
  searchOwner: unknown
  available: boolean
  automatic: boolean
  tools: ExchangeSearchCardTools
  selectionKey: string | null
  selectedPlace: Place | null
  selectedAttribution: string
  onSelect: (place: Place) => void
  onClear: () => void
  onOcclusion: (frame: NativeGlassFrame | null) => void
  covered?: boolean
  onActivate?: () => void
  tabs?: WorkspaceSearchTabs
}

/** A retained input and one drawer; neither transition resizes the map. */
export function ExchangeWebMapWorkspace<Place extends PlaceSearchDisplay>({
  model,
  searchOwner,
  available,
  automatic,
  tools,
  selectionKey,
  selectedPlace,
  selectedAttribution,
  onSelect,
  onClear,
  onOcclusion,
  covered = false,
  onActivate,
  tabs,
}: Props<Place>) {
  const subject = tabs?.active === "offices" ? "事务所" : "地点"
  const [pane, setPane] = useState<{
    selectionKey: string | null
    open: boolean
  }>(() => ({
    selectionKey,
    open: false,
  }))
  if (pane.selectionKey !== selectionKey)
    setPane({
      ...pane,
      selectionKey,
      ...(selectionKey ? { open: false } : {}),
    })
  const open = pane.open && !covered
  const setOpen = (value: boolean) => {
    if (value) onActivate?.()
    setPane((current) => ({ ...current, open: value }))
  }
  const column = useRef<HTMLElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const drawer = useRef<HTMLDivElement>(null)
  const composing = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ model, available })
  const paneId = useId()
  useLayoutEffect(() => {
    latest.current = { model, available }
  })
  useEffect(() => () => clearTimeout(timer.current), [searchOwner])
  useLayoutEffect(() => {
    const element = column.current
    if (!element || typeof ResizeObserver === "undefined") return
    const update = () => {
      const frame = element.getBoundingClientRect()
      const map = element.parentElement!.getBoundingClientRect()
      onOcclusion({
        x: frame.x - map.x,
        y: frame.y - map.y,
        width: frame.width,
        height: frame.height,
      })
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    update()
    window.addEventListener("resize", update)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", update)
      onOcclusion(null)
    }
  }, [onOcclusion])

  function search(value: string, reveal = true) {
    clearTimeout(timer.current)
    if (reveal) {
      setOpen(true)
    }
    latest.current.model.cancelPending()
    void latest.current.model.submit(value, !latest.current.available)
  }
  function edit(value: string) {
    clearTimeout(timer.current)
    model.cancelPending()
    model.edit(value)
    setOpen(true)
    if (!value.trim()) model.resetResults()
    if (automatic && !composing.current && value.trim().length >= 2)
      timer.current = setTimeout(() => search(value, false), 350)
  }
  function toggle() {
    if (open && drawer.current?.contains(document.activeElement))
      input.current?.focus({ preventScroll: true })
    setOpen(!open)
  }
  const status = exchangeSearchStatus({
    busy: model.busy,
    error: model.error,
    searched: model.searched,
    resultCount: model.results.length,
    subject,
  })

  return (
    <section
      ref={column}
      className="exchange-web-workspace"
      aria-label="地点查找"
      data-drawer-open={open}
    >
      <div className="exchange-web-search-dock">
        <form
          className="flex min-w-0 flex-1 items-center"
          onSubmit={(event) => {
            event.preventDefault()
            if (!composing.current) search(model.query)
          }}
        >
          <Button
            type="submit"
            variant="ghost"
            size="icon-lg"
            className="shrink-0 text-primary"
            aria-label="搜索"
            disabled={!available || model.query.trim().length < 2}
          >
            {model.busy ? (
              <LoaderCircleIcon
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <SearchIcon aria-hidden="true" />
            )}
          </Button>
          <Input
            ref={input}
            aria-label={`搜索${subject}`}
            placeholder={
              subject === "事务所"
                ? "事务所名称、城市或地址"
                : "城市、地名或完整地址"
            }
            maxLength={120}
            disabled={!available}
            value={model.query}
            className="h-12 min-w-0 flex-1 rounded-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
            onChange={(event) => edit(event.currentTarget.value)}
            onCompositionStart={() => {
              composing.current = true
              clearTimeout(timer.current)
              model.cancelPending()
            }}
            onCompositionEnd={(event) => {
              composing.current = false
              edit(event.currentTarget.value)
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || composing.current) {
                if (event.key === "Enter") event.preventDefault()
              } else if (event.key === "Escape") {
                clearTimeout(timer.current)
                setOpen(false)
                event.stopPropagation()
              }
            }}
          />
        </form>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="shrink-0"
          aria-label={open ? "收起地图面板" : "展开地图面板"}
          aria-expanded={open}
          aria-controls={paneId}
          onClick={toggle}
        >
          {open ? (
            <PanelLeftCloseIcon aria-hidden="true" />
          ) : (
            <ChevronDownIcon aria-hidden="true" />
          )}
        </Button>
        <span className="h-5 border-l" aria-hidden="true" />
        <ExchangeMapToolsMenu
          {...tools}
          triggerClassName="size-11 shrink-0 rounded-lg bg-transparent shadow-none"
        />
      </div>

      <div
        ref={drawer}
        id={paneId}
        className="exchange-web-drawer"
        data-open={open}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="exchange-web-drawer-clip">
          <div className="exchange-web-drawer-surface">
            <div className="exchange-web-search-results" key="search">
              <header className="flex items-center gap-2 border-b p-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label="关闭地点搜索"
                  onClick={() => {
                    setOpen(false)
                    input.current?.focus({ preventScroll: true })
                  }}
                >
                  <ArrowLeftIcon aria-hidden="true" />
                </Button>
                <h2 className="text-sm font-semibold">{subject}搜索</h2>
              </header>
              {tabs ? <ExchangeSearchTabs tabs={tabs} /> : null}
              <div
                className="exchange-web-result-scroll"
                role={tabs ? "tabpanel" : undefined}
                id={tabs?.panelId}
                aria-labelledby={
                  tabs?.panelId ? `${tabs.panelId}-${tabs.active}` : undefined
                }
                aria-label={`${subject}搜索结果`}
              >
                {status ? (
                  <ExchangeSearchStatus
                    status={status}
                    compact={model.results.length > 0}
                  />
                ) : null}
                {!automatic && !model.searched && !model.busy ? (
                  <p className="px-5 pb-5 text-center text-xs text-muted-foreground">
                    输入后按回车，或点击搜索。
                  </p>
                ) : null}
                {model.results.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    disabled={place.disabled}
                    aria-label={`${place.label} ${[place.address, place.distanceLabel].filter(Boolean).join(" · ")}`}
                    className="flex w-full items-start gap-3 border-b px-5 py-4 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                    onClick={() => {
                      clearTimeout(timer.current)
                      model.cancelPending()
                      model.edit(place.label)
                      onSelect(place)
                      setOpen(false)
                      input.current?.focus({ preventScroll: true })
                    }}
                  >
                    <MapPinIcon
                      className="mt-1 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <strong className="block text-sm/6 font-medium wrap-break-word">
                        {place.label}
                      </strong>
                      {tabs?.active === "offices" && !place.disabled ? (
                        <span className="text-xs text-primary">
                          在地图上定位
                        </span>
                      ) : null}
                      <span className="mt-1 block text-xs/5 wrap-break-word text-muted-foreground">
                        {[place.address, place.distanceLabel]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                ))}
                {tabs?.hasMore ? (
                  <Button
                    variant="ghost"
                    className="w-full"
                    disabled={model.busy}
                    onClick={tabs.onLoadMore}
                  >
                    加载更多事务所
                  </Button>
                ) : null}
              </div>
              {model.attribution ? (
                <p className="border-t px-5 py-3 text-xs/5 text-muted-foreground">
                  {model.attribution}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {selectedPlace ? (
        <div role="status" className="exchange-web-selected-place">
          <MapPinIcon
            className="mt-1 size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 text-sm/6 wrap-break-word">
            已定位：{selectedPlace.label}
            <span className="block text-xs/5 text-muted-foreground">
              {selectedAttribution}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="shrink-0"
            aria-label="清除搜索地点"
            onClick={onClear}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </section>
  )
}
