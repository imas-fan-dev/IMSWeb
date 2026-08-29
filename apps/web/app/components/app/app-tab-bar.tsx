import {
  BookOpenTextIcon,
  CalendarDaysIcon,
  CircleUserIcon,
  HouseIcon,
  UsersIcon,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { NavLink, useLocation } from "react-router"

import {
  isNonScrollingAppRoute,
  normalizeAppPathname,
  scrollAppViewToTop,
} from "~/lib/app-shell-scroll"
import { cn } from "~/lib/utils"

/**
 * Height the tab bar occupies, excluding the safe-area inset. Layouts pad their
 * scroll container by this much so the last row of content clears the bar.
 *
 * The bar floats clear of the screen edge, so this budgets the capsule itself
 * plus the gap beneath it, not just the row height.
 */
export const APP_TAB_BAR_CLEARANCE =
  "pb-[calc(5.25rem+env(safe-area-inset-bottom))]"

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
const BAR_OFFSET = "bottom-[max(1.5rem,calc(env(safe-area-inset-bottom)-9px))]"

// Labels reuse existing translation keys on purpose. Adding app-only keys means
// editing the shared i18n resources, which would change the web bundle and cost
// the byte-identical guarantee this build fork is verified against.
const tabs = [
  { to: "/", label: "navigation.home", icon: HouseIcon, end: true },
  { to: "/events", label: "navigation.events", icon: CalendarDaysIcon },
  { to: "/wiki", label: "navigation.storySite", icon: BookOpenTextIcon },
  { to: "/community", label: "navigation.community", icon: UsersIcon },
  { to: "/account/me", label: "platformAccount.title", icon: CircleUserIcon },
] as const

/**
 * Which tab owns the current URL, using the same rules NavLink applies below.
 * Returning an index (rather than letting each tab draw its own background)
 * is what lets a single lens slide between tabs instead of cross-fading.
 */
function activeTabIndex(pathname: string) {
  return tabs.findIndex((tab) =>
    "end" in tab && tab.end
      ? pathname === tab.to
      : pathname === tab.to || pathname.startsWith(`${tab.to}/`)
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

export function AppTabBar() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const normalizedPathname = normalizeAppPathname(pathname)
  const activeIndex = activeTabIndex(normalizedPathname)
  const slot = Math.max(activeIndex, 0)

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

  return (
    <nav
      aria-label={t("navigation.mainLabel")}
      className={cn(
        "pointer-events-none fixed inset-x-0 z-50 flex justify-center px-3",
        BAR_OFFSET
      )}
    >
      <div
        className="glass-surface glass-bar glass-refract glass-sheen pointer-events-auto relative w-full max-w-sm rounded-full p-1 shadow-[0_10px_36px_-12px_rgb(0_0_0/0.45)] ring-1 ring-foreground/10"
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
              <NavLink
                to={tab.to}
                end={"end" in tab ? tab.end : false}
                className={({ isActive }) =>
                  cn(
                    "glass-tab flex h-12.5 flex-col items-center justify-center gap-0.5 rounded-full text-[0.6875rem]",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )
                }
                onClick={(event) => handleTabClick(event, tab.to)}
              >
                {({ isActive }) => (
                  <>
                    <tab.icon
                      aria-hidden="true"
                      data-glass-tab-icon=""
                      className={cn("size-5", isActive && "fill-primary/15")}
                    />
                    <span>{t(tab.label)}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
