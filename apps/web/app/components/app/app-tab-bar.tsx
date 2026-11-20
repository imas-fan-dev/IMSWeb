import { isTauri } from "@tauri-apps/api/core"
import {
  BookOpenTextIcon,
  CircleUserIcon,
  HandshakeIcon,
  HouseIcon,
  MapPinnedIcon,
  NfcIcon,
  QrCodeIcon,
  UsersIcon,
  UsersRoundIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router"

import { useNamecardUnread } from "~/lib/use-namecard-unread"
import { ExchangeCardPickerDialog } from "~/components/community/exchange/exchange-card-picker-dialog"
import { ScanExchangeDialog } from "~/components/community/exchange/scan-exchange-dialog"
import { ScanShareDialog } from "~/components/community/exchange/scan-share-dialog"
import { useAppNavigation } from "~/components/app/app-navigation-provider"
import {
  APP_TABS,
  type AppTabId,
  appTabIdForPathname,
} from "~/components/app/app-tab-model"
import { useAndroidTabDrag } from "~/components/app/use-android-tab-drag"
import { IS_APP_TARGET } from "~/lib/app-target"
import { NavigationLink } from "~/components/navigation/navigation-link"
import {
  isNonScrollingAppRoute,
  normalizeAppPathname,
} from "~/lib/app-shell-scroll"
import {
  isAndroidRuntimeIdentity,
  configureNativeGlass,
  destroyNativeGlass,
  nativeTabRoute,
  NATIVE_TAB_SELECT_EVENT,
  shouldAttemptNativeGlass,
  type NativeGlassColor,
  updateNativeGlass,
} from "~/lib/native-glass"
import {
  isNativeTabBarInteractionBlocked,
  isNativeTabBarSuppressed,
  nativeTabBarInteractionBlocked,
  nativeTabBarSuppressed,
  NATIVE_TAB_BAR_SUPPRESSION_EVENT,
} from "~/lib/native-tab-bar-suppression"
import { cn } from "~/lib/utils"

/**
 * Complete tab-bar clearance, including the safe-area inset. Layouts pad their
 * scroll container by this much so the last row of content clears the bar.
 *
 * The bar floats clear of the screen edge, so this budgets the capsule itself
 * plus the gap beneath it, not just the row height.
 */
export const APP_TAB_BAR_CLEARANCE = "pb-[var(--app-bottom-clearance)]"

/**
 * Geometry copied from iOS 26's own floating tab bar, measured off a simulator
 * screenshot of Files on an iPhone 17 Pro (874pt tall, 34pt bottom inset):
 * a 58pt capsule whose bottom edge sits 25pt above the screen edge, i.e. 9pt
 * *inside* the safe-area inset rather than stacked on top of it.
 */
const BAR_OFFSET =
  "inset-x-0 bottom-[max(1.5rem,calc(var(--safe-area-bottom)-9px))]"
// Android's system navigation can cover the WebView. Keep the capsule and its
// raised Exchange button entirely clear of that area, with room for the ring.
const ANDROID_BAR_OFFSET =
  "right-(--safe-area-right) bottom-[max(1.5rem,calc(var(--safe-area-bottom)+0.5rem))] left-(--safe-area-left)"

const NATIVE_TAB_BAR_SELECTED_COLOR = {
  red: 1,
  green: 23 / 255,
  blue: 79 / 255,
  alpha: 1,
} satisfies NativeGlassColor

const tabIcons = {
  home: HouseIcon,
  community: UsersIcon,
  map: MapPinnedIcon,
  resources: BookOpenTextIcon,
  account: CircleUserIcon,
} satisfies Record<AppTabId, LucideIcon>

const tabs = APP_TABS.map((tab) => ({
  ...tab,
  icon: tabIcons[tab.id],
}))

/**
 * 弧形子菜单的几何：以中央按钮顶部为原点，左右各外扩再向上抬，
 * 中间那颗最高，形成一条拱形而不是一条直线。
 */
const EXCHANGE_SUB_ACTIONS = [
  { id: "qr", label: "二维码", icon: QrCodeIcon, x: -76, y: -24 },
  { id: "nfc", label: "碰一碰", icon: NfcIcon, x: 0, y: -60 },
  { id: "group", label: "多人交换", icon: UsersRoundIcon, x: 76, y: -24 },
] as const satisfies readonly {
  id: "qr" | "nfc" | "group"
  label: string
  icon: LucideIcon
  x: number
  y: number
}[]

/** 本片只有【二维码】接通；其余两颗按要求置灰，等后续切片接入。 */
const EXCHANGE_SUB_ACTION_DISABLED: Record<
  (typeof EXCHANGE_SUB_ACTIONS)[number]["id"],
  boolean
> = { qr: false, nfc: true, group: true }

function ExchangeActionButton({
  android,
  open,
  onToggle,
  onOpenQr,
}: {
  android: boolean
  open: boolean
  onToggle: () => void
  onOpenQr: () => void
}) {
  return (
    <>
      <div
        id="exchange-action-menu"
        aria-hidden={open ? undefined : true}
        inert={!open}
        className={cn(
          "pointer-events-none absolute left-1/2",
          android
            ? "app-android-exchange-arc"
            : "bottom-[calc(50%+2rem)] size-0"
        )}
      >
        {EXCHANGE_SUB_ACTIONS.map((action, index) => {
          const disabled = EXCHANGE_SUB_ACTION_DISABLED[action.id]
          const Icon = action.icon
          const color = disabled
            ? "bg-muted text-muted-foreground ring-foreground/10"
            : android
              ? "bg-accent text-accent-foreground ring-primary/25"
              : "bg-card text-primary"
          return (
            <span
              key={action.id}
              className={android ? "contents" : "absolute bottom-0 left-0"}
              style={
                android
                  ? undefined
                  : {
                      transform: `translate(calc(-50% + ${action.x}px), ${action.y}px)`,
                    }
              }
            >
              <button
                type="button"
                disabled={disabled}
                aria-label={action.label}
                onClick={disabled ? undefined : onOpenQr}
                style={{
                  transitionDelay: open
                    ? `${index * 45}ms`
                    : `${(EXCHANGE_SUB_ACTIONS.length - 1 - index) * 35}ms`,
                }}
                className={cn(
                  "group flex flex-col items-center gap-1.5 outline-none",
                  android && [
                    "min-w-0 focus-visible:rounded-2xl focus-visible:outline-2 focus-visible:outline-ring",
                    index === 1 && "relative -top-13",
                  ],
                  "transition-[scale,translate,opacity] duration-420 ease-interactive motion-reduce:transition-none",
                  open
                    ? "pointer-events-auto translate-y-0 scale-100"
                    : "pointer-events-none translate-y-3 scale-50",
                  open
                    ? disabled && !android
                      ? "opacity-60"
                      : "opacity-100"
                    : "opacity-0"
                )}
              >
                <span
                  className={cn(
                    "grid place-items-center rounded-full transition-colors",
                    android
                      ? "size-13"
                      : "size-14 shadow-[0_12px_26px_-14px_rgb(0_0_0/0.55)] ring-1",
                    color,
                    !disabled &&
                      (android ? "shadow-sm ring-1" : "ring-primary/20")
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className={android ? "size-7" : "size-6"}
                  />
                </span>
                <span
                  className={cn(
                    "rounded-full py-1 font-semibold",
                    android
                      ? "max-w-full px-2 text-center text-xs/tight wrap-anywhere"
                      : "px-2.5 text-[0.6875rem] leading-none whitespace-nowrap ring-1",
                    color,
                    !android && !disabled && "ring-primary/25"
                  )}
                >
                  {action.label}
                </span>
              </button>
            </span>
          )
        })}
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="exchange-action-menu"
        aria-label={open ? "收起名片交换菜单" : "打开名片交换菜单"}
        onClick={onToggle}
        className={cn(
          "absolute top-1/2 left-1/2 z-10 grid size-16 -translate-1/2 place-items-center rounded-full shadow-[0_14px_30px_-14px_rgb(0_0_0/0.6)] ring-1 ring-primary/25 transition-transform duration-300 ease-out active:scale-95 motion-reduce:transition-none",
          android && open
            ? "bg-accent text-accent-foreground"
            : "bg-primary text-primary-foreground"
        )}
      >
        <span
          className={cn(
            "flex flex-col items-center gap-0.5 transition-[rotate,scale,opacity] duration-300 ease-out motion-reduce:transition-none",
            open ? "scale-75 -rotate-45 opacity-0" : "scale-100 opacity-100"
          )}
        >
          <HandshakeIcon aria-hidden="true" className="size-5.5" />
          <span className="text-[0.625rem] leading-none font-semibold">
            交换
          </span>
        </span>
        <XIcon
          aria-hidden="true"
          className={cn(
            "absolute transition-[rotate,scale,opacity] duration-300 ease-out motion-reduce:transition-none",
            android ? "size-7" : "size-5",
            open ? "scale-100 opacity-100" : "scale-75 -rotate-90 opacity-0"
          )}
        />
      </button>
    </>
  )
}

/**
 * Modifier clicks and non-primary buttons that the browser is expected to
 * handle itself: open in a new tab, open in a new window, download. Mirrors
 * React Router's own link handler so an intercepted tab still behaves like the
 * anchor it is.
 */
function isModifiedEvent(event: React.MouseEvent<HTMLAnchorElement>) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey
}

const subscribeToHydration = () => () => undefined

export function AppTabBar() {
  // Match prerendered HTML before admitting browser-only gesture styles.
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  )
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const { activateTab, activeTab } = useAppNavigation()
  const { pathname, key: routeKey } = useLocation()
  const normalizedPathname = normalizeAppPathname(pathname)
  // An unowned address keeps no selection; a page derived inside another tab
  // is owned by that tab instead of its URL prefix.
  const urlTab = appTabIdForPathname(normalizedPathname)
  const activeId = urlTab ? activeTab : null
  const unread = useNamecardUnread()
  const activeIndex = APP_TABS.findIndex((tab) => tab.id === activeId)
  const slot = Math.max(activeIndex, 0)
  const useLightMapGlass = isNonScrollingAppRoute(normalizedPathname)
  const nativeGlassDark =
    !useLightMapGlass &&
    (resolvedTheme === "dark" ||
      (!resolvedTheme &&
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("dark")))
  const [initialSlot] = useState(slot)
  const [initialNativeGlassDark] = useState(() =>
    useLightMapGlass || typeof document === "undefined"
      ? false
      : document.documentElement.classList.contains("dark")
  )
  const [nativeTabBarSuppressedState, setNativeTabBarSuppressedState] =
    useState(isNativeTabBarSuppressed)
  const [initialNativeTabBarSuppressed] = useState(nativeTabBarSuppressedState)
  const [interactionBlocked, setInteractionBlocked] = useState(
    isNativeTabBarInteractionBlocked
  )
  const [initialInteractionBlocked] = useState(interactionBlocked)
  const [nativeGlassActive, setNativeGlassActive] = useState(false)
  const [exchangeMenuOpen, setExchangeMenuOpen] = useState(false)
  const [scanPickerOpen, setScanPickerOpen] = useState(false)
  const [scanShareCards, setScanShareCards] = useState<
    readonly number[] | null
  >(null)
  const [scanGiveCards, setScanGiveCards] = useState<readonly number[] | null>(
    null
  )
  const nativeItems = useMemo(
    () =>
      tabs.map((tab) => ({
        route: tab.to,
        lucideIcon: tab.lucideIcon,
        title: t(tab.label),
      })),
    [t]
  )

  useEffect(() => {
    if (!shouldAttemptNativeGlass()) return

    const handleNativeSelection = (event: Event) => {
      if (isNativeTabBarInteractionBlocked()) return
      const route = nativeTabRoute(event)
      const tab = tabs.find((candidate) => candidate.to === route)
      if (!tab) return
      activateTab(tab.id)
    }

    window.addEventListener(NATIVE_TAB_SELECT_EVENT, handleNativeSelection)
    return () => {
      window.removeEventListener(NATIVE_TAB_SELECT_EVENT, handleNativeSelection)
    }
  }, [activateTab])

  useEffect(() => {
    const handleSuppressionChange = (event: Event) => {
      const suppressed = nativeTabBarSuppressed(event)
      if (suppressed !== null) setNativeTabBarSuppressedState(suppressed)
      const blocked = nativeTabBarInteractionBlocked(event)
      if (blocked !== null) setInteractionBlocked(blocked)
    }

    window.addEventListener(
      NATIVE_TAB_BAR_SUPPRESSION_EVENT,
      handleSuppressionChange
    )
    return () => {
      window.removeEventListener(
        NATIVE_TAB_BAR_SUPPRESSION_EVENT,
        handleSuppressionChange
      )
    }
  }, [])

  // 导航后收起子菜单：动作按钮不是 tab，跨页时不该留下一个悬空的展开层。
  // 与下面的 lens 位移同一手法——渲染期发现路由换了就同步一次，不进 effect。
  const [menuRouteKey, setMenuRouteKey] = useState(routeKey)
  if (menuRouteKey !== routeKey) {
    setMenuRouteKey(routeKey)
    setExchangeMenuOpen(false)
  }

  useEffect(() => {
    if (!exchangeMenuOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExchangeMenuOpen(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [exchangeMenuOpen])

  useEffect(() => {
    if (!shouldAttemptNativeGlass()) return
    let disposed = false

    void configureNativeGlass({
      dark: initialNativeGlassDark,
      hidden: initialNativeTabBarSuppressed || initialInteractionBlocked,
      interactionBlocked: initialInteractionBlocked,
      items: nativeItems,
      selectedColor: NATIVE_TAB_BAR_SELECTED_COLOR,
      selectedIndex: initialSlot,
    })
      .then((status) => {
        if (disposed) {
          if (status.supported) void destroyNativeGlass().catch(() => {})
          return
        }
        setNativeGlassActive(status.supported)
      })
      .catch(() => {
        if (!disposed) setNativeGlassActive(false)
      })

    return () => {
      disposed = true
      void destroyNativeGlass().catch(() => {})
    }
  }, [
    initialNativeGlassDark,
    initialNativeTabBarSuppressed,
    initialInteractionBlocked,
    initialSlot,
    nativeItems,
  ])

  useEffect(() => {
    if (!nativeGlassActive) return
    let disposed = false

    const options = {
      dark: nativeGlassDark,
      hidden: nativeTabBarSuppressedState || interactionBlocked,
      interactionBlocked,
      selectedColor: NATIVE_TAB_BAR_SELECTED_COLOR,
      ...(activeIndex >= 0 ? { selectedIndex: activeIndex } : {}),
    }

    void updateNativeGlass(options)
      .then((status) => {
        if (!disposed && !status.supported) {
          setNativeGlassActive(false)
          void destroyNativeGlass().catch(() => {})
        }
      })
      .catch(() => {
        if (!disposed) {
          setNativeGlassActive(false)
          void destroyNativeGlass().catch(() => {})
        }
      })

    return () => {
      disposed = true
    }
  }, [
    activeIndex,
    interactionBlocked,
    nativeGlassActive,
    nativeGlassDark,
    nativeTabBarSuppressedState,
  ])

  const isAndroidApp =
    hydrated &&
    IS_APP_TARGET &&
    typeof window !== "undefined" &&
    isTauri() &&
    isAndroidRuntimeIdentity(window.navigator.userAgent)
  const androidDragEnabled =
    isAndroidApp &&
    !nativeGlassActive &&
    !(useLightMapGlass && nativeTabBarSuppressedState)
  const androidMapGlass = androidDragEnabled && useLightMapGlass
  const drag = useAndroidTabDrag({
    enabled: androidDragEnabled && !interactionBlocked && !exchangeMenuOpen,
    selectedIndex: activeIndex,
    count: tabs.length,
    routeKey,
    onSelect: (index) => activateTab(tabs[index].id),
  })

  function handleTabClick(
    event: React.MouseEvent<HTMLAnchorElement>,
    tabId: AppTabId
  ) {
    if (isNativeTabBarInteractionBlocked()) {
      event.preventDefault()
      return
    }
    if (event.defaultPrevented) return
    if (event.button !== 0 || isModifiedEvent(event)) return

    event.preventDefault()
    activateTab(tabId)
  }

  // How far the lens is about to travel, in slots, so it can deform in
  // proportion to the distance rather than the same amount every time.
  // Derived from the previous slot during render: one extra render per
  // navigation, no layout read, and nothing running per frame. Distance is 0
  // on first paint, which holds the deformation keyframes at identity.
  const [travel, setTravel] = useState({ slot, distance: 0 })
  if (travel.slot !== slot) {
    setTravel({ slot, distance: Math.abs(slot - travel.slot) })
  }

  if (
    (nativeGlassActive && !interactionBlocked) ||
    (useLightMapGlass && nativeTabBarSuppressedState)
  )
    return null

  return (
    <>
      <nav
        aria-label={t("navigation.mainLabel")}
        inert={interactionBlocked}
        className={cn(
          "pointer-events-none fixed z-50 flex justify-center px-3",
          isAndroidApp ? ANDROID_BAR_OFFSET : BAR_OFFSET
        )}
      >
        <div
          {...drag}
          data-android-tab-drag={androidDragEnabled ? "" : undefined}
          data-android-map-glass={androidMapGlass ? "" : undefined}
          data-glass-fallback=""
          className={cn(
            "glass-surface glass-bar pointer-events-auto relative w-full max-w-sm rounded-full p-1",
            !androidMapGlass &&
              "glass-refract shadow-[0_10px_36px_-12px_rgb(0_0_0/0.45)] ring-1 ring-foreground/10"
          )}
          style={
            {
              "--tab-index": slot,
              "--app-tab-count": tabs.length,
              "--glass-lens-travel": travel.distance,
            } as React.CSSProperties
          }
        >
          {/* The lens that tracks the active tab. Translate and scale only, so it
            composites on the GPU: animating width or the blur radius would
            repaint the whole translucent surface every frame. The skin is keyed
            by slot so React remounts it on each switch, which replays the
            squash-and-stretch without interrupting the travel underneath. */}
          <span
            aria-hidden="true"
            data-visible={
              activeIndex >= 0 && !(IS_APP_TARGET && activeId === "map")
                ? "true"
                : undefined
            }
            className="glass-lens absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/var(--app-tab-count))] translate-x-[calc(var(--tab-index)*100%)] opacity-0 data-visible:opacity-100"
          >
            <span
              key={travel.slot}
              className="glass-lens-skin block size-full rounded-full bg-foreground/8 ring-1 ring-foreground/10"
            />
          </span>

          <ul className="relative flex items-stretch">
            {tabs.map((tab) => {
              if (IS_APP_TARGET && tab.id === "map") {
                return (
                  <li key={tab.to} className="relative flex-1">
                    <ExchangeActionButton
                      android={isAndroidApp}
                      open={exchangeMenuOpen}
                      onToggle={() => setExchangeMenuOpen((open) => !open)}
                      onOpenQr={() => {
                        setExchangeMenuOpen(false)
                        setScanPickerOpen(true)
                      }}
                    />
                  </li>
                )
              }
              // Expanded means the page behind is frozen; the other four tabs
              // belong to that page, so they stop responding too.
              const frozen = IS_APP_TARGET && exchangeMenuOpen
              return (
                <li key={tab.to} className="flex-1" inert={frozen}>
                  <NavigationLink
                    to={tab.to}
                    aria-current={tab.id === activeId ? "page" : undefined}
                    className={cn(
                      "glass-tab flex h-12.5 flex-col items-center justify-center gap-0.5 rounded-full text-[0.6875rem]",
                      tab.id === activeId
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground",
                      frozen && "pointer-events-none opacity-50"
                    )}
                    onClick={(event) => handleTabClick(event, tab.id)}
                  >
                    <tab.icon
                      aria-hidden="true"
                      data-glass-tab-icon=""
                      className={cn(
                        "size-5",
                        tab.id === activeId && "fill-primary/15"
                      )}
                    />
                    <span className="relative">
                      {t(tab.label)}
                      {tab.id === "account" && unread > 0 ? (
                        <span
                          className="absolute -top-6.5 -right-3 grid size-3.5 place-items-center rounded-full bg-destructive text-[9px] leading-none font-medium text-destructive-foreground"
                          aria-label={`${unread} 条未读消息`}
                        >
                          {unread > 9 ? "9+" : unread}
                        </span>
                      ) : null}
                    </span>
                  </NavigationLink>
                </li>
              )
            })}
          </ul>
        </div>
      </nav>
      {IS_APP_TARGET ? (
        <div
          data-slot="exchange-scrim"
          data-open={exchangeMenuOpen ? "true" : undefined}
          aria-hidden="true"
          onClick={() => setExchangeMenuOpen(false)}
          className={cn(
            "fixed inset-0 z-40 transition-opacity duration-300 ease-out motion-reduce:transition-none",
            isAndroidApp
              ? "bg-background/55"
              : "bg-background/50 backdrop-blur-sm",
            exchangeMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        />
      ) : null}
      {IS_APP_TARGET ? (
        <>
          <ExchangeCardPickerDialog
            open={scanPickerOpen}
            onOpenChange={setScanPickerOpen}
            variant="scan-share"
            onSubmit={(cardNumbers) => setScanShareCards(cardNumbers)}
            onScan={(cardNumbers) => setScanGiveCards(cardNumbers)}
          />
          <ScanShareDialog
            open={scanShareCards !== null}
            onOpenChange={(open) => {
              if (!open) setScanShareCards(null)
            }}
            cardNumbers={scanShareCards ?? []}
          />
          <ScanExchangeDialog
            open={scanGiveCards !== null}
            onOpenChange={(open) => {
              if (!open) setScanGiveCards(null)
            }}
            cardNumbers={scanGiveCards ?? []}
          />
        </>
      ) : null}
    </>
  )
}
