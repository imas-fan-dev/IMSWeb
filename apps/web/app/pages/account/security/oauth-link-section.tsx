import {
  CircleAlertIcon,
  CircleCheckIcon,
  LinkIcon,
  LoaderCircleIcon,
  Unlink2Icon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { Alert, AlertDescription } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import {
  getPlatformOAuthLinks,
  getPlatformOAuthProviders,
  platformOAuthLinkStartUrl,
  type PlatformOAuthLink,
  type PlatformOAuthProvider,
  unlinkPlatformOAuthLink,
} from "~/lib/api"

import {
  formatTimestamp,
  isLastLoginMethod,
  isOAuthLinkNotFound,
  isOAuthLinkSuccess,
  isRateLimited,
  oauthLinkReasonKey,
} from "./account-security-model"

export function OAuthLinkSection({
  readOnly,
  onLoginMethodsLoaded,
}: {
  readOnly: boolean
  /**
   * Reports the account's login-method inventory once the list loads. The
   * password form needs `passwordEnabled` and this endpoint already carries it,
   * so it is handed over rather than fetched twice.
   */
  onLoginMethodsLoaded?: (state: { passwordEnabled: boolean }) => void
}) {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  // The API hands the binding round trip back as `?oauth=<reason>`. The reason
  // is captured once at mount and the parameter is stripped, so a refresh does
  // not replay the banner but the first render still shows it.
  const [initialOauthReason] = useState(() => searchParams.get("oauth"))
  const oauthNotice = initialOauthReason
    ? (() => {
        const key = oauthLinkReasonKey(initialOauthReason)
        return key
          ? { key, success: isOAuthLinkSuccess(initialOauthReason) }
          : null
      })()
    : null
  const oauthMessage = oauthNotice
    ? t(oauthNotice.key, { provider: "" }).trim()
    : ""
  const [links, setLinks] = useState<PlatformOAuthLink[] | null>(null)
  const [providers, setProviders] = useState<PlatformOAuthProvider[] | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [pendingProvider, setPendingProvider] = useState<string | null>(null)
  const [feedback, setFeedback] = useState("")
  const [actionError, setActionError] = useState("")
  const [reloadToken, setReloadToken] = useState(0)

  // The reason is consumed once and stripped so a refresh does not replay it.
  const oauthReason = searchParams.get("oauth")
  useEffect(() => {
    if (!oauthReason) return
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params)
        next.delete("oauth")
        return next
      },
      { replace: true }
    )
  }, [oauthReason, setSearchParams])

  useEffect(() => {
    let active = true
    // The linked list answers "what can be unlinked"; the provider list answers
    // "what can still be linked". Neither contains the other, so both are read
    // and the section renders their difference.
    void Promise.all([
      getPlatformOAuthLinks().send(),
      getPlatformOAuthProviders().send(),
    ])
      .then(([linkResult, providerResult]) => {
        if (!active) return
        setLinks(linkResult.links)
        setProviders(providerResult.providers)
        // This response is the login-method inventory, not just a link list, so
        // it is also what tells the password form whether it has anything to
        // change. Reporting it up here keeps that to one request.
        onLoginMethodsLoaded?.({ passwordEnabled: linkResult.passwordEnabled })
        setLoadFailed(false)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setLoadFailed(true)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reloadToken, onLoginMethodsLoaded])

  async function unlink(link: PlatformOAuthLink) {
    setPendingProvider(link.provider)
    setActionError("")
    setFeedback("")
    try {
      await unlinkPlatformOAuthLink(link.provider).send()
      setFeedback(
        t("platformAccount.security.oauth.unlinked", {
          provider: link.providerName,
        })
      )
      // `removable` on the surviving rows depends on what is left, so the list
      // is re-read rather than patched locally.
      setLoading(true)
      setReloadToken((token) => token + 1)
    } catch (error) {
      if (isLastLoginMethod(error)) {
        setActionError(t("platformAccount.security.oauth.lastLoginMethod"))
      } else if (isOAuthLinkNotFound(error)) {
        setActionError(t("platformAccount.security.oauth.notFound"))
      } else if (isRateLimited(error)) {
        setActionError(t("platformAccount.security.password.rateLimited"))
      } else {
        setActionError(t("platformAccount.security.oauth.unlinkFailed"))
      }
    } finally {
      setPendingProvider(null)
    }
  }

  const entries = links ?? []
  const linkedProviders = new Set(entries.map((link) => link.provider))
  const unlinked = (providers ?? []).filter(
    (provider) => !linkedProviders.has(provider.code)
  )

  return (
    <section
      aria-labelledby="account-security-oauth-title"
      data-section="oauth-links"
    >
      <h2 id="account-security-oauth-title" className="text-lg font-semibold">
        {t("platformAccount.security.oauth.title")}
      </h2>
      <p className="mt-2 text-sm/6 text-muted-foreground">
        {t("platformAccount.security.oauth.description")}
      </p>

      {feedback || (oauthNotice?.success && oauthMessage) ? (
        <Alert className="mt-4" aria-live="polite">
          <CircleCheckIcon aria-hidden="true" />
          <AlertDescription>{feedback || oauthMessage}</AlertDescription>
        </Alert>
      ) : null}

      {actionError || (oauthNotice && !oauthNotice.success) ? (
        <Alert variant="destructive" className="mt-4" aria-live="assertive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{actionError || oauthMessage}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          <p className="sr-only" aria-live="polite">
            {t("platformAccount.security.oauth.loading")}
          </p>
          <Skeleton className="h-16 w-full" aria-hidden="true" />
        </div>
      ) : loadFailed ? (
        <Alert variant="destructive" className="mt-4">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>
            {t("platformAccount.security.oauth.loadFailed")}
          </AlertDescription>
        </Alert>
      ) : entries.length === 0 && unlinked.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {t("platformAccount.security.oauth.empty")}
        </p>
      ) : (
        <ul className="mt-4 divide-y border-y">
          {entries.map((link) => (
            <li
              key={link.provider}
              className="flex min-w-0 items-start gap-3 py-4"
              data-provider={link.provider}
              data-linked="true"
              data-removable={link.removable ? "true" : "false"}
            >
              <LinkIcon
                className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="min-w-0 truncate text-sm font-medium">
                    {link.providerName}
                  </p>
                  {link.enabled ? null : (
                    <Badge variant="secondary">
                      {t("platformAccount.security.oauth.disabledBadge")}
                    </Badge>
                  )}
                </div>
                {link.accountName ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {link.accountName}
                  </p>
                ) : null}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("platformAccount.security.oauth.linkedAtLabel")}{" "}
                  {formatTimestamp(link.linkedAt, i18n.language)}
                </p>
                {link.removable ? null : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("platformAccount.security.oauth.lastLoginMethodHint")}
                  </p>
                )}
              </div>
              {/*
                `removable` comes straight from the server. Recomputing it here
                is not possible: the guard also weighs whether the *other*
                providers are still enabled, which this list cannot establish
                for a provider it is about to drop.
              */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={
                  readOnly || !link.removable || pendingProvider !== null
                }
                aria-label={t("platformAccount.security.oauth.unlinkLabel", {
                  provider: link.providerName,
                })}
                onClick={() => void unlink(link)}
              >
                {pendingProvider === link.provider ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Unlink2Icon data-icon="inline-start" aria-hidden="true" />
                )}
                {t(
                  pendingProvider === link.provider
                    ? "platformAccount.security.oauth.unlinking"
                    : "platformAccount.security.oauth.unlink"
                )}
              </Button>
            </li>
          ))}
          {unlinked.map((provider) => (
            <li
              key={provider.code}
              className="flex min-w-0 items-start gap-3 py-4"
              data-provider={provider.code}
              data-linked="false"
            >
              <LinkIcon
                className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="min-w-0 truncate text-sm font-medium">
                  {provider.displayName}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("platformAccount.security.oauth.availableHint")}
                </p>
              </div>
              {/*
                A plain document navigation, exactly like the provider buttons
                on the login page: the API answers /start with a 303 to the
                provider. No JSON schema exists for a redirect success.
              */}
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                nativeButton={false}
                disabled={readOnly}
                aria-label={t("platformAccount.security.oauth.linkLabel", {
                  provider: provider.displayName,
                })}
                render={
                  <NavigationLink
                    href={platformOAuthLinkStartUrl(provider.code)}
                  />
                }
              >
                {t("platformAccount.security.oauth.link")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
