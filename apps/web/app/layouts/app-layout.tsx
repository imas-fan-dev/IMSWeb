import { Outlet, useLocation, useMatch } from "react-router"
import { useTranslation } from "react-i18next"

import { NamecardUploadDialog } from "~/components/community/namecard-upload-dialog"
import { AppColdStartMask } from "~/components/app/app-cold-start-mask"
import { AppTabBar, APP_TAB_BAR_CLEARANCE } from "~/components/app/app-tab-bar"
import { PlatformSessionProvider } from "~/components/platform/platform-session-provider"
import { BackToTop } from "~/components/shared/back-to-top"
import { BrandWordmark } from "~/components/shared/brand-wordmark"
import { SeriesIconBackground } from "~/components/shared/series-icon-background"
import { ThemeToggle } from "~/components/shared/theme-toggle"
import { cn } from "~/lib/utils"

/**
 * Chrome for the packaged mobile app.
 *
 * Only the app build imports this module, which is what keeps the web bundle
 * byte-identical. It deliberately drops three things the web layout carries:
 * the desktop navigation and hamburger drawer (a bottom tab bar replaces both),
 * the site footer (its links live under the account tab), and the admin return
 * shortcut (admin routes are not in this build, so its link is a dead end).
 *
 * Phone viewports only. There are no desktop breakpoints here on purpose.
 */
export default function AppLayout() {
  const { t } = useTranslation()
  const location = useLocation()
  const normalizedPathname =
    location.pathname.length > 1
      ? location.pathname.replace(/\/+$/, "")
      : location.pathname
  const isExchangeMap = normalizedPathname === "/community/exchange"
  const isNamecardWall = Boolean(useMatch("/community/cards"))

  return (
    <PlatformSessionProvider>
      <AppColdStartMask />
      <div
        className={cn(
          "relative isolate flex min-h-svh flex-col",
          isExchangeMap && "h-dvh min-h-0 overflow-hidden"
        )}
      >
        <a
          href="#main-content"
          className="fixed top-2 left-2 z-100 -translate-y-16 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm focus:translate-y-0"
        >
          {t("accessibility.skipToContent")}
        </a>
        {isExchangeMap ? null : <SeriesIconBackground />}
        <header className="glass-surface glass-bar glass-scroll-bar glass-refract sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
          <div className="relative z-10 flex h-12 items-center justify-between px-4">
            <BrandWordmark className="h-6" />
            <ThemeToggle />
          </div>
        </header>
        <div
          className={cn(
            "relative z-10 flex-1 bg-background/75",
            !isExchangeMap && APP_TAB_BAR_CLEARANCE,
            isExchangeMap && "min-h-0 bg-[#e8f2f4]"
          )}
        >
          <Outlet />
        </div>
        {isExchangeMap ? null : (
          <div className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-2">
            {isNamecardWall ? <NamecardUploadDialog /> : null}
            <BackToTop className="static" />
          </div>
        )}
        <AppTabBar />
      </div>
    </PlatformSessionProvider>
  )
}
