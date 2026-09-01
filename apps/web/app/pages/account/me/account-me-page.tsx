import {
  ChevronRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  LogInIcon,
  LogOutIcon,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { usePlatformSession } from "~/components/platform/platform-session-provider"
import { PageShell } from "~/components/shared/page-shell"
import { ThemeToggle } from "~/components/shared/theme-toggle"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import { profileWorkspaceSections } from "~/pages/community/exchange/me/profile-workspace-navigation"

type LogoutFeedback = "idle" | "pending" | "success" | "error"

export function meta() {
  return [{ title: "帐号 | IMSWeb" }]
}

function AccountUtilities() {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="account-utilities-title">
      <h2 id="account-utilities-title" className="text-sm font-medium">
        {t("platformAccount.app.preferences")}
      </h2>
      <ul className="mt-3 divide-y border-y">
        <li className="flex min-h-14 items-center justify-between gap-4 py-2">
          <span className="text-sm">{t("platformAccount.app.theme")}</span>
          <ThemeToggle />
        </li>
        <li>
          <NavigationLink
            to="/about"
            className="flex min-h-14 items-center justify-between gap-4 py-2 text-sm outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span>{t("navigation.about")}</span>
            <ChevronRightIcon
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          </NavigationLink>
        </li>
      </ul>
    </section>
  )
}

export default function AccountMePage() {
  const { t } = useTranslation()
  const platform = usePlatformSession()
  const [logoutAttempt, setLogoutAttempt] =
    useState<Exclude<LogoutFeedback, "success">>("idle")
  const logoutFeedback: LogoutFeedback =
    logoutAttempt === "pending" && platform.status === "anonymous"
      ? "success"
      : logoutAttempt === "pending" && platform.status === "error"
        ? "error"
        : logoutAttempt

  function logout() {
    setLogoutAttempt("pending")
    void platform.logout().catch(() => setLogoutAttempt("error"))
  }

  if (platform.status === "loading") {
    const label =
      logoutFeedback === "pending"
        ? t("platformAccount.app.logoutPending")
        : t("platformAccount.loadingLabel")

    return (
      <PageShell
        width="read"
        data-account-state="loading"
        aria-label={label}
        aria-busy="true"
      >
        <p className="sr-only" aria-live="polite">
          {label}
        </p>
        <div className="space-y-4" aria-hidden="true">
          <Skeleton className="h-8 w-28" />
          <div className="flex items-center gap-4 border-y py-5">
            <Skeleton className="size-14 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-40 max-w-full" />
              <Skeleton className="h-4 w-28 max-w-full" />
            </div>
          </div>
          <div className="space-y-3 pt-2">
            {profileWorkspaceSections.map((section) => (
              <Skeleton key={section.id} className="h-14 w-full" />
            ))}
          </div>
        </div>
      </PageShell>
    )
  }

  if (platform.status === "error") {
    const logoutFailed = logoutFeedback === "error"

    return (
      <PageShell width="read" data-account-state="error">
        <h1 className="sr-only">{t("platformAccount.title")}</h1>
        <Alert variant="destructive" className="mt-5">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>
            {logoutFailed
              ? t("platformAccount.app.logoutFailed")
              : t("platformAccount.error")}
          </AlertTitle>
          <AlertDescription>
            {logoutFailed
              ? t("platformAccount.app.logoutFailedDescription")
              : t("platformAccount.app.sessionUnavailableDescription")}
          </AlertDescription>
        </Alert>
        <Button
          type="button"
          className="mt-4"
          onClick={logoutFailed ? logout : () => void platform.reload()}
        >
          {logoutFailed ? (
            <LogOutIcon data-icon="inline-start" aria-hidden="true" />
          ) : null}
          {logoutFailed
            ? t("platformAccount.app.retryLogout")
            : t("platformAccount.retry")}
        </Button>
      </PageShell>
    )
  }

  const signedIn =
    (platform.status === "authenticated" || platform.status === "restricted") &&
    platform.session

  if (!signedIn) {
    return (
      <PageShell
        width="read"
        className="space-y-8"
        data-account-state="anonymous"
      >
        <header>
          <h1 className="sr-only">{t("platformAccount.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("platformAccount.anonymous")}
          </p>
        </header>

        {logoutFeedback === "success" ? (
          <Alert aria-live="polite">
            <CircleCheckIcon aria-hidden="true" />
            <AlertTitle>{t("platformAccount.app.signedOut")}</AlertTitle>
            <AlertDescription>
              {t("platformAccount.app.signedOutDescription")}
            </AlertDescription>
          </Alert>
        ) : null}

        <section aria-labelledby="account-access-title">
          <h2 id="account-access-title" className="text-sm font-medium">
            {t("platformAccount.app.access")}
          </h2>
          <div className="mt-3 grid gap-3">
            <Button
              size="lg"
              render={<NavigationLink to="/account/login" />}
              nativeButton={false}
            >
              <LogInIcon data-icon="inline-start" aria-hidden="true" />
              {t("platformAccount.login")}
            </Button>
            <Button
              variant="outline"
              size="lg"
              render={<NavigationLink to="/account/register" />}
              nativeButton={false}
            >
              {t("platformAccount.register")}
            </Button>
            <NavigationLink
              to="/account/password-reset"
              className="inline-flex min-h-10 items-center justify-center gap-2 text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-primary"
            >
              <KeyRoundIcon className="size-4" aria-hidden="true" />
              {t("platformAuth.forgotPassword")}
            </NavigationLink>
          </div>
        </section>

        <AccountUtilities />
      </PageShell>
    )
  }

  const { profile } = signedIn
  const restricted = platform.status === "restricted"
  const displayName = profile.displayName || t("platformAccount.fallback")

  return (
    <PageShell
      width="read"
      className="space-y-8"
      data-account-state={restricted ? "restricted" : "authenticated"}
    >
      <h1 className="sr-only">{t("platformAccount.title")}</h1>

      <section
        className="flex min-w-0 items-center gap-4 border-y py-5"
        aria-label={t("platformAccount.app.identity")}
      >
        <Avatar size="lg" className="size-14 shrink-0">
          {profile.avatarUrl ? (
            <AvatarImage
              src={profile.avatarUrl}
              alt={t("platformAccount.avatarAlt", { name: displayName })}
              referrerPolicy="no-referrer"
            />
          ) : null}
          <AvatarFallback className="text-lg">
            {displayName.trim().slice(0, 1) || t("platformAccount.fallback")}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate font-medium">{displayName}</p>
            <Badge variant={restricted ? "secondary" : "outline"}>
              {t(
                restricted
                  ? "platformAccount.restricted"
                  : "platformAccount.authenticated"
              )}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {profile.homeCity || t("platformAccount.app.cityMissing")}
          </p>
        </div>
      </section>

      {restricted ? (
        <Alert aria-live="polite">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>{t("platformAccount.app.restrictedTitle")}</AlertTitle>
          <AlertDescription>
            {t("platformAccount.app.restrictedDescription")}
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="account-business-title">
        <h2 id="account-business-title" className="text-sm font-medium">
          {t("platformAccount.app.profileGroup")}
        </h2>
        <ul className="mt-3 divide-y border-y">
          {profileWorkspaceSections.map((section) => {
            const Icon = section.icon
            return (
              <li key={section.id}>
                <NavigationLink
                  to={`/account/me/${section.id}`}
                  className="flex min-h-16 min-w-0 items-center gap-3 py-3 outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Icon
                    className="size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {t(section.labelKey)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {t(section.descriptionKey)}
                    </span>
                  </span>
                  <ChevronRightIcon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </NavigationLink>
              </li>
            )
          })}
        </ul>
      </section>

      <AccountUtilities />

      <section aria-labelledby="account-session-title">
        <h2 id="account-session-title" className="text-sm font-medium">
          {t("platformAccount.app.sessionGroup")}
        </h2>
        {logoutFeedback === "error" ? (
          <Alert variant="destructive" className="mt-3" aria-live="assertive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>{t("platformAccount.app.logoutFailed")}</AlertTitle>
            <AlertDescription>
              {t("platformAccount.app.logoutFailedDescription")}
            </AlertDescription>
          </Alert>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="mt-3 w-full"
          disabled={logoutFeedback === "pending"}
          onClick={logout}
        >
          {logoutFeedback === "pending" ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <LogOutIcon data-icon="inline-start" aria-hidden="true" />
          )}
          {logoutFeedback === "pending"
            ? t("platformAccount.app.logoutPending")
            : logoutFeedback === "error"
              ? t("platformAccount.app.retryLogout")
              : t("platformAccount.logout")}
        </Button>
      </section>
    </PageShell>
  )
}
