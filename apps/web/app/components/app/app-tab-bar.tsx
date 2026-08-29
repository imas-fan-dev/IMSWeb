import {
  BookOpenTextIcon,
  CalendarDaysIcon,
  CircleUserIcon,
  HouseIcon,
  UsersIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { NavLink, useLocation } from "react-router"

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

export function AppTabBar() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const activeIndex = activeTabIndex(pathname)

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
          { "--tab-index": Math.max(activeIndex, 0) } as React.CSSProperties
        }
      >
        {/* The lens that tracks the active tab. Transform-only so it composites
            on the GPU: animating width or the blur radius would repaint the
            whole translucent surface every frame. */}
        <span
          aria-hidden="true"
          data-visible={activeIndex >= 0 ? "true" : undefined}
          className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/5)] translate-x-[calc(var(--tab-index)*100%)] rounded-full bg-foreground/8 opacity-0 ring-1 ring-foreground/10 transition-[transform,opacity] duration-(--duration-ui) ease-emphasized data-visible:opacity-100 motion-reduce:transition-none"
        />

        <ul className="relative flex items-stretch">
          {tabs.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                end={"end" in tab ? tab.end : false}
                className={({ isActive }) =>
                  cn(
                    "flex h-12.5 flex-col items-center justify-center gap-0.5 rounded-full text-[0.6875rem] transition-colors duration-(--duration-fast)",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <tab.icon
                      aria-hidden="true"
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
