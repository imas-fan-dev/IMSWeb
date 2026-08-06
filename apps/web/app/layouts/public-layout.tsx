import { Outlet, useLocation } from "react-router"
import { useTranslation } from "react-i18next"

import { AdminReturnShortcut } from "~/components/shared/admin-return-shortcut"
import { BackToTop } from "~/components/shared/back-to-top"
import { SeriesIconBackground } from "~/components/shared/series-icon-background"
import { SiteFooter } from "~/components/shared/site-footer"
import { SiteHeader } from "~/components/shared/site-header"
import { cn } from "~/lib/utils"

export default function PublicLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const isWikiCatalog = pathname === "/wiki" || pathname === "/wiki/modern"
  const isModernStory = pathname === "/story" || pathname === "/story/modern"

  return (
    <div className="relative isolate flex min-h-svh flex-col">
      <a
        href="#main-content"
        className="fixed top-2 left-2 z-100 -translate-y-16 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm focus:translate-y-0"
      >
        {t("accessibility.skipToContent")}
      </a>
      <SeriesIconBackground />
      <SiteHeader />
      <div
        className={cn(
          "relative flex-1 bg-background/75 sm:bg-background/60",
          isModernStory ? "z-20" : "z-10"
        )}
      >
        <Outlet />
      </div>
      <div className="relative z-10">
        <SiteFooter />
      </div>
      <div className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-2 sm:right-6 sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <BackToTop className={cn("static", isWikiCatalog && "max-md:hidden")} />
        <AdminReturnShortcut className="static" />
      </div>
    </div>
  )
}
