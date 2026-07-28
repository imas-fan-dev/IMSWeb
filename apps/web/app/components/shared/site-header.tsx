import { ExternalLinkIcon, MenuIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, NavLink } from "react-router"

import { LanguageSwitcher } from "~/components/shared/language-switcher"
import { BrandWordmark } from "~/components/shared/brand-wordmark"
import { Button } from "~/components/ui/button"
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

const navigation = [
  { to: "/", label: "navigation.home", end: true },
  { to: "/events", label: "navigation.events", end: false },
  {
    to: "/recommendations",
    label: "navigation.recommendations",
    end: false,
  },
  { to: "/live", label: "navigation.live", end: false },
  { to: "/community", label: "navigation.community", end: true },
  { to: "/community/cards", label: "navigation.cards", end: false },
  { to: "/producer-map", label: "navigation.producerMap", end: false },
  { to: "/works", label: "navigation.works", end: false },
  { to: "/chronicle", label: "navigation.chronicle", end: false },
  { to: "/about", label: "navigation.about", end: false },
] as const

function desktopLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "relative flex h-16 items-center px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
    "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary after:transition-transform",
    isActive ? "text-foreground after:scale-x-100" : "after:scale-x-0"
  )
}

export function SiteHeader() {
  const { t } = useTranslation()
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-3"
          aria-label={t("brand.homeLabel")}
        >
          <BrandWordmark className="h-7 sm:h-9" />
          <span className="hidden border-l pl-3 text-xs font-semibold text-muted-foreground sm:inline">
            {t("brand.name")}
          </span>
        </Link>

        <nav
          className="ml-auto hidden items-center gap-5 md:flex"
          aria-label={t("navigation.mainLabel")}
        >
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={desktopLinkClass}
            >
              {t(item.label)}
            </NavLink>
          ))}
        </nav>

        <Link
          to="/wiki"
          className="hidden items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:inline-flex"
        >
          Wiki
          <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
        </Link>

        <a
          href="/runninggame/"
          className="hidden rounded-md border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:inline-flex"
        >
          {t("navigation.runningGame")}
        </a>

        <LanguageSwitcher />
        <ThemeToggle className="ml-auto md:ml-0" />

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
                className="md:hidden"
                aria-label={t("navigation.open")}
              />
            }
          >
            <MenuIcon data-icon="inline-start" />
          </SheetTrigger>
          <SheetContent side="right" className="w-[min(88vw,22rem)]">
            <SheetHeader className="border-b">
              <SheetTitle>{t("navigation.title")}</SheetTitle>
              <SheetDescription>{t("navigation.description")}</SheetDescription>
            </SheetHeader>
            <nav
              className="flex flex-col px-2"
              aria-label={t("navigation.mobileLabel")}
            >
              {navigation.map((item) => (
                <NavLink
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
                </NavLink>
              ))}
              <Link
                to="/wiki"
                onClick={() => setMobileNavigationOpen(false)}
                className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary p-3 text-sm font-medium text-primary-foreground"
              >
                Wiki
                <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
              </Link>
              <a
                href="/runninggame/"
                onClick={() => setMobileNavigationOpen(false)}
                className="mt-1 rounded-md border p-3 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                {t("navigation.runningGame")}
              </a>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
