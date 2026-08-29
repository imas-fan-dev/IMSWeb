import { Link } from "react-router"
import { useTranslation } from "react-i18next"

import { usePlatformSession } from "~/components/platform/platform-session-provider"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"

/**
 * Account tab for the packaged app. Static shell for now.
 *
 * The session panel below will read anonymous on a real device no matter who is
 * logged in, because the app talks to the API cross-origin and cannot see the
 * platform session cookie. That is expected until Bearer-token auth lands; it
 * is not a defect to file against this screen.
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
          <p className="text-sm font-medium">
            {t("platformAccount.authenticatedLabel", {
              name: platform.session?.profile.displayName ?? "",
            })}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t("platformAccount.anonymous")}
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                render={<Link to="/account/login" />}
                nativeButton={false}
              >
                {t("platformAccount.login")}
              </Button>
              <Button
                variant="outline"
                render={<Link to="/account/register" />}
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
            <Link
              to={destination.to}
              className="glass-surface glass-control flex h-14 items-center rounded-lg px-4 text-sm font-medium"
            >
              {t(destination.label)}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
