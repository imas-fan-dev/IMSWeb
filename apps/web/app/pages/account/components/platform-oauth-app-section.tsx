import { LoaderCircleIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { PlatformOAuthProviderIcon } from "~/components/platform/platform-oauth-provider-icon"
import { platformOAuthButtonStyle } from "~/components/platform/platform-oauth-button-theme"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import type { PlatformOAuthProvider } from "~/lib/api"

import { usePlatformOAuthAppLogin } from "./use-platform-oauth-app-login"

interface PlatformOAuthAppSectionProps {
  providers: PlatformOAuthProvider[]
}

/**
 * App-target OAuth entry.
 *
 * Unlike the Web section, a provider button here does not navigate: it opens
 * the authorization page in the system browser and leaves a waiting state in
 * the WebView until the deep link comes back with a one-time code.
 */
export function PlatformOAuthAppSection({
  providers,
}: PlatformOAuthAppSectionProps) {
  const { t } = useTranslation()
  const { status, errorKey, activeProvider, start, cancel } =
    usePlatformOAuthAppLogin()

  if (status === "waiting") {
    const active = providers.find(
      (provider) => provider.code === activeProvider
    )
    return (
      <div className="space-y-3 pt-1">
        <Alert role="status" aria-live="polite">
          <LoaderCircleIcon
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <AlertTitle>{t("platformAuth.oauth.waiting")}</AlertTitle>
          {active ? (
            <AlertDescription>{active.displayName}</AlertDescription>
          ) : null}
        </Alert>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 w-full"
          onClick={cancel}
        >
          {t("platformAuth.oauth.cancel")}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3 pt-1">
      {errorKey ? (
        <Alert variant="destructive">
          <AlertTitle>{t(errorKey)}</AlertTitle>
        </Alert>
      ) : null}
      <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span>{t("platformAuth.oauth.continueWith")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {providers.map((provider) => (
          <Button
            key={provider.code}
            type="button"
            variant="outline"
            size="lg"
            className="h-11 min-w-0 justify-center hover:opacity-90"
            style={platformOAuthButtonStyle(provider.buttonColor)}
            onClick={() => void start(provider.code)}
          >
            <PlatformOAuthProviderIcon
              provider={provider.icon}
              className="size-4"
              data-icon="inline-start"
              aria-hidden="true"
            />
            <span className="truncate">{provider.displayName}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
