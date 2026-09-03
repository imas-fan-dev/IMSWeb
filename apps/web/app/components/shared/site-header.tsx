import { BookOpenTextIcon, HouseIcon, MenuIcon } from "lucide-react"
import { useState, useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router"

import { BrandWordmark } from "~/components/shared/brand-wordmark"
import { PlatformAccountMenu } from "~/components/platform/platform-account-menu"
import { Button, buttonVariants } from "~/components/ui/button"
import { ThemeToggle } from "~/components/shared/theme-toggle"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet"
import { cn } from "~/lib/utils"
import {
  NavigationLink,
  NavigationNavLink,
} from "~/components/navigation/navigation-link"

const navigation = [
  { to: "/", label: "navigation.home", end: true },
  { to: "/events", label: "navigation.events", end: false },
  {
    to: "/recommendations",
    label: "navigation.recommendations",
    end: false,
  },
  { to: "/live", label: "navigation.live", end: false },
  { to: "/community", label: "navigation.community", end: false },
  { to: "/about", label: "navigation.about", end: true },
] as const

const subscribeToHydration = () => () => undefined

function useHydrated() {
  return useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  )
}

function desktopLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "glass-tab relative z-10 flex h-9 flex-1 items-center justify-center rounded-full px-3 text-sm font-medium whitespace-nowrap",
    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
  )
}

/**
 * Index of the nav entry owning the current URL, mirroring NavLink's own rules.
 * A single lens sliding between entries is the iOS 26 navigation idiom; letting
 * each entry paint its own background would cross-fade instead of travel.
 */
function activeNavigationIndex(pathname: string) {
  return navigation.findIndex((item) =>
    item.end
      ? pathname === item.to
      : pathname === item.to || pathname.startsWith(`${item.to}/`)
  )
}

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigationIndex = activeNavigationIndex(pathname)
  const navigationSlot = Math.max(navigationIndex, 0)
  const hydrated = useHydrated()
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)

  // Same travelling-lens contract as the app tab bar: the slot distance of the
  // pending move, derived during render, so the lens deforms in proportion to
  // how far it goes. Six entries here rather than five, so the widest jump is
  // five slots; the amplitude is clamped in CSS to keep the website restrained.
  const [travel, setTravel] = useState({ slot: navigationSlot, distance: 0 })
  if (travel.slot !== navigationSlot) {
    setTravel({
      slot: navigationSlot,
      distance: Math.abs(navigationSlot - travel.slot),
    })
  }

  return (
    <header className="glass-surface glass-bar glass-scroll-bar glass-refract glass-sheen sticky top-0 z-40">
      <div
        className={cn(
          "mx-auto flex w-full max-w-7xl items-center sm:h-16 sm:gap-3 sm:px-6 lg:gap-6 lg:px-8",
          compact ? "h-12 gap-1.5 px-3" : "h-16 gap-2 px-4"
        )}
      >
        <NavigationLink
          to="/"
          className="flex min-w-0 items-center gap-3"
          aria-label={t("brand.homeLabel")}
        >
          <BrandWordmark
            className={cn(compact ? "h-6" : "h-7", "sm:h-9")}
            alt=""
          />
          <span className="hidden border-l pl-3 text-xs font-semibold text-muted-foreground sm:inline">
            {t("brand.name")}
          </span>
        </NavigationLink>

        <nav
          className="ml-auto hidden items-center lg:flex"
          aria-label={t("navigation.mainLabel")}
        >
          {/* Glass segment, not a backdrop-filter surface of its own: the header
              behind it is already blurred, so a second blur layer would cost
              compositing for no visible gain. */}
          <div
            data-glass-interactive=""
            className="glass-surface glass-quiet glass-sheen relative flex items-stretch rounded-full p-1 ring-1 ring-foreground/10"
            style={
              {
                "--nav-index": navigationSlot,
                "--glass-lens-travel": travel.distance,
              } as React.CSSProperties
            }
          >
            <span
              aria-hidden="true"
              data-visible={navigationIndex >= 0 ? "true" : undefined}
              className="glass-lens absolute inset-y-1.5 left-1 w-[calc((100%-0.5rem)/6)] translate-x-[calc(var(--nav-index)*100%)] opacity-0 data-visible:opacity-100"
            >
              <span
                key={travel.slot}
                className="glass-lens-skin block size-full rounded-full bg-foreground/8 ring-1 ring-foreground/10"
              />
            </span>
            {navigation.map((item) => (
              <NavigationNavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={desktopLinkClass}
              >
                {t(item.label)}
              </NavigationNavLink>
            ))}
          </div>
        </nav>

        <NavigationLink
          to="/wiki"
          className="hidden items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none lg:inline-flex"
        >
          {t("navigation.storySite")}
          <BookOpenTextIcon aria-hidden="true" className="size-3.5" />
        </NavigationLink>

        <div
          className={cn(
            "ml-auto flex shrink-0 items-center lg:ml-0",
            compact ? "gap-1.5 sm:gap-2" : "gap-2"
          )}
        >
          {compact ? (
            <NavigationLink
              to="/"
              className={cn(
                buttonVariants({ variant: "outline", size: "icon" }),
                "sm:hidden"
              )}
              aria-label="返回首页"
              title="返回首页"
            >
              <HouseIcon aria-hidden="true" />
            </NavigationLink>
          ) : null}
          <PlatformAccountMenu />
          <ThemeToggle />

          <Sheet
            open={mobileNavigationOpen}
            onOpenChange={setMobileNavigationOpen}
          >
            <SheetTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="lg:hidden"
                  disabled={!hydrated}
                  aria-label={t("navigation.open")}
                />
              }
            >
              <MenuIcon data-icon="inline-start" />
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(88vw,22rem)]">
              <SheetHeader className="border-b">
                <SheetTitle>{t("navigation.title")}</SheetTitle>
                <SheetDescription>
                  {t("navigation.description")}
                </SheetDescription>
              </SheetHeader>
              <nav
                className="flex flex-col px-2"
                aria-label={t("navigation.mobileLabel")}
              >
                {navigation.map((item) => (
                  <NavigationNavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileNavigationOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "rounded-md p-3 text-sm font-medium hover:bg-muted",
                        isActive && "bg-muted text-primary"
                      )
                    }
                  >
                    {t(item.label)}
                  </NavigationNavLink>
                ))}
                <NavigationLink
                  to="/wiki"
                  onClick={() => setMobileNavigationOpen(false)}
                  className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary p-3 text-sm font-medium text-primary-foreground"
                >
                  {t("navigation.storySite")}
                  <BookOpenTextIcon aria-hidden="true" className="size-3.5" />
                </NavigationLink>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
