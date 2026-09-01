import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Outlet, useLocation, useMatch } from "react-router"

import { NamecardUploadDialog } from "~/components/community/namecard-upload-dialog"
import { AppColdStartMask } from "~/components/app/app-cold-start-mask"
import { AppTabBar, APP_TAB_BAR_CLEARANCE } from "~/components/app/app-tab-bar"
import { AppTopBar } from "~/components/app/app-top-bar"
import { PlatformSessionProvider } from "~/components/platform/platform-session-provider"
import { BackToTop } from "~/components/shared/back-to-top"
import { SeriesIconBackground } from "~/components/shared/series-icon-background"
import {
  isNonScrollingAppRoute,
  normalizeAppPathname,
} from "~/lib/app-shell-scroll"
import { APP_FLOATING_CONTROL_OFFSET } from "~/lib/app-target"
import { cn } from "~/lib/utils"

/**
 * Chrome for the packaged mobile app.
 *
 * Only the app build imports this module, which is what keeps the web bundle
 * byte-identical. It deliberately drops three things the web layout carries:
 * the desktop navigation and hamburger drawer (a bottom tab bar replaces both),
 * the site footer (public destinations live under the Apps tab), and the admin
 * return shortcut (admin routes are not in this build, so its link is a dead end).
 *
 * Phone viewports only. There are no desktop breakpoints here on purpose.
 */
export default function AppLayout() {
  const { t } = useTranslation()
  const location = useLocation()
  const normalizedPathname = normalizeAppPathname(location.pathname)
  // Shared with the tab bar, which has to know the same thing to decide whether
  // tapping the active tab has a "top" to scroll to. See `app-shell-scroll.ts`.
  const isExchangeMap: boolean = isNonScrollingAppRoute(normalizedPathname)

  useEffect(() => {
    const root: HTMLElement = document.documentElement
    root.toggleAttribute("data-app-immersive", isExchangeMap)
    return () => root.removeAttribute("data-app-immersive")
  }, [isExchangeMap])

  // The wiki catalog puts its own search button in this corner below `md`, so
  // back-to-top yields the slot exactly as it does in `public-layout.tsx`.
  // Without this the two stack on the same pixels once the search button is
  // lifted clear of the tab bar.
  const isWikiCatalog =
    normalizedPathname === "/wiki" || normalizedPathname === "/wiki/modern"
  const isNamecardWall = Boolean(useMatch("/community/cards"))

  return (
    <PlatformSessionProvider>
      <AppColdStartMask />
      <div
        data-app-shell=""
        data-app-immersive={isExchangeMap ? "" : undefined}
        className={cn(
          "relative isolate flex min-h-svh flex-col",
          isExchangeMap && "h-dvh min-h-0 overflow-hidden"
        )}
      >
        <a
          href="#main-content"
          className="fixed top-[calc(0.5rem+var(--safe-area-top))] left-[calc(0.5rem+var(--safe-area-left))] z-100 translate-y-[calc(-100%-var(--safe-area-top)-0.5rem)] rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm focus-visible:translate-y-0"
        >
          {t("accessibility.skipToContent")}
        </a>
        {isExchangeMap ? null : <SeriesIconBackground />}
        <AppTopBar />
        <div
          className={cn(
            "relative z-10 flex-1",
            !isExchangeMap && "bg-background/75",
            !isExchangeMap && APP_TAB_BAR_CLEARANCE,
            isExchangeMap && "min-h-0 bg-background"
          )}
        >
          <Outlet />
        </div>
        {isExchangeMap ? null : (
          <div
            className={cn(
              "fixed right-[calc(1rem+var(--safe-area-right))] z-40 flex flex-col items-end gap-2",
              APP_FLOATING_CONTROL_OFFSET
            )}
          >
            {isNamecardWall ? <NamecardUploadDialog /> : null}
            <BackToTop
              className={cn("static", isWikiCatalog && "max-md:hidden")}
            />
          </div>
        )}
        <AppTabBar />
      </div>
    </PlatformSessionProvider>
  )
}
