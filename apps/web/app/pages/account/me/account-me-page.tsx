import { useTranslation } from "react-i18next"

import { usePlatformSession } from "~/components/platform/platform-session-provider"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import { NavigationLink } from "~/components/navigation/navigation-link"

/**
 * Account tab for the packaged app.
 *
 * This screen owns every session action the app has: the site header that
 * normally carries PlatformAccountMenu is dropped from the app layout, so
 * without a logout control here a signed-in session would have no way out.
 */
const secondaryDestinations = [
  { to: "/recommendations", label: "navigation.recommendations" },
  { to: "/live", label: "navigation.live" },
  { to: "/works", label: "navigation.works" },
  { to: "/chronicle", label: "navigation.chronicle" },
  { to: "/community/cards", label: "navigation.cards" },
  { to: "/producer-map", label: "navigation.producerMap" },
  { to: "/about", label: "navigation.about" },
] as const

export default function AccountMePage() {
  const { t } = useTranslation()
  const platform = usePlatformSession()

  return (
    <main id="main-content" className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("platformAccount.title")}
      </h1>

      <Card variant="glass" className="mt-5 p-5">
        {platform.status === "authenticated" ||
        platform.status === "restricted" ? (
          <>
            <p className="text-sm font-medium">
              {t("platformAccount.authenticatedLabel", {
                name: platform.session?.profile.displayName ?? "",
              })}
            </p>
            {platform.status === "restricted" ? (
              <Badge
                variant="secondary"
                className="mt-2 bg-warning/25 text-warning-foreground"
              >
                {t("platformAccount.restricted")}
              </Badge>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                render={<NavigationLink to="/community/exchange/me" />}
                nativeButton={false}
              >
                {t("platformAccount.myCards")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void platform.logout()}
              >
                {t("platformAccount.logout")}
              </Button>
            </div>
          </>
        ) : platform.status === "loading" ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t("platformAccount.loading")}
          </p>
        ) : platform.status === "error" ? (
          <>
            <p className="text-sm text-muted-foreground">
              {t("platformAccount.error")}
            </p>
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => void platform.reload()}
              >
                {t("platformAccount.retry")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t("platformAccount.anonymous")}
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                render={<NavigationLink to="/account/login" />}
                nativeButton={false}
              >
                {t("platformAccount.login")}
              </Button>
              <Button
                variant="outline"
                render={<NavigationLink to="/account/register" />}
                nativeButton={false}
              >
                {t("platformAccount.register")}
              </Button>
            </div>
          </>
        )}
      </Card>

      <h2 className="mt-8 text-sm font-medium text-muted-foreground">
        {t("navigation.title")}
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {secondaryDestinations.map((destination) => (
          <li key={destination.to}>
            <NavigationLink
              to={destination.to}
              className="glass-surface glass-control flex h-14 items-center rounded-lg px-4 text-sm font-medium"
            >
              {t(destination.label)}
            </NavigationLink>
          </li>
        ))}
      </ul>
    </main>
  )
}
