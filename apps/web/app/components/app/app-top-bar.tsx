import { ArrowLeftIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router"

import {
  APP_TABS,
  appTabIdForPathname,
  appTabRoot,
} from "~/components/app/app-tab-model"
import { BrandWordmark } from "~/components/shared/brand-wordmark"
import { ThemeToggle } from "~/components/shared/theme-toggle"
import { Button } from "~/components/ui/button"
import { normalizeAppPathname } from "~/lib/app-shell-scroll"
import { useNavigation } from "~/lib/navigation/use-navigation"

export function AppTopBar() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigation()
  const pathname = normalizeAppPathname(location.pathname)
  const activeId = appTabIdForPathname(pathname)
  const activeTab = APP_TABS.find((tab) => tab.id === activeId)

  if (activeId === "map" && pathname === appTabRoot("map")) return null

  const isHome = pathname === "/"
  const isTabRoot = activeTab?.to === pathname
  const activeLabel = activeTab ? t(activeTab.label) : "IMSWeb"
  const backLabel = t("navigation.back")

  function goBack() {
    if (location.key !== "default") {
      navigate(-1)
      return
    }
    navigate(activeId ? appTabRoot(activeId) : "/")
  }

  return (
    <header className="glass-surface glass-bar glass-scroll-bar glass-refract sticky top-0 z-40 shrink-0 pt-(--safe-area-top)">
      {isHome ? (
        <div className="relative z-10 flex h-12 items-center justify-between px-(--app-safe-inline)">
          <BrandWordmark className="h-6" />
          <ThemeToggle />
        </div>
      ) : isTabRoot ? (
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
