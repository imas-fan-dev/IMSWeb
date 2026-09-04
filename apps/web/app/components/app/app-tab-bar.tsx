import {
  CalendarDaysIcon,
  CircleUserIcon,
  HouseIcon,
  LayoutGridIcon,
  MapPinnedIcon,
  type LucideIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router"

import {
  APP_TABS,
  type AppTabId,
  appTabIdForPathname,
  appTabIndexForPathname,
  appTabRoot,
} from "~/components/app/app-tab-model"
import { NavigationLink } from "~/components/navigation/navigation-link"
import {
  appTabScrollPosition,
  isNonScrollingAppRoute,
  normalizeAppPathname,
  rememberAppTabScrollPosition,
  scrollAppViewToTop,
} from "~/lib/app-shell-scroll"
import {
  configureNativeGlass,
  destroyNativeGlass,
  nativeTabRoute,
  NATIVE_TAB_SELECT_EVENT,
  shouldAttemptNativeGlass,
  type NativeGlassColor,
  updateNativeGlass,
} from "~/lib/native-glass"
import {
  isNativeTabBarSuppressed,
  nativeTabBarSuppressed,
  NATIVE_TAB_BAR_SUPPRESSION_EVENT,
} from "~/lib/native-tab-bar-suppression"
import { useNavigation } from "~/lib/navigation/use-navigation"
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
 *
 * The Android WebView reports a zero bottom inset unless the activity opts into
 * edge-to-edge, so the floor is not decoration: at 12px the capsule sat on top
 * of the gesture handle on a Pixel emulator. 24px clears it and lands within a
 * pixel of what iOS computes from its own inset.
 */
const BAR_OFFSET = "bottom-[max(1.5rem,calc(var(--safe-area-bottom)-9px))]"

const NATIVE_TAB_BAR_SELECTED_COLOR = {
  red: 1,
  green: 23 / 255,
  blue: 79 / 255,
  alpha: 1,
} satisfies NativeGlassColor

const tabIcons = {
  home: HouseIcon,
  events: CalendarDaysIcon,
  apps: LayoutGridIcon,
  map: MapPinnedIcon,
  account: CircleUserIcon,
} satisfies Record<AppTabId, LucideIcon>

const tabs = APP_TABS.map((tab) => ({
  ...tab,
  icon: tabIcons[tab.id],
}))

/**
 * Modifier clicks and non-primary buttons that the browser is expected to
 * handle itself: open in a new tab, open in a new window, download. Mirrors
 * React Router's own link handler so an intercepted tab still behaves like the
 * anchor it is.
 */
function isModifiedEvent(event: React.MouseEvent<HTMLAnchorElement>) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey
}

export function AppTabBar() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const navigate = useNavigation()
  const { pathname } = useLocation()
  const normalizedPathname = normalizeAppPathname(pathname)
  const activeId = appTabIdForPathname(normalizedPathname)
  const activeIndex = appTabIndexForPathname(normalizedPathname)
  const activeRoot = activeId ? appTabRoot(activeId) : null
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
  const [nativeGlassActive, setNativeGlassActive] = useState(false)
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
    if (
      !activeId ||
      normalizedPathname !== activeRoot ||
      isNonScrollingAppRoute(normalizedPathname)
    ) {
      return
    }

    const savedTop = appTabScrollPosition(activeId)
    if (savedTop === null || savedTop === 0 || savedTop === window.scrollY) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: savedTop, behavior: "instant" })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeId, activeRoot, normalizedPathname])

  useEffect(() => {
    if (
      !activeId ||
      normalizedPathname !== activeRoot ||
      isNonScrollingAppRoute(normalizedPathname)
    ) {
      return
    }

    return () => {
      rememberAppTabScrollPosition(activeId, window.scrollY)
    }
  }, [activeId, activeRoot, normalizedPathname])

  const activateTab = useCallback(
    (to: string) => {
      if (normalizedPathname === to) {
        if (!isNonScrollingAppRoute(normalizedPathname)) {
          scrollAppViewToTop()
        }
        return
      }
      navigate(to)
    },
    [navigate, normalizedPathname]
  )

  useEffect(() => {
    if (!shouldAttemptNativeGlass()) return

    const handleNativeSelection = (event: Event) => {
      const route = nativeTabRoute(event)
      if (!route || !tabs.some((tab) => tab.to === route)) return
      activateTab(route)
    }

    window.addEventListener(NATIVE_TAB_SELECT_EVENT, handleNativeSelection)
    return () => {
      window.removeEventListener(NATIVE_TAB_SELECT_EVENT, handleNativeSelection)
    }
  }, [activateTab])

  useEffect(() => {
    if (!shouldAttemptNativeGlass()) return

    const handleSuppressionChange = (event: Event) => {
      const suppressed = nativeTabBarSuppressed(event)
      if (suppressed !== null) setNativeTabBarSuppressedState(suppressed)
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

  useEffect(() => {
    if (!shouldAttemptNativeGlass()) return
    let disposed = false

    void configureNativeGlass({
      dark: initialNativeGlassDark,
      hidden: initialNativeTabBarSuppressed,
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
    initialSlot,
    nativeItems,
  ])

  useEffect(() => {
    if (!nativeGlassActive) return
    let disposed = false

    const options = {
      dark: nativeGlassDark,
      hidden: nativeTabBarSuppressedState,
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
    nativeGlassActive,
    nativeGlassDark,
    nativeTabBarSuppressedState,
  ])

  /**
   * iOS convention: tapping the tab you are already on returns the view to the
   * top. It earns its keep on the wiki catalog, where the page's own search
   * button owns the corner a floating back-to-top would otherwise take.
   *
   * Only a tap *at the tab's own root* scrolls. From somewhere deeper in the
   * tab -- a story page under `/wiki`, say -- the link keeps navigating up to
   * the tab root exactly as it does today, which is both the existing
   * behaviour and the other half of the iOS convention.
   */
  function handleTabClick(
    event: React.MouseEvent<HTMLAnchorElement>,
    to: string
  ) {
    if (normalizedPathname !== to) return
    if (event.defaultPrevented) return
    if (event.button !== 0 || isModifiedEvent(event)) return
    // No tab root is a full-height pane today, so this never fires -- it keeps
    // "only scroll things that scroll" a rule the code enforces rather than one
    // it happens to satisfy.
    if (isNonScrollingAppRoute(normalizedPathname)) return

    // Suppresses React Router's navigation for this click only; `Link` runs
    // this handler first and skips its own once the event is defaulted.
    event.preventDefault()
    if (activeId) rememberAppTabScrollPosition(activeId, 0)
    scrollAppViewToTop()
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

  if (nativeGlassActive) return null

  return (
    <nav
      aria-label={t("navigation.mainLabel")}
      className={cn(
        "pointer-events-none fixed inset-x-0 z-50 flex justify-center px-3",
        BAR_OFFSET
      )}
    >
      <div
        data-glass-fallback=""
        className="glass-surface glass-bar glass-refract pointer-events-auto relative w-full max-w-sm rounded-full p-1 shadow-[0_10px_36px_-12px_rgb(0_0_0/0.45)] ring-1 ring-foreground/10"
        style={
          {
            "--tab-index": slot,
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
          data-visible={activeIndex >= 0 ? "true" : undefined}
          className="glass-lens absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/5)] translate-x-[calc(var(--tab-index)*100%)] opacity-0 data-visible:opacity-100"
        >
          <span
            key={travel.slot}
            className="glass-lens-skin block size-full rounded-full bg-foreground/8 ring-1 ring-foreground/10"
          />
        </span>

        <ul className="relative flex items-stretch">
          {tabs.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavigationLink
                to={tab.to}
                aria-current={tab.id === activeId ? "page" : undefined}
                className={cn(
                  "glass-tab flex h-12.5 flex-col items-center justify-center gap-0.5 rounded-full text-[0.6875rem]",
                  tab.id === activeId
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={(event) => handleTabClick(event, tab.to)}
              >
                <tab.icon
                  aria-hidden="true"
                  data-glass-tab-icon=""
                  className={cn(
                    "size-5",
                    tab.id === activeId && "fill-primary/15"
                  )}
                />
                <span>{t(tab.label)}</span>
              </NavigationLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
