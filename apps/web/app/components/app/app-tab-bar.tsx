import {
  BookOpenTextIcon,
  CalendarDaysIcon,
  CircleUserIcon,
  HouseIcon,
  UsersIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { NavLink } from "react-router"

import { cn } from "~/lib/utils"

/**
 * Height the tab bar occupies, excluding the safe-area inset. Layouts pad their
 * scroll container by this much so the last row of content clears the bar.
 */
export const APP_TAB_BAR_CLEARANCE =
  "pb-[calc(4rem+env(safe-area-inset-bottom))]"

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

export function AppTabBar() {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t("navigation.mainLabel")}
      className="glass-surface glass-bar glass-refract fixed inset-x-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex h-16 items-stretch">
        {tabs.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={"end" in tab ? tab.end : false}
              className={({ isActive }) =>
                cn(
                  "flex size-full flex-col items-center justify-center gap-1 text-[0.6875rem] transition-colors",
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
                    className={cn("size-5", isActive && "fill-primary/10")}
                  />
                  <span>{t(tab.label)}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
