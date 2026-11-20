import { isTauri } from "@tauri-apps/api/core"
import {
  BookOpenTextIcon,
  CircleUserIcon,
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
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"
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
import { Button } from "~/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"
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
  NATIVE_TAB_ACTION_EVENT,
  NATIVE_TAB_SELECT_EVENT,
  shouldAttemptNativeGlass,
  type NativeGlassColor,
  type NativeGlassTabItem,
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

// The iOS fallback mirrors Apple's capsule, which sits 9pt inside the inset.
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
  {
    label: "appNavigation.exchangeQr",
    icon: QrCodeIcon,
    disabled: false,
    x: -76,
    y: -24,
  },
  {
    label: "appNavigation.exchangeNfc",
    icon: NfcIcon,
    disabled: true,
    x: 0,
    y: -60,
  },
  {
    label: "appNavigation.exchangeGroup",
    icon: UsersRoundIcon,
    disabled: true,
    x: 76,
    y: -24,
  },
] as const

function NativeExchangeMenu({
  open,
  onOpenChange,
  onOpenQr,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenQr: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-md gap-2 overflow-y-auto sm:border-x"
      >
        <SheetHeader className="px-5 py-2">
          <SheetTitle>{t("appNavigation.exchangeMenu")}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1 px-4">
          {EXCHANGE_SUB_ACTIONS.map(({ label, icon: Icon, disabled }) => (
            <Button
              key={label}
              variant={disabled ? "ghost" : "secondary"}
              disabled={disabled}
              onClick={disabled ? undefined : onOpenQr}
              className="min-h-11 justify-start gap-3 px-3"
            >
              <Icon aria-hidden="true" />
              {t(label)}
            </Button>
          ))}
        </div>
        <SheetClose
          render={<Button variant="ghost" className="mx-4 min-h-11" />}
        >
          {t("actions.close")}
        </SheetClose>
      </SheetContent>
    </Sheet>
  )
}

// The iOS exchangeTabMask draws the same card and mirrored hand silhouette.
const EXCHANGE_HAND_PATH =
  "M4.8 16.1 7 14.2a1.55 1.55 0 0 1 2.2 2.18l-.78.93h4.17a1.18 1.18 0 0 1 .62 2.19l-2.64 1.4a3.3 3.3 0 0 1-2.44.24L4.8 20.2Z"

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
  const { t } = useTranslation()
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
          const { disabled } = action
          const Icon = action.icon
          const color = disabled
            ? "bg-muted text-muted-foreground ring-foreground/10"
            : android
              ? "bg-accent text-accent-foreground ring-primary/25"
              : "bg-card text-primary"
          return (
            <span
              key={action.label}
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
                aria-label={t(action.label)}
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
                  {t(action.label)}
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
        aria-label={t(
          open
            ? "appNavigation.exchangeMenuClose"
            : "appNavigation.exchangeMenuOpen"
        )}
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
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="size-6"
          >
            <path
              fillRule="evenodd"
              d="M7.6 7.7h8.8A1.6 1.6 0 0 1 18 9.3v5.4a1.6 1.6 0 0 1-1.6 1.6H7.6A1.6 1.6 0 0 1 6 14.7V9.3a1.6 1.6 0 0 1 1.6-1.6Z M11.2 12a1.25 1.25 0 1 0-2.5 0 1.25 1.25 0 0 0 2.5 0Z M13.45 10.55h2.25a.65.65 0 1 1 0 1.3h-2.25a.65.65 0 1 1 0-1.3Z M13.45 12.65h1.5a.65.65 0 1 1 0 1.3h-1.5a.65.65 0 1 1 0-1.3Z"
            />
            <rect x="1.05" y="15.15" width="2.6" height="6.1" rx=".8" />
            <path d={EXCHANGE_HAND_PATH} />
            <g transform="rotate(180 12 12)">
              <rect x="1.05" y="15.15" width="2.6" height="6.1" rx=".8" />
              <path d={EXCHANGE_HAND_PATH} />
            </g>
          </svg>
          <span className="text-[0.625rem] leading-none font-semibold">
            {t("appNavigation.exchange")}
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
  const nativeSelectedIndex = activeId === "map" ? -1 : activeIndex
  const accountBadge = unread > 9 ? "9+" : unread > 0 ? String(unread) : ""
  const [initialNativeSelection] = useState(() => ({
    currentRoute: normalizedPathname,
    routeKey,
    selectedIndex: nativeSelectedIndex,
    accountBadge,
  }))
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
      tabs.map(
        (tab): NativeGlassTabItem =>
          tab.id === "map"
            ? {
                action: "exchange",
                title: t("appNavigation.exchange"),
                menu: {
                  qr: t("appNavigation.exchangeQr"),
                  nfc: t("appNavigation.exchangeNfc"),
                  group: t("appNavigation.exchangeGroup"),
                  close: t("appNavigation.exchangeMenuClose"),
                },
              }
            : { route: tab.to, lucideIcon: tab.lucideIcon, title: t(tab.label) }
      ),
    [t]
  )

  const openQrPicker = useCallback(() => {
    setExchangeMenuOpen(false)
    setScanPickerOpen(true)
  }, [])

  useEffect(() => {
    if (!nativeGlassActive) return

    const handleNativeSelection = (event: Event) => {
      if (isNativeTabBarInteractionBlocked()) return
      const route = nativeTabRoute(event)
      const tab = tabs.find((candidate) => candidate.to === route)
      if (!tab || tab.id === "map") return
      activateTab(tab.id)
    }
    const handleNativeAction = (event: Event) => {
      if (isNativeTabBarInteractionBlocked()) return
      if (!(event instanceof CustomEvent)) return
      if (event.detail?.action === "exchange") setExchangeMenuOpen(true)
      if (
        event.detail?.action === "exchange-qr" &&
        event.detail?.routeKey === routeKey
      ) {
        openQrPicker()
      }
    }

    window.addEventListener(NATIVE_TAB_SELECT_EVENT, handleNativeSelection)
    window.addEventListener(NATIVE_TAB_ACTION_EVENT, handleNativeAction)
    return () => {
      window.removeEventListener(NATIVE_TAB_SELECT_EVENT, handleNativeSelection)
      window.removeEventListener(NATIVE_TAB_ACTION_EVENT, handleNativeAction)
    }
  }, [activateTab, nativeGlassActive, openQrPicker, routeKey])

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
    if (!exchangeMenuOpen || nativeGlassActive) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExchangeMenuOpen(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [exchangeMenuOpen, nativeGlassActive])

  useEffect(() => {
    if (!shouldAttemptNativeGlass()) return
    let disposed = false

    void configureNativeGlass({
      dark: initialNativeGlassDark,
      hidden: initialNativeTabBarSuppressed || initialInteractionBlocked,
      interactionBlocked: initialInteractionBlocked,
      items: nativeItems,
      selectedColor: NATIVE_TAB_BAR_SELECTED_COLOR,
      ...initialNativeSelection,
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
    initialNativeSelection,
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
      currentRoute: normalizedPathname,
      routeKey,
      selectedIndex: nativeSelectedIndex,
      accountBadge,
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
    accountBadge,
    interactionBlocked,
    nativeGlassActive,
    nativeGlassDark,
    nativeSelectedIndex,
    nativeTabBarSuppressedState,
    normalizedPathname,
    routeKey,
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
    onSelect: (index) => {
      const tab = tabs[index]
      if (tab && tab.id !== "map") activateTab(tab.id)
    },
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

  const showFallbackBar = nativeGlassActive
    ? interactionBlocked && !nativeTabBarSuppressedState
    : !(useLightMapGlass && nativeTabBarSuppressedState)

  return (
    <>
      {showFallbackBar ? (
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
                        onOpenQr={openQrPicker}
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
      ) : null}
      {IS_APP_TARGET && showFallbackBar && !nativeGlassActive ? (
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
          {nativeGlassActive ? (
            <NativeExchangeMenu
              open={exchangeMenuOpen}
              onOpenChange={setExchangeMenuOpen}
              onOpenQr={openQrPicker}
            />
          ) : null}
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
