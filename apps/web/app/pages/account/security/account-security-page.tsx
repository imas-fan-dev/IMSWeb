import { CircleAlertIcon, LogInIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { usePlatformSession } from "~/components/platform/platform-session-provider"
import { PageShell } from "~/components/shared/page-shell"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import { Skeleton } from "~/components/ui/skeleton"

import { OAuthLinkSection } from "./oauth-link-section"
import { PasswordSection } from "./password-section"
import { SessionDeviceSection } from "./session-device-section"

export function meta() {
  return [{ title: "帐号安全 | IMSWeb" }]
}

export default function AccountSecurityPage() {
  const { t } = useTranslation()
  const platform = usePlatformSession()
  // Incremented after a password change. The API bumps `token_version` in the
  // same transaction, so every other device is already signed out by the time
  // the response lands and the rendered list must be re-read, not trusted.
  const [sessionRefreshToken, setSessionRefreshToken] = useState(0)
  // null until the login-method list answers. The password form keeps its own
  // 409 fallback for that window and for accounts whose list failed to load.
  const [passwordEnabled, setPasswordEnabled] = useState<boolean | null>(null)
  const handleLoginMethodsLoaded = useCallback(
    (state: { passwordEnabled: boolean }) => {
      setPasswordEnabled(state.passwordEnabled)
    },
    []
  )

  if (platform.status === "loading") {
    return (
      <PageShell
        width="read"
        data-account-state="loading"
        aria-label={t("platformAccount.security.loadingLabel")}
        aria-busy="true"
      >
        <p className="sr-only" aria-live="polite">
          {t("platformAccount.security.loadingLabel")}
        </p>
        <div className="space-y-6" aria-hidden="true">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </PageShell>
    )
  }

  if (platform.status === "error") {
    return (
      <PageShell width="read" data-account-state="error">
        <h1 className="sr-only">{t("platformAccount.security.title")}</h1>
        <Alert variant="destructive" className="mt-5">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>{t("platformAccount.security.error")}</AlertTitle>
          <AlertDescription>
            {t("platformAccount.app.sessionUnavailableDescription")}
          </AlertDescription>
        </Alert>
        <Button
          type="button"
          className="mt-4"
          onClick={() => void platform.reload()}
        >
          {t("platformAccount.security.retry")}
        </Button>
      </PageShell>
    )
  }

  const signedIn =
    (platform.status === "authenticated" || platform.status === "restricted") &&
    platform.session

  // This is a public route on both build targets, so an anonymous visitor is
  // ordinary rather than exceptional. Same treatment as the account page: say
  // what is needed and offer the way in, instead of rendering an empty shell.
  if (!signedIn) {
    return (
      <PageShell
        width="read"
        className="space-y-6"
        data-account-state="anonymous"
      >
        <header>
          <h1 className="text-xl font-semibold">
            {t("platformAccount.security.title")}
          </h1>
          <p className="mt-2 text-sm/6 text-muted-foreground">
            {t("platformAccount.security.anonymousDescription")}
          </p>
        </header>
        <Alert>
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>
            {t("platformAccount.security.anonymousTitle")}
          </AlertTitle>
          <AlertDescription>
            {t("platformAccount.security.anonymousDescription")}
          </AlertDescription>
        </Alert>
        <div className="grid gap-3">
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
        </div>
      </PageShell>
    )
  }

  // A restricted account may still read its devices and links, but every write
  // in this domain goes through `activePlatformMutation` and would be refused.
  const readOnly = platform.status === "restricted"

  return (
    <PageShell
      width="read"
      className="space-y-8"
      data-account-state={readOnly ? "restricted" : "authenticated"}
    >
      <header>
        <h1 className="text-xl font-semibold">
          {t("platformAccount.security.title")}
        </h1>
        <p className="mt-2 text-sm/6 text-muted-foreground">
          {t("platformAccount.security.description")}
        </p>
      </header>

      {readOnly ? (
        <Alert>
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>{t("platformAccount.app.restrictedTitle")}</AlertTitle>
          <AlertDescription>
            {t("platformAccount.app.restrictedDescription")}
          </AlertDescription>
        </Alert>
      ) : null}

      <PasswordSection
        readOnly={readOnly}
        passwordEnabled={passwordEnabled}
        onPasswordChanged={() => setSessionRefreshToken((token) => token + 1)}
      />

      <Separator />

      <SessionDeviceSection
        readOnly={readOnly}
        refreshToken={sessionRefreshToken}
      />

      <Separator />

      <OAuthLinkSection
        readOnly={readOnly}
        onLoginMethodsLoaded={handleLoginMethodsLoaded}
      />
    </PageShell>
  )
}
