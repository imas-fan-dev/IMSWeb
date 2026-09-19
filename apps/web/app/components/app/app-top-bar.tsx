import { ArrowLeftIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router"

import {
  APP_TABS,
  appTabIdForPathname,
  resolveAppBackTarget,
} from "~/components/app/app-tab-model"
import { useAppNavigation } from "~/components/app/app-navigation-provider"
import { BrandWordmark } from "~/components/shared/brand-wordmark"
import { ThemeToggle } from "~/components/shared/theme-toggle"
import { Button } from "~/components/ui/button"
import {
  isNonScrollingAppRoute,
  normalizeAppPathname,
} from "~/lib/app-shell-scroll"

export function AppTopBar() {
  const { t } = useTranslation()
  const location = useLocation()
  const { goBack } = useAppNavigation()
  const pathname = normalizeAppPathname(location.pathname)
  const activeId = appTabIdForPathname(pathname)
  const activeTab = APP_TABS.find((tab) => tab.id === activeId)

  if (isNonScrollingAppRoute(pathname)) return null

  const isHome = pathname === "/"
  // Only a page with a logical parent gets a back control; a tab root is the
  // end of the tree.
  const isRootPage = resolveAppBackTarget(pathname).kind === "root"
  const activeLabel = activeTab ? t(activeTab.label) : "IMSWeb"
  const backLabel = t("navigation.back")

  return (
    <header className="glass-surface glass-bar glass-scroll-bar glass-refract sticky top-0 z-40 shrink-0 pt-(--safe-area-top)">
      {isHome ? (
        <div className="relative z-10 flex h-12 items-center justify-between px-(--app-safe-inline)">
          <BrandWordmark className="h-6" />
          <ThemeToggle />
        </div>
      ) : isRootPage ? (
        <div className="relative z-10 flex h-12 items-center px-(--app-safe-inline)">
          <p className="truncate text-base font-semibold">{activeLabel}</p>
        </div>
      ) : (
        <div className="relative z-10 grid h-12 grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center px-(--app-safe-inline)">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={backLabel}
            title={backLabel}
            onClick={goBack}
          >
            <ArrowLeftIcon aria-hidden="true" />
          </Button>
          <p className="truncate px-2 text-center text-sm font-semibold">
            {activeLabel}
          </p>
          <span aria-hidden="true" />
        </div>
      )}
    </header>
  )
}
