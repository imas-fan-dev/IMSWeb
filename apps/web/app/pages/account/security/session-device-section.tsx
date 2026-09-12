import {
  CircleAlertIcon,
  CircleCheckIcon,
  LaptopIcon,
  LoaderCircleIcon,
  LogOutIcon,
  RefreshCwIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import {
  getPlatformSessionDevices,
  revokeOtherPlatformSessions,
  revokePlatformSessionDevice,
  type PlatformSessionDevice,
} from "~/lib/api"

import {
  formatTimestamp,
  isRateLimited,
  isSessionNotFound,
} from "./account-security-model"

export function SessionDeviceSection({
  readOnly,
  /**
   * Bumped by the page whenever something outside this section invalidated the
   * list — most importantly a password change, which signs out every other
   * device server-side and would otherwise leave dead rows on screen.
   */
  refreshToken,
}: {
  readOnly: boolean
  refreshToken: number
}) {
  const { t, i18n } = useTranslation()
  const [devices, setDevices] = useState<PlatformSessionDevice[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [revokingOthers, setRevokingOthers] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [actionError, setActionError] = useState("")
  // Bumped by the manual refresh button. Keeping the fetch in an effect keyed
  // on both tokens means one code path serves mount, an outside invalidation,
  // and an explicit reload, and each supersedes the previous request.
  const [reloadToken, setReloadToken] = useState(0)

  // State is only set from the promise callbacks: a synchronous setState in an
  // effect body cascades an extra render, which is what `loading` already
  // covers by defaulting to true.
  useEffect(() => {
    let active = true
    void getPlatformSessionDevices()
      .send()
      .then((result) => {
        if (!active) return
        setDevices(result.sessions)
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
  }, [refreshToken, reloadToken])

  function reload() {
    setLoading(true)
    setFeedback("")
    setActionError("")
    setReloadToken((token) => token + 1)
  }

  async function revokeDevice(device: PlatformSessionDevice) {
    setPendingId(device.id)
    setActionError("")
    setFeedback("")
    try {
      await revokePlatformSessionDevice(device.id).send()
      setDevices((current) =>
        (current ?? []).filter((entry) => entry.id !== device.id)
      )
      setFeedback(t("platformAccount.security.sessions.revoked"))
    } catch (error) {
      if (isSessionNotFound(error)) {
        // Already gone — drop the row instead of insisting it is still there.
        setDevices((current) =>
          (current ?? []).filter((entry) => entry.id !== device.id)
        )
        setActionError(t("platformAccount.security.sessions.notFound"))
      } else if (isRateLimited(error)) {
        setActionError(t("platformAccount.security.password.rateLimited"))
      } else {
        setActionError(t("platformAccount.security.sessions.revokeFailed"))
      }
    } finally {
      setPendingId(null)
    }
  }

  async function revokeOthers() {
    setRevokingOthers(true)
    setActionError("")
    setFeedback("")
    try {
      const result = await revokeOtherPlatformSessions().send()
      setDevices((current) => (current ?? []).filter((entry) => entry.current))
      setFeedback(
        result.revokedSessionCount > 0
          ? t("platformAccount.security.sessions.revokedOthers", {
              count: result.revokedSessionCount,
            })
          : t("platformAccount.security.sessions.revokedOthersNone")
      )
    } catch (error) {
      setActionError(
        isRateLimited(error)
          ? t("platformAccount.security.password.rateLimited")
          : t("platformAccount.security.sessions.revokeFailed")
      )
    } finally {
      setRevokingOthers(false)
    }
  }

  const entries = devices ?? []
  const hasOtherDevices = entries.some((device) => !device.current)
  const busy = revokingOthers || pendingId !== null

  return (
    <section
      aria-labelledby="account-security-sessions-title"
      data-section="sessions"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="account-security-sessions-title"
            className="text-lg font-semibold"
          >
            {t("platformAccount.security.sessions.title")}
          </h2>
          <p className="mt-2 text-sm/6 text-muted-foreground">
            {t("platformAccount.security.sessions.description")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || busy}
          onClick={reload}
        >
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          {t("platformAccount.security.sessions.reload")}
        </Button>
      </div>

      {feedback ? (
        <Alert className="mt-4" aria-live="polite">
          <CircleCheckIcon aria-hidden="true" />
          <AlertDescription>{feedback}</AlertDescription>
        </Alert>
      ) : null}

      {actionError ? (
        <Alert variant="destructive" className="mt-4" aria-live="assertive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          <p className="sr-only" aria-live="polite">
            {t("platformAccount.security.sessions.loading")}
          </p>
          <Skeleton className="h-20 w-full" aria-hidden="true" />
          <Skeleton className="h-20 w-full" aria-hidden="true" />
        </div>
      ) : loadFailed ? (
        <Alert variant="destructive" className="mt-4">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>
            {t("platformAccount.security.sessions.loadFailed")}
          </AlertDescription>
        </Alert>
      ) : entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {t("platformAccount.security.sessions.empty")}
        </p>
      ) : (
        <ul className="mt-4 divide-y border-y">
          {entries.map((device) => {
            const deviceLabel =
              device.userAgent ||
              t("platformAccount.security.sessions.unknownDevice")
            return (
              <li
                key={device.id}
                className="flex min-w-0 items-start gap-3 py-4"
                data-session-id={device.id}
                data-session-current={device.current ? "true" : "false"}
              >
                <LaptopIcon
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="min-w-0 text-sm font-medium break-all">
                      {deviceLabel}
                    </p>
                    {device.current ? (
                      <Badge variant="secondary">
                        {t("platformAccount.security.sessions.currentBadge")}
                      </Badge>
                    ) : null}
                  </div>
                  <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
                    <div className="flex min-w-0 gap-1">
                      <dt>
                        {t("platformAccount.security.sessions.addressLabel")}
                      </dt>
                      <dd className="min-w-0 break-all">
                        {device.ipAddress ||
                          t("platformAccount.security.sessions.unknownAddress")}
                      </dd>
                    </div>
                    <div className="flex min-w-0 gap-1">
                      <dt>
                        {t("platformAccount.security.sessions.createdAtLabel")}
                      </dt>
                      <dd className="min-w-0">
                        {formatTimestamp(device.createdAt, i18n.language)}
                      </dd>
                    </div>
                    <div className="flex min-w-0 gap-1">
                      <dt>
                        {t("platformAccount.security.sessions.lastSeenAtLabel")}
                      </dt>
                      <dd className="min-w-0">
                        {device.lastSeenAt === null
                          ? t("platformAccount.security.sessions.neverSeen")
                          : formatTimestamp(device.lastSeenAt, i18n.language)}
                      </dd>
                    </div>
                  </dl>
                </div>
                {/*
                  The current device deliberately has no revoke control: using
                  it would sign the user out of the page they are securing.
                */}
                {device.current ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={readOnly || busy}
                    aria-label={t(
                      "platformAccount.security.sessions.revokeLabel",
                      { device: deviceLabel }
                    )}
                    onClick={() => void revokeDevice(device)}
                  >
                    {pendingId === device.id ? (
                      <LoaderCircleIcon
                        data-icon="inline-start"
                        className="animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    ) : null}
                    {t(
                      pendingId === device.id
                        ? "platformAccount.security.sessions.revoking"
                        : "platformAccount.security.sessions.revoke"
                    )}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {hasOtherDevices ? (
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={readOnly || busy}
          onClick={() => void revokeOthers()}
        >
          {revokingOthers ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <LogOutIcon data-icon="inline-start" aria-hidden="true" />
          )}
          {t(
            revokingOthers
              ? "platformAccount.security.sessions.revokingOthers"
              : "platformAccount.security.sessions.revokeOthers"
          )}
        </Button>
      ) : null}
    </section>
  )
}
