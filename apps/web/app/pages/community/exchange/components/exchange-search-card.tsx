import {
  LoaderCircleIcon,
  MapPinIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"
import { useNavigation } from "~/lib/navigation/use-navigation"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { IS_APP_TARGET } from "~/lib/app-target"
import { suppressNativeTabBar } from "~/lib/native-tab-bar-suppression"
import type { MapSearchPlace } from "~/lib/maps/map-search"
import type { PlaceSearchDisplay } from "../hooks/use-place-search"
import {
  shouldUseNativeGlassControls,
  type NativeGlassFrame,
} from "~/lib/native-glass-panel"
import {
  EXCHANGE_NAVIGATION_LAYOUT_EVENT,
  exchangeNavigationLayout,
  measuredNavigationFrame,
  navigationDockBottom,
  navigationInline,
  type ExchangeNavigationLayout,
} from "./exchange-navigation-layout"
import type { NativeGlassColor } from "~/lib/native-glass"
import {
  nativeGlassSearchTint,
  type NativeSearchStatus,
} from "~/lib/native-glass-search"
import type { ExchangePlaceSearchModel } from "../hooks/use-exchange-place-search"
import { useNativeExchangeSearch } from "../hooks/use-native-exchange-search"
import { expandedSearchMinimumHeight } from "./exchange-search-height"
import type { WorkspaceSearchTabs } from "../hooks/use-map-workspace-search"
import { ExchangeSearchTabs } from "./exchange-search-tabs"
import { ExchangeMapToolsMenu } from "./exchange-map-tools-menu"
import {
  exchangeSearchStatus,
  ExchangeSearchStatus,
} from "./exchange-search-status"

export interface ExchangeSearchCardTools {
  filterAnchorRef?: RefObject<HTMLElement | null>
  filterApplied?: boolean
  onOpenFilter: () => void
  onOpenOffices: () => void
  onOpenCards: () => void
  onRefresh: () => void
  refreshing?: boolean
  onOpenAttribution?: (trigger?: HTMLElement | null) => void
  modalOpen?: boolean
}

export interface ExchangeSearchCardProps<
  Place extends PlaceSearchDisplay = MapSearchPlace,
> extends ExchangeSearchCardTools {
  model: ExchangePlaceSearchModel<Place>
  selectedPlace: Place | null
  onSelect: (place: Place) => void
  onClear: () => void
  pointCount: number
  feedback?: React.ReactNode
  feedbackMessage?: string
  feedbackKind?: NativeSearchStatus["kind"]
  onRetry?: () => void
  onOcclusion: (frame: NativeGlassFrame | null) => void
  onExpandedChange?: (expanded: boolean) => void
  tabs?: WorkspaceSearchTabs
}

export function ExchangeSearchCard<Place extends PlaceSearchDisplay>({
  model,
  selectedPlace,
  onSelect,
  onClear,
  pointCount,
  feedback,
  feedbackMessage,
  feedbackKind = "notice",
  onRetry,
  onOcclusion,
  onExpandedChange,
  tabs,
  ...tools
}: ExchangeSearchCardProps<Place>) {
  const subject = tabs?.active === "offices" ? "事务所" : "地点"
  const id = useId()
  const navigate = useNavigation()
  const cardRef = useRef<HTMLElement>(null)
  const geometryRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const [refreshHost, setRefreshHost] = useState<HTMLElement | null>(null)
  const [refreshBottom, setRefreshBottom] = useState(12)
  const nativeOcclusion = useRef<NativeGlassFrame | null>(null)
  const nativeNavigation = useRef<ExchangeNavigationLayout | null>(null)
  const navigationClock = useRef<ExchangeNavigationLayout | null>(null)
  const remeasureNavigation = useRef<() => void>(() => undefined)
  const [navigationFrame, setNavigationFrame] = useState<NativeGlassFrame>()
  const [nativeGeometryReceived, setNativeGeometryReceived] = useState(false)
  const occlusionCallback = useRef(onOcclusion)
  useLayoutEffect(() => {
    occlusionCallback.current = onOcclusion
  }, [onOcclusion])
  useLayoutEffect(() => () => occlusionCallback.current(null), [])
  const [detent, setDetent] = useState<"collapsed" | "medium" | "large">(
    "collapsed"
  )
  const [editing, setEditing] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [settlingDrag, setSettlingDrag] = useState(false)
  const exitFrame = useRef<number | null>(null)
  const restoreTriggerFocus = useRef(false)
  const [more, setMore] = useState(false)
  const [returnFocusMore, setReturnFocusMore] = useState(false)
  const [available, setAvailable] = useState(600)
  const [bottom, setBottom] = useState(12)
  const collapsedBottom = useRef(12)
  const [hostFrame, setHostFrame] = useState<NativeGlassFrame>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  })
  const [dark, setDark] = useState(false)
  const [tint, setTint] = useState<NativeGlassColor>()
  const drag = useRef<{ y: number; height: number } | null>(null)
  const suppressHandleClick = useRef(false)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const [collapsedHeight, setCollapsedHeight] = useState(44)
  const [expandedMinimumHeight, setExpandedMinimumHeight] = useState(260)
  const mediumHeight = Math.min(
    available,
    Math.max(expandedMinimumHeight, available * 0.5)
  )
  const largeHeight = Math.min(
    available,
    Math.max(mediumHeight, available * (IS_APP_TARGET ? 1 : 0.85))
  )
  const expanded = detent !== "collapsed"
  useLayoutEffect(() => {
    const host = cardRef.current?.parentElement
    if (!host) return
    const update = () => {
      setRefreshHost(
        host.querySelector<HTMLElement>("[data-exchange-refresh-anchor]") ??
          host
      )
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(host, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    onExpandedChange?.(expanded && !tools.modalOpen)
    return () => onExpandedChange?.(false)
  }, [expanded, tools.modalOpen, onExpandedChange])
  const currentFeedback =
    onRetry || (!model.busy && !model.searched && !model.error)
      ? feedbackMessage
      : undefined
  const status = useMemo(
    () =>
      exchangeSearchStatus({
        busy: model.busy,
        error: model.error,
        searched: model.searched,
        resultCount: model.results.length,
        subject,
        feedback: currentFeedback
          ? { kind: feedbackKind, message: currentFeedback }
          : undefined,
      }),
    [
      model.busy,
      model.error,
      model.searched,
      model.results.length,
      currentFeedback,
      feedbackKind,
      subject,
    ]
  )
  const snapshot = useMemo(
    () =>
      tools.modalOpen || !hostFrame.width
        ? null
        : {
            id: "exchange-search",
            revision: model.revision,
            activeTab: tabs?.active,
            hasMore: tabs?.hasMore,
            host: hostFrame,
            navigationFrame,
            bottomClearance: bottom,
            dark,
            tint,
            refreshing: Boolean(tools.refreshing),
            returnFocusMore,
            detent,
            editing,
            query: model.query,
            busy: model.busy,
            status,
            attribution: expanded
              ? model.attribution
              : (selectedPlace?.attribution ?? model.attribution),
            selected: selectedPlace ? `已定位：${selectedPlace.label}` : "",
            selectedLabel: selectedPlace?.label ?? "",
            selectedAddress: selectedPlace?.address ?? "",
            filterApplied: Boolean(tools.filterApplied),
            pointCount,
            hasAttribution: Boolean(tools.onOpenAttribution),
            results: model.results.map(
              ({ id, label, address, distanceLabel, disabled }) => ({
                id,
                disabled,
                label,
                address: [address, distanceLabel].filter(Boolean).join(" · "),
              })
            ),
            labels: {
              search: `查找${subject}`,
              input: `搜索${subject}`,
              placeholder:
                subject === "事务所"
                  ? "事务所名称、城市或地址"
                  : "城市、地名或完整地址",
              resultsHeading: subject,
              officeTab: "事务所",
              placeTab: "地点",
              loadMore: "加载更多事务所",
              resultsSubtitle: "搜索结果",
              more: "更多",
              submit: "查找",
              cancel: "取消",
              expand: "展开结果",
              shrink: "缩小结果",
              collapse: "收起地点查找",
              filter: "筛选",
              filterApplied: "已应用筛选",
              offices: "事务所",
              cards: "名片",
              account: "我的交换账号",
              refresh: "刷新名录",
              refreshing: "正在刷新名录",
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
      navigationFrame,
      bottom,
      dark,
      tint,
      tools.refreshing,
      returnFocusMore,
      expanded,
      detent,
      editing,
      model.revision,
      model.query,
      model.busy,
      model.results,
      model.attribution,
      selectedPlace,
      pointCount,
      status,
      onRetry,
      tabs?.active,
      tabs?.hasMore,
      subject,
    ]
  )
  const native = useNativeExchangeSearch(
    snapshot,
    (event) => {
      if (
        event.action === "tab" &&
        (event.value === "offices" || event.value === "places")
      ) {
        tabs?.onChange(event.value)
      } else if (event.action === "loadMore") {
        tabs?.onLoadMore()
      } else if (event.action === "input") {
        model.cancelPending()
        model.edit(event.value ?? "")
        setEditing(true)
      } else if (event.action === "submit") {
        setEditing(false)
        void model.submit(event.value)
      } else if (event.action === "select") {
        const place = model.results.find((item) => item.id === event.value)
        if (place) {
          onSelect(place)
          setEditing(false)
        }
        // UIKit owns settling; its final collapsed detent releases suppression.
      } else if (event.action === "cancel") setEditing(false)
      else if (event.action === "clear") onClear()
      else if (
        event.action === "detent" &&
        ["collapsed", "medium", "large"].includes(event.value ?? "")
      ) {
        setDetent(
          IS_APP_TARGET && event.value !== "collapsed"
            ? "large"
            : (event.value as typeof detent)
        )
        if (event.value === "collapsed") setEditing(false)
      } else if (event.action === "geometry" && event.frame) {
        nativeOcclusion.current = event.frame
        setNativeGeometryReceived(true)
        onOcclusion({
          ...event.frame,
          x: event.frame.x - hostFrame.x,
          y: event.frame.y - hostFrame.y,
        })
      } else if (event.action === "tool") {
        collapse()
        if (
          ["filter", "offices", "cards", "source"].includes(event.value ?? "")
        )
          setReturnFocusMore(true)
        if (event.value === "filter") tools.onOpenFilter()
        else if (event.value === "offices") tools.onOpenOffices()
        else if (event.value === "cards") tools.onOpenCards()
        else if (event.value === "refresh") tools.onRefresh()
        else if (event.value === "retry") onRetry?.()
        else if (event.value === "source") {
          tools.onOpenAttribution?.(moreRef.current)
        } else if (event.value === "account")
          void navigate("/community/exchange/me")
      }
    },
    () => {
      if (snapshot?.returnFocusMore) setReturnFocusMore(false)
    },
    () => {
      // The bridge invokes this only after native removal is acknowledged.
      nativeOcclusion.current = null
      // Search fallback does not remove the separate native navigation owner.
      remeasureNavigation.current()
      setNativeGeometryReceived(false)
    }
  )
  const wasNative = useRef(false)
  useEffect(() => {
    if (wasNative.current && !native && !tools.modalOpen) {
      setEditing(false)
      setMore(false)
      finishCollapse()
    }
    wasNative.current = native
  }, [native, tools.modalOpen])

  useEffect(() => {
    if (!IS_APP_TARGET || !expanded || tools.modalOpen) return
    return suppressNativeTabBar()
  }, [expanded, tools.modalOpen])

  useEffect(() => {
    if (tools.modalOpen) {
      if (exitFrame.current !== null) cancelAnimationFrame(exitFrame.current)
      exitFrame.current = null
      restoreTriggerFocus.current = false
      inputRef.current?.blur()
    }
  }, [tools.modalOpen])

  // A modal changes the active presentation, so discard its former detent.
  const [previousModal, setPreviousModal] = useState(tools.modalOpen)
  if (previousModal !== tools.modalOpen) {
    setPreviousModal(tools.modalOpen)
    if (tools.modalOpen) {
      setNativeGeometryReceived(false)
      setEditing(false)
      setExiting(false)
      setDetent("collapsed")
      setMore(false)
    }
  }

  useLayoutEffect(() => {
    if (tools.modalOpen) {
      nativeOcclusion.current = null
      onOcclusion(null)
    }
  }, [tools.modalOpen, onOcclusion])

  useLayoutEffect(() => {
    let observedNavigation: Element | null = null
    const measure = () => {
      const card = cardRef.current
      const host = card?.parentElement
      if (!card || !host) return
      const viewport = window.visualViewport
      const hostBox = host.getBoundingClientRect()
      if (!hostBox.width || !hostBox.height) {
        nativeOcclusion.current = null
        setNativeGeometryReceived(false)
        setHostFrame((current) =>
          current.width || current.height
            ? { ...current, width: 0, height: 0 }
            : current
        )
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
      // Map chrome owns appearance; its App surface intentionally stays light.
      const surfaceDark = getComputedStyle(card).colorScheme === "dark"
      setDark(surfaceDark)
      const color =
        geometryRef.current && getComputedStyle(geometryRef.current).color
      if (color && IS_APP_TARGET) {
        const context = document.createElement("canvas").getContext("2d")
        if (context) {
          context.fillStyle = color
          context.fillRect(0, 0, 1, 1)
          const next = nativeGlassSearchTint(
            context.getImageData(0, 0, 1, 1).data,
            surfaceDark
          )
          setTint((current) =>
            current?.red === next.red &&
            current.green === next.green &&
            current.blue === next.blue &&
            current.alpha === next.alpha
              ? current
              : next
          )
        }
      }
      const safeTop = IS_APP_TARGET
        ? parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
              "--safe-area-top"
            )
          ) || 0
        : 0
      const top = Math.max(hostBox.top + safeTop, viewport?.offsetTop ?? 0)
      const end = Math.min(
        hostBox.bottom,
        (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)
      )
      const shell = card.closest("[data-app-shell]")
      let domNavigation: NativeGlassFrame | undefined
      if (IS_APP_TARGET && shell) {
        const viewportBox = {
          width: window.innerWidth,
          height: window.innerHeight,
        }
        const capsule = shell.querySelector("nav > [data-glass-fallback]")
        if (capsule !== observedNavigation) {
          if (observedNavigation) observer?.unobserve(observedNavigation)
          observedNavigation = capsule
          if (capsule) observer?.observe(capsule)
        }
        const measured = measuredNavigationFrame(capsule)
        domNavigation = measured
        const nativeLayout = nativeNavigation.current
        const bodyHeight =
          measured?.height ??
          (nativeLayout?.available &&
          Math.abs(nativeLayout.viewport.width - viewportBox.width) <= 2 &&
          Math.abs(nativeLayout.viewport.height - viewportBox.height) <= 2
            ? nativeLayout.bodyHeight
            : undefined) ??
          44
        card.style.setProperty(
          "--exchange-navigation-body-height",
          `${bodyHeight}px`
        )
        setNavigationFrame((current) =>
          current?.x === measured?.x &&
          current?.y === measured?.y &&
          current?.width === measured?.width &&
          current?.height === measured?.height
            ? current
            : measured
        )
        let inline = navigationInline(
          hostBox,
          viewportBox,
          measured,
          nativeNavigation.current
        )
        // Until a current native layout event arrives, use the calibrated phone
        // baseline only for an admitted iOS runtime with no DOM nav. A visible
        // DOM capsule always supplies its own actual bounds.
        if (!inline && !capsule && shouldUseNativeGlassControls()) {
          const rootStyle = getComputedStyle(document.documentElement)
          const left = Math.max(
            20,
            parseFloat(rootStyle.getPropertyValue("--safe-area-left")) || 0
          )
          const right = Math.max(
            20,
            parseFloat(rootStyle.getPropertyValue("--safe-area-right")) || 0
          )
          const start = Math.max(hostBox.x, left)
          const end = Math.min(
            hostBox.x + hostBox.width,
            viewportBox.width - right
          )
          inline =
            end - start >= 44
              ? { x: start - hostBox.x, width: end - start }
              : undefined
        }
        if (inline) {
          card.style.setProperty("--exchange-navigation-x", `${inline.x}px`)
          card.style.setProperty(
            "--exchange-navigation-width",
            `${inline.width}px`
          )
        } else {
          card.style.removeProperty("--exchange-navigation-x")
          card.style.removeProperty("--exchange-navigation-width")
        }
      }
      const geometry = geometryRef.current
        ? getComputedStyle(geometryRef.current)
        : null
      const clearance =
        IS_APP_TARGET && !expanded && shell
          ? parseFloat(geometry?.height ?? "0") || 0
          : 0
      const safe = clearance ? 12 : parseFloat(geometry?.width ?? "12") || 12
      const fallbackBottom = Math.max(
        12,
        hostBox.bottom - end + safe + clearance
      )
      const nextBottom =
        IS_APP_TARGET && !expanded && shell
          ? navigationDockBottom(hostBox, end, domNavigation, fallbackBottom)
          : fallbackBottom
      if (!expanded) collapsedBottom.current = nextBottom
      setBottom(nextBottom)
      setAvailable(Math.max(120, hostBox.bottom - nextBottom - top - 12))
      const box = card.getBoundingClientRect()
      const surface = card.querySelector<HTMLElement>(
        ".exchange-search-surface"
      )
      const actions = card.querySelector<HTMLElement>(
        ".exchange-search-actions"
      )
      if (expanded && box.width && surface && actions) {
        const reading = card.querySelector<HTMLElement>(
          ".exchange-search-content"
        )
        const cardStyle = getComputedStyle(card)
        const readingStyle = reading ? getComputedStyle(reading) : null
        const pixels = (value: string | undefined) =>
          parseFloat(value ?? "0") || 0
        setExpandedMinimumHeight(
          expandedSearchMinimumHeight({
            surface: surface.getBoundingClientRect().height,
            actions: actions.getBoundingClientRect().height,
            gap: pixels(getComputedStyle(actions).marginTop),
            insets:
              pixels(cardStyle.paddingTop) +
              pixels(cardStyle.paddingBottom) +
              pixels(readingStyle?.marginTop) +
              pixels(readingStyle?.paddingTop) +
              pixels(readingStyle?.paddingBottom),
          })
        )
      }
      setRefreshBottom(
        hostBox.width >= 640 && end - top <= 500
          ? Math.max(12, hostBox.bottom - end + 12)
          : Math.max(12, hostBox.bottom - box.top + 12)
      )
      if (!expanded && box.width && box.height)
        setCollapsedHeight(
          IS_APP_TARGET
            ? (surface?.getBoundingClientRect().height ?? 44)
            : box.height
        )
      if (nativeOcclusion.current && !tools.modalOpen) {
        // Native owns the frame even before support acknowledgment. Reproject
        // its viewport coordinates when the map host moves without a new frame.
        onOcclusion({
          ...nativeOcclusion.current,
          x: nativeOcclusion.current.x - hostBox.x,
          y: nativeOcclusion.current.y - hostBox.y,
        })
      } else if (!native)
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
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    remeasureNavigation.current = measure
    measure()
    if (cardRef.current) observer?.observe(cardRef.current)
    for (const content of cardRef.current?.querySelectorAll(
      ".exchange-search-surface, .exchange-search-actions"
    ) ?? [])
      observer?.observe(content)
    if (cardRef.current?.parentElement)
      observer?.observe(cardRef.current.parentElement)
    const themeObserver = new MutationObserver(measure)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-glass-accent"],
    })
    const shellObserver = new MutationObserver(measure)
    const shell = cardRef.current?.closest("[data-app-shell]")
    if (IS_APP_TARGET && shell)
      shellObserver.observe(shell, { childList: true, subtree: true })
    const receiveNavigation = (event: Event) => {
      if (!shouldUseNativeGlassControls()) return
      const layout = exchangeNavigationLayout(
        event,
        { width: window.innerWidth, height: window.innerHeight },
        navigationClock.current
      )
      if (!layout) return
      navigationClock.current = layout
      nativeNavigation.current = layout
      measure()
    }
    if (IS_APP_TARGET)
      window.addEventListener(
        EXCHANGE_NAVIGATION_LAYOUT_EVENT,
        receiveNavigation
      )
    window.addEventListener("resize", measure)
    window.visualViewport?.addEventListener("resize", measure)
    window.visualViewport?.addEventListener("scroll", measure)
    return () => {
      observer?.disconnect()
      remeasureNavigation.current = () => undefined
      themeObserver.disconnect()
      shellObserver.disconnect()
      window.removeEventListener(
        EXCHANGE_NAVIGATION_LAYOUT_EVENT,
        receiveNavigation
      )
      window.removeEventListener("resize", measure)
      window.visualViewport?.removeEventListener("resize", measure)
      window.visualViewport?.removeEventListener("scroll", measure)
    }
  }, [
    expanded,
    bottom,
    onOcclusion,
    tools.modalOpen,
    native,
    nativeGeometryReceived,
  ])

  useLayoutEffect(
    () => () => {
      nativeNavigation.current = null
      navigationClock.current = null
    },
    []
  )

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
    if (exiting) return
    setEditing(false)
    setMore(false)
    inputRef.current?.blur()
    if (
      IS_APP_TARGET &&
      expanded &&
      !native &&
      !tools.modalOpen &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      // Freeze the live drag before changing the target on the next frame.
      setExiting(true)
      exitFrame.current = requestAnimationFrame(() => {
        exitFrame.current = null
        setDragHeight(null)
        setSettlingDrag(true)
      })
      return
    }
    finishCollapse()
  }

  function finishCollapse() {
    restoreTriggerFocus.current = true
    setExiting(false)
    setSettlingDrag(false)
    setDragHeight(null)
    setDetent("collapsed")
  }

  useLayoutEffect(() => {
    if (expanded || !restoreTriggerFocus.current || tools.modalOpen || native)
      return
    restoreTriggerFocus.current = false
    triggerRef.current?.focus({ preventScroll: true })
  }, [expanded, tools.modalOpen, native])

  function openSearch() {
    if (exitFrame.current !== null) cancelAnimationFrame(exitFrame.current)
    exitFrame.current = null
    setExiting(false)
    setSettlingDrag(false)
    setDragHeight(null)
    setMore(false)
    setDetent(IS_APP_TARGET ? "large" : "medium")
    setEditing(true)
  }

  useEffect(() => {
    if (!exiting) return
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)")
    const finish = () => finishCollapse()
    const timer = window.setTimeout(finish, media?.matches ? 0 : 320)
    media?.addEventListener("change", finish)
    return () => {
      window.clearTimeout(timer)
      media?.removeEventListener("change", finish)
    }
  }, [exiting])
  useEffect(
    () => () => {
      if (exitFrame.current !== null) cancelAnimationFrame(exitFrame.current)
    },
    []
  )

  useEffect(() => {
    if (editing && !native) inputRef.current?.focus({ preventScroll: true })
  }, [editing, native])

  function tool(action: () => void) {
    collapse()
    action()
  }

  const height = expanded
    ? exiting && settlingDrag
      ? collapsedHeight
      : Math.min(
          available,
          Math.max(
            dragHeight !== null && IS_APP_TARGET ? 44 : expandedMinimumHeight,
            dragHeight ?? (detent === "large" ? largeHeight : mediumHeight)
          )
        )
    : undefined

  return (
    <>
      {refreshHost &&
      !native &&
      !tools.modalOpen &&
      !(IS_APP_TARGET && expanded)
        ? createPortal(
            <div
              className={
                IS_APP_TARGET
                  ? "exchange-map-refresh exchange-map-app-surface"
                  : "exchange-map-refresh"
              }
              data-standalone={
                !refreshHost.hasAttribute("data-exchange-refresh-anchor") ||
                undefined
              }
              data-app-search={IS_APP_TARGET || undefined}
              style={
                refreshHost.hasAttribute("data-exchange-refresh-anchor")
                  ? undefined
                  : { bottom: refreshBottom }
              }
            >
              <Button
                className="exchange-map-refresh-button"
                variant="ghost"
                aria-label="刷新名录"
                disabled={tools.refreshing}
                aria-busy={tools.refreshing || undefined}
                onClick={tools.onRefresh}
              >
                {tools.refreshing ? (
                  <LoaderCircleIcon
                    aria-hidden="true"
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : (
                  <RefreshCwIcon aria-hidden="true" />
                )}
              </Button>
            </div>,
            refreshHost
          )
        : null}
      <section
        ref={cardRef}
        aria-label="地点查找"
        className="exchange-search-card"
        data-detent={detent}
        data-editing={editing || undefined}
        data-exiting={exiting || undefined}
        data-dragging={dragHeight !== null || undefined}
        data-compact={available < 280 || undefined}
        hidden={tools.modalOpen || native}
        data-native-search={native || undefined}
        data-app-search={IS_APP_TARGET || undefined}
        style={{
          bottom: exiting && settlingDrag ? collapsedBottom.current : bottom,
          height: IS_APP_TARGET && !expanded ? collapsedHeight : height,
          maxHeight: available,
        }}
        onTransitionEnd={(event) => {
          if (
            exiting &&
            event.target === event.currentTarget &&
            event.propertyName === "height"
          )
            finishCollapse()
        }}
        onKeyDown={(event) => {
          if (
            event.defaultPrevented ||
            event.key !== "Escape" ||
            event.nativeEvent.isComposing
          )
            return
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
            color: "var(--primary)",
            width:
              "max(12px, var(--safe-area-bottom, env(safe-area-inset-bottom)))",
            height: "var(--app-bottom-clearance, 0px)",
          }}
        />
        <div className="exchange-search-surface">
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
              if (exiting) openSearch()
              else if (expanded) collapse()
              else openSearch()
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
                setDetent(IS_APP_TARGET ? "large" : "medium")
                setDragHeight(
                  Math.min(
                    available,
                    Math.max(
                      IS_APP_TARGET ? 44 : 144,
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
              const downward = event.clientY - drag.current.y > 8
              drag.current = null
              if (moved) {
                suppressHandleClick.current = true
                event.preventDefault()
                if (IS_APP_TARGET) {
                  if (downward) collapse()
                  else setDragHeight(null)
                  return
                }
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
              setDragHeight(null)
            }}
            onPointerCancel={() => {
              drag.current = null
              setDragHeight(null)
            }}
          >
            {expanded ? (
              <span aria-hidden="true" />
            ) : selectedPlace ? (
              <MapPinIcon aria-hidden="true" />
            ) : (
              <SearchIcon aria-hidden="true" />
            )}
          </button>

          <div className="exchange-search-row" inert={exiting || undefined}>
            {expanded ? (
              <Input
                ref={inputRef}
                id={id}
                className="exchange-search-input"
                aria-label={`搜索${subject}`}
                placeholder={
                  subject === "事务所"
                    ? "事务所名称、城市或地址"
                    : "场馆、商圈或完整地址"
                }
                value={model.query}
                maxLength={120}
                onChange={(event) => {
                  model.cancelPending()
                  model.edit(event.currentTarget.value)
                }}
                onFocus={() => setEditing(true)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.nativeEvent.isComposing)
                    return
                  event.preventDefault()
                  event.stopPropagation()
                  setEditing(false)
                  inputRef.current?.blur()
                  void model.submit()
                }}
              />
            ) : selectedPlace ? (
              <Button
                ref={triggerRef}
                variant="ghost"
                className="exchange-search-summary"
                aria-label={`已定位：${selectedPlace.label}，展开地点查找`}
                aria-expanded={false}
                onClick={openSearch}
              >
                <span>
                  <strong>{selectedPlace.label}</strong>
                  <span>{selectedPlace.address}</span>
                  {!IS_APP_TARGET ? (
                    <span>
                      {selectedPlace.attribution ?? model.attribution}
                    </span>
                  ) : null}
                </span>
              </Button>
            ) : (
              <Button
                ref={triggerRef}
                variant="secondary"
                className="exchange-search-input"
                aria-expanded={false}
                onClick={openSearch}
              >
                查找{subject}
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
            {!expanded && selectedPlace ? (
              <Button
                variant="ghost"
                className="exchange-search-round"
                aria-label="清除搜索地点"
                onClick={() => {
                  onClear()
                  requestAnimationFrame(() =>
                    triggerRef.current?.focus({ preventScroll: true })
                  )
                }}
              >
                <XIcon aria-hidden="true" />
              </Button>
            ) : null}
            <ExchangeMapToolsMenu
              triggerRef={moreRef}
              triggerClassName="exchange-search-round"
              open={more && !native && !tools.modalOpen}
              onOpenChange={(value) => {
                if (value) {
                  inputRef.current?.blur()
                  setEditing(false)
                }
                setMore(value)
              }}
              filterApplied={tools.filterApplied}
              modalOpen={tools.modalOpen}
              pointCount={pointCount}
              onOpenFilter={() => tool(tools.onOpenFilter)}
              onOpenOffices={() => tool(tools.onOpenOffices)}
              onOpenCards={() => tool(tools.onOpenCards)}
              onOpenAttribution={
                tools.onOpenAttribution
                  ? (trigger) => tool(() => tools.onOpenAttribution?.(trigger))
                  : undefined
              }
            />
          </div>
        </div>

        {expanded ? (
          <div
            key="actions"
            className="exchange-search-actions"
            inert={exiting || undefined}
          >
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
            {!IS_APP_TARGET && largeHeight > mediumHeight ? (
              <Button
                className="exchange-search-pill"
                variant="ghost"
                onClick={() =>
                  setDetent(detent === "large" ? "medium" : "large")
                }
              >
                {detent === "large" ? "缩小结果" : "展开结果"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {expanded ? (
          <div
            className="exchange-search-content"
            data-placeholder={!model.results.length || undefined}
            role={tabs ? "tabpanel" : undefined}
            id={tabs?.panelId}
            aria-labelledby={
              tabs?.panelId ? `${tabs.panelId}-${tabs.active}` : undefined
            }
            aria-label={`${subject}搜索结果`}
            inert={exiting || undefined}
          >
            {tabs ? (
              <ExchangeSearchTabs tabs={tabs} />
            ) : model.results.length ? (
              <h2 className="text-lg font-semibold">{subject}</h2>
            ) : null}
            {feedback}
            {status ? (
              <ExchangeSearchStatus
                status={status}
                compact={Boolean(model.results.length)}
              >
                {currentFeedback && onRetry ? (
                  <Button
                    className="exchange-search-pill"
                    variant="secondary"
                    onClick={onRetry}
                  >
                    重试地图
                  </Button>
                ) : null}
                {currentFeedback && onRetry ? (
                  <Button
                    className="exchange-search-pill"
                    variant="ghost"
                    onClick={() => tool(tools.onOpenOffices)}
                  >
                    查看名录
                  </Button>
                ) : null}
              </ExchangeSearchStatus>
            ) : null}
            {model.results.map((place) => (
              <button
                key={place.id}
                type="button"
                disabled={place.disabled}
                className="exchange-search-result"
                onClick={() => {
                  onSelect(place)
                  collapse()
                }}
              >
                <strong>{place.label}</strong>
                <span>
                  {[place.address, place.distanceLabel]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            ))}
            {tabs?.hasMore ? (
              <Button
                variant="ghost"
                disabled={model.busy}
                onClick={tabs.onLoadMore}
              >
                加载更多事务所
              </Button>
            ) : null}
            {!IS_APP_TARGET && model.attribution ? (
              <p className="text-xs text-muted-foreground">
                {model.attribution}
              </p>
            ) : null}
          </div>
        ) : null}

        <span className="sr-only" aria-live="polite">
          {selectedPlace ? `已定位：${selectedPlace.label}。` : ""}
          当前范围：{pointCount} 个区域点
        </span>
      </section>
    </>
  )
}
