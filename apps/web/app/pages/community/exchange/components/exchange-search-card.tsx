import { MoreHorizontalIcon, SearchIcon, XIcon } from "lucide-react"
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useNavigation } from "~/lib/navigation/use-navigation"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { IS_APP_TARGET } from "~/lib/app-target"
import { suppressNativeTabBar } from "~/lib/native-tab-bar-suppression"
import type { FudabaPlaceSearchResult } from "~/lib/api"
import type { NativeGlassFrame } from "~/lib/native-glass-panel"
import type { ExchangePlaceSearchModel } from "../hooks/use-exchange-place-search"
import { useNativeExchangeSearch } from "../hooks/use-native-exchange-search"

export interface ExchangeSearchCardTools {
  filterApplied?: boolean
  onOpenFilter: () => void
  onOpenOffices: () => void
  onOpenCards: () => void
  onRefresh: () => void
  onOpenAttribution?: (trigger?: HTMLElement | null) => void
  modalOpen?: boolean
}

export interface ExchangeSearchCardProps extends ExchangeSearchCardTools {
  model: ExchangePlaceSearchModel
  selectedPlace: FudabaPlaceSearchResult | null
  onSelect: (place: FudabaPlaceSearchResult) => void
  onClear: () => void
  pointCount: number
  feedback?: React.ReactNode
  feedbackMessage?: string
  onRetry?: () => void
  onOcclusion: (frame: NativeGlassFrame | null) => void
}

export function ExchangeSearchCard({
  model,
  selectedPlace,
  onSelect,
  onClear,
  pointCount,
  feedback,
  feedbackMessage,
  onRetry,
  onOcclusion,
  ...tools
}: ExchangeSearchCardProps) {
  const id = useId()
  const navigate = useNavigation()
  const cardRef = useRef<HTMLElement>(null)
  const geometryRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const [detent, setDetent] = useState<"collapsed" | "medium" | "large">(
    "collapsed"
  )
  const [editing, setEditing] = useState(false)
  const [more, setMore] = useState(false)
  const [available, setAvailable] = useState(600)
  const [bottom, setBottom] = useState(12)
  const [hostFrame, setHostFrame] = useState<NativeGlassFrame>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  })
  const [dark, setDark] = useState(false)
  const drag = useRef<{ y: number; height: number } | null>(null)
  const suppressHandleClick = useRef(false)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const [collapsedHeight, setCollapsedHeight] = useState(158)
  const mediumHeight = Math.min(available, Math.max(260, available * 0.5))
  const largeHeight = Math.min(
    available,
    Math.max(mediumHeight, available * 0.85)
  )
  const expanded = detent !== "collapsed"
  const currentFeedback =
    onRetry || (!model.busy && !model.searched && !model.error)
      ? feedbackMessage
      : undefined
  const snapshot = useMemo(
    () =>
      tools.modalOpen || !hostFrame.width
        ? null
        : {
            id: "exchange-search",
            revision: model.revision,
            host: hostFrame,
            bottomClearance: bottom,
            dark,
            detent,
            editing,
            query: model.query,
            busy: model.busy,
            message: [
              model.busy
                ? "正在搜索地点"
                : (model.error ??
                  (model.searched && !model.results.length
                    ? "没有找到地点，请尝试城市加场馆名或完整地址。"
                    : "")),
              currentFeedback,
            ]
              .filter(Boolean)
              .join("\n"),
            attribution:
              model.attribution ||
              (selectedPlace ? "© OpenStreetMap contributors" : ""),
            selected: selectedPlace ? `已定位：${selectedPlace.label}` : "",
            filterApplied: Boolean(tools.filterApplied),
            pointCount,
            hasAttribution: Boolean(tools.onOpenAttribution),
            results: model.results,
            labels: {
              search: "查找地点",
              input: "搜索地点",
              placeholder: "场馆、商圈或完整地址",
              more: "更多",
              submit: "查找",
              cancel: "取消",
              expand: "展开结果",
              shrink: "缩小结果",
              collapse: "收起地点查找",
              filter: "筛选",
              offices: "事务所",
              cards: "名片",
              account: "我的交换账号",
              refresh: "刷新名录",
              retry: onRetry ? "重试地图" : "",
              source: "地图来源",
              clear: "清除搜索地点",
              range: "当前范围区域点",
            },
          },
    [
      tools.modalOpen,
      tools.filterApplied,
      tools.onOpenAttribution,
      hostFrame,
      bottom,
      dark,
      detent,
      editing,
      model.revision,
      model.query,
      model.busy,
      model.error,
      model.searched,
      model.results,
      model.attribution,
      selectedPlace,
      pointCount,
      currentFeedback,
      onRetry,
    ]
  )
  const native = useNativeExchangeSearch(snapshot, (event) => {
    if (event.action === "input") {
      model.edit(event.value ?? "")
      setEditing(true)
    } else if (event.action === "submit") {
      setEditing(false)
      void model.submit(event.value)
    } else if (event.action === "select") {
      const place = model.results.find((item) => item.id === event.value)
      if (place) {
        onSelect(place)
        collapse()
      }
    } else if (event.action === "cancel") collapse()
    else if (event.action === "clear") onClear()
    else if (
      event.action === "detent" &&
      ["collapsed", "medium", "large"].includes(event.value ?? "")
    ) {
      setDetent(event.value as typeof detent)
      if (event.value === "collapsed") setEditing(false)
    } else if (event.action === "geometry" && event.frame) {
      onOcclusion({
        ...event.frame,
        x: event.frame.x - hostFrame.x,
        y: event.frame.y - hostFrame.y,
      })
    } else if (event.action === "tool") {
      collapse()
      if (event.value === "filter") tools.onOpenFilter()
      else if (event.value === "offices") tools.onOpenOffices()
      else if (event.value === "cards") tools.onOpenCards()
      else if (event.value === "refresh") tools.onRefresh()
      else if (event.value === "retry") onRetry?.()
      else if (event.value === "source")
        tools.onOpenAttribution?.(moreRef.current)
      else if (event.value === "account")
        void navigate("/community/exchange/me")
    }
  })
  const wasNative = useRef(false)
  useEffect(() => {
    if (wasNative.current && !native && !tools.modalOpen) collapse()
    wasNative.current = native
  }, [native, tools.modalOpen])

  useEffect(() => {
    if (!IS_APP_TARGET || !expanded || tools.modalOpen) return
    return suppressNativeTabBar()
  }, [expanded, tools.modalOpen])

  useEffect(() => {
    if (tools.modalOpen) {
      inputRef.current?.blur()
    }
  }, [tools.modalOpen])

  // A modal changes the active presentation, so discard its former detent.
  const [previousModal, setPreviousModal] = useState(tools.modalOpen)
  if (previousModal !== tools.modalOpen) {
    setPreviousModal(tools.modalOpen)
    if (tools.modalOpen) {
      setEditing(false)
      setDetent("collapsed")
      setMore(false)
    }
  }

  useLayoutEffect(() => {
    const measure = () => {
      const card = cardRef.current
      const host = card?.parentElement
      if (!card || !host) return
      const viewport = window.visualViewport
      const hostBox = host.getBoundingClientRect()
      if (!hostBox.width || !hostBox.height) {
        onOcclusion(null)
        return
      }
      setHostFrame((current) =>
        current.x === hostBox.x &&
        current.y === hostBox.y &&
        current.width === hostBox.width &&
        current.height === hostBox.height
          ? current
          : {
              x: hostBox.x,
              y: hostBox.y,
              width: hostBox.width,
              height: hostBox.height,
            }
      )
      setDark(document.documentElement.classList.contains("dark"))
      const top = Math.max(hostBox.top, viewport?.offsetTop ?? 0)
      const end = Math.min(
        hostBox.bottom,
        (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)
      )
      const shell = card.closest("[data-app-shell]")
      const geometry = geometryRef.current
        ? getComputedStyle(geometryRef.current)
        : null
      const clearance =
        IS_APP_TARGET && !expanded && shell
          ? parseFloat(geometry?.height ?? "0") || 0
          : 0
      const safe = clearance ? 12 : parseFloat(geometry?.width ?? "12") || 12
      setBottom(Math.max(12, hostBox.bottom - end + safe + clearance))
      setAvailable(Math.max(120, end - top - safe - clearance - 12))
      const box = card.getBoundingClientRect()
      if (
        !expanded &&
        !card.querySelector('[aria-label="更多地图工具内容"]') &&
        box.width &&
        box.height
      )
        setCollapsedHeight(box.height)
      if (!native)
        onOcclusion(
          tools.modalOpen || !box.width
            ? null
            : {
                x: box.x - hostBox.x,
                y: box.y - hostBox.y,
                width: box.width,
                height: box.height,
              }
        )
    }
    measure()
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    if (cardRef.current) observer?.observe(cardRef.current)
    if (cardRef.current?.parentElement)
      observer?.observe(cardRef.current.parentElement)
    const themeObserver = new MutationObserver(measure)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    window.addEventListener("resize", measure)
    window.visualViewport?.addEventListener("resize", measure)
    window.visualViewport?.addEventListener("scroll", measure)
    return () => {
      observer?.disconnect()
      themeObserver.disconnect()
      window.removeEventListener("resize", measure)
      window.visualViewport?.removeEventListener("resize", measure)
      window.visualViewport?.removeEventListener("scroll", measure)
      onOcclusion(null)
    }
  }, [expanded, onOcclusion, tools.modalOpen, native])

  useEffect(() => {
    if (!window.matchMedia) return
    const media = window.matchMedia("(min-width: 1024px)")
    const change = () => {
      if (!IS_APP_TARGET && media.matches) {
        setEditing(false)
        setDetent("collapsed")
        setMore(false)
        inputRef.current?.blur()
        document
          .querySelector<HTMLButtonElement>("[data-exchange-desktop-search]")
          ?.focus({ preventScroll: true })
      }
    }
    media.addEventListener("change", change)
    return () => media.removeEventListener("change", change)
  }, [])

  function collapse() {
    setEditing(false)
    setDetent("collapsed")
    setMore(false)
    inputRef.current?.blur()
    requestAnimationFrame(() =>
      triggerRef.current?.focus({ preventScroll: true })
    )
  }

  function openSearch() {
    setMore(false)
    setDetent("medium")
    setEditing(true)
  }

  useEffect(() => {
    if (editing && !native) inputRef.current?.focus({ preventScroll: true })
  }, [editing, native])

  function tool(action: () => void) {
    collapse()
    action()
  }

  const height = expanded
    ? Math.min(
        available,
        dragHeight ?? (detent === "large" ? largeHeight : mediumHeight)
      )
    : undefined

  return (
    <section
      ref={cardRef}
      aria-label="地点查找"
      className="exchange-search-card"
      data-detent={detent}
      data-editing={editing || undefined}
      data-compact={available < 280 || undefined}
      hidden={tools.modalOpen || native}
      data-native-search={native || undefined}
      data-app-search={IS_APP_TARGET || undefined}
      style={{ bottom, height, maxHeight: available }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.nativeEvent.isComposing) return
        event.stopPropagation()
        if (more) {
          setMore(false)
          moreRef.current?.focus()
          return
        }
        if (editing) {
          setEditing(false)
          inputRef.current?.blur()
          cancelRef.current?.focus({ preventScroll: true })
        } else collapse()
      }}
    >
      <span
        ref={geometryRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          visibility: "hidden",
          pointerEvents: "none",
          width:
            "max(12px, var(--safe-area-bottom, env(safe-area-inset-bottom)))",
          height: "var(--app-bottom-clearance, 0px)",
        }}
      />
      <button
        type="button"
        className="exchange-search-handle"
        aria-label={expanded ? "收起地点查找" : "展开地点查找"}
        aria-expanded={expanded}
        onClick={() => {
          if (suppressHandleClick.current) {
            suppressHandleClick.current = false
            return
          }
          if (expanded) collapse()
          else setDetent("medium")
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          drag.current = {
            y: event.clientY,
            height: cardRef.current?.getBoundingClientRect().height ?? 144,
          }
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!drag.current) return
          if (Math.abs(event.clientY - drag.current.y) > 8) {
            setDetent("medium")
            setDragHeight(
              Math.min(
                available,
                Math.max(
                  144,
                  drag.current.height + drag.current.y - event.clientY
                )
              )
            )
          }
        }}
        onPointerUp={(event) => {
          if (!drag.current) return
          const moved = Math.abs(event.clientY - drag.current.y) > 8
          const finalHeight =
            drag.current.height + drag.current.y - event.clientY
          drag.current = null
          setDragHeight(null)
          if (moved) {
            suppressHandleClick.current = true
            event.preventDefault()
            const nearest = (
              [
                ["collapsed", collapsedHeight],
                ["medium", mediumHeight],
                ["large", largeHeight],
              ] as const
            ).reduce((best, candidate) =>
              Math.abs(candidate[1] - finalHeight) <
              Math.abs(best[1] - finalHeight)
                ? candidate
                : best
            )
            if (nearest[0] === "collapsed") collapse()
            else setDetent(nearest[0])
          }
        }}
        onPointerCancel={() => {
          drag.current = null
          setDragHeight(null)
        }}
      >
        <span aria-hidden="true" />
      </button>

      <div className="exchange-search-row">
        {expanded ? (
          <Input
            ref={inputRef}
            id={id}
            className="exchange-search-input"
            aria-label="搜索地点"
            placeholder="场馆、商圈或完整地址"
            value={model.query}
            maxLength={120}
            onChange={(event) => model.edit(event.currentTarget.value)}
            onFocus={() => setEditing(true)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return
              event.preventDefault()
              event.stopPropagation()
              setEditing(false)
              inputRef.current?.blur()
              void model.submit()
            }}
          />
        ) : (
          <Button
            ref={triggerRef}
            variant="secondary"
            className="exchange-search-input"
            aria-expanded={false}
            onClick={openSearch}
          >
            <SearchIcon aria-hidden="true" />
            查找地点
          </Button>
        )}
        {expanded && model.query ? (
          <Button
            variant="ghost"
            className="exchange-search-round"
            aria-label="清除搜索文字"
            onClick={() => {
              model.edit("")
              inputRef.current?.focus({ preventScroll: true })
            }}
          >
            <XIcon aria-hidden="true" />
          </Button>
        ) : null}
        <Button
          ref={moreRef}
          className="exchange-search-round"
          variant="secondary"
          aria-label="更多地图工具"
          aria-expanded={more}
          onClick={() => {
            inputRef.current?.blur()
            setEditing(false)
            setMore((value) => !value)
          }}
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </Button>
      </div>

      {expanded ? (
        <div className="exchange-search-actions">
          <Button
            className="exchange-search-pill"
            disabled={model.busy || model.query.trim().length < 2}
            onClick={() => {
              setEditing(false)
              inputRef.current?.blur()
              void model.submit()
            }}
          >
            查找
          </Button>
          <Button
            ref={cancelRef}
            className="exchange-search-pill"
            variant="secondary"
            onClick={collapse}
          >
            取消
          </Button>
          {largeHeight > mediumHeight ? (
            <Button
              className="exchange-search-pill"
              variant="ghost"
              onClick={() => setDetent(detent === "large" ? "medium" : "large")}
            >
              {detent === "large" ? "缩小结果" : "展开结果"}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="exchange-search-tools">
          <Button
            className="exchange-search-pill"
            variant="secondary"
            aria-label={
              tools.filterApplied ? "打开筛选，已应用筛选" : "打开筛选"
            }
            aria-pressed={tools.filterApplied}
            onClick={() => tool(tools.onOpenFilter)}
          >
            筛选{tools.filterApplied ? " ·" : ""}
          </Button>
          <Button
            className="exchange-search-pill"
            variant="secondary"
            aria-label="打开事务所名录"
            onClick={() => tool(tools.onOpenOffices)}
          >
            事务所
          </Button>
          <Button
            className="exchange-search-pill"
            variant="secondary"
            aria-label="打开名片名录"
            onClick={() => tool(tools.onOpenCards)}
          >
            名片
          </Button>
        </div>
      )}

      {more ? (
        <div className="exchange-search-content" aria-label="更多地图工具内容">
          <p>当前范围：{pointCount} 个区域点</p>
          <NavigationLink
            to="/community/exchange/me"
            className="exchange-search-menu-item"
          >
            我的交换账号
          </NavigationLink>
          <Button
            variant="ghost"
            className="exchange-search-menu-item"
            onClick={() => {
              setMore(false)
              tools.onRefresh()
            }}
          >
            刷新名录
          </Button>
          {tools.onOpenAttribution ? (
            <Button
              variant="ghost"
              className="exchange-search-menu-item"
              aria-label="查看地图数据来源"
              aria-haspopup="dialog"
              onClick={() => {
                setMore(false)
                tool(() => tools.onOpenAttribution?.(moreRef.current))
              }}
            >
              地图来源
            </Button>
          ) : null}
        </div>
      ) : null}

      {expanded ? (
        <div className="exchange-search-content" aria-label="地点搜索结果">
          {feedback}
          {currentFeedback ? (
            <div role="status">
              <p>{currentFeedback}</p>
              {onRetry ? (
                <Button
                  className="exchange-search-pill"
                  variant="secondary"
                  onClick={onRetry}
                >
                  重试地图
                </Button>
              ) : null}
              {onRetry ? (
                <Button
                  className="exchange-search-pill"
                  variant="ghost"
                  onClick={() => tool(tools.onOpenOffices)}
                >
                  查看名录
                </Button>
              ) : null}
            </div>
          ) : null}
          {model.busy ? <p role="status">正在搜索地点</p> : null}
          {model.error ? (
            <p role="alert">{model.error} 可以重新查找。</p>
          ) : null}
          {model.searched && !model.results.length && !model.busy ? (
            <p role="status">没有找到地点，请尝试城市加场馆名或完整地址。</p>
          ) : null}
          {model.results.map((place) => (
            <button
              key={place.id}
              type="button"
              className="exchange-search-result"
              onClick={() => {
                onSelect(place)
                collapse()
              }}
            >
              <strong>{place.label}</strong>
              <span>{place.address}</span>
            </button>
          ))}
          {model.attribution ? (
            <p className="text-xs text-muted-foreground">{model.attribution}</p>
          ) : null}
        </div>
      ) : null}

      {!expanded && selectedPlace ? (
        <div className="exchange-search-selected" role="status">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 wrap-break-word">
              已定位：{selectedPlace.label}
            </p>
            <p className="text-xs text-muted-foreground">
              {model.attribution || "© OpenStreetMap contributors"}
            </p>
          </div>
          <Button
            variant="ghost"
            className="exchange-search-round"
            aria-label="清除搜索地点"
            onClick={onClear}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">
        当前范围：{pointCount} 个区域点
      </span>
    </section>
  )
}
