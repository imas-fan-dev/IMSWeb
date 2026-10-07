import { KeyRoundIcon, ShieldCheckIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Skeleton } from "~/components/ui/skeleton"
import {
  getAdminPlatformUser,
  type AdminPlatformUserDetail,
} from "~/lib/api"

export interface UserDetailDialogProps {
  userId: string | null
  /** Bumped by the page after an unlink so the links list is re-read. */
  reloadKey: number
  onOpenChange: (open: boolean) => void
  onRequestUnlink: (
    userId: string,
    provider: string,
    providerName: string
  ) => void
}

function formatTime(value: number | null) {
  if (value === null) return null
  return new Date(value).toLocaleString()
}

export function UserDetailDialog({
  userId,
  reloadKey,
  onOpenChange,
  onRequestUnlink,
}: UserDetailDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={userId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("adminPlatformUsers.detail.title")}</DialogTitle>
          <DialogDescription>{userId}</DialogDescription>
        </DialogHeader>
        {userId ? (
          // Remounting on id/reload resets the loading flag, so the effect
          // itself never has to set state synchronously.
          <UserDetailDialogBody
            key={`${userId}:${reloadKey}`}
            userId={userId}
            onRequestUnlink={onRequestUnlink}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function UserDetailDialogBody({
  userId,
  onRequestUnlink,
}: {
  userId: string
  onRequestUnlink: UserDetailDialogProps["onRequestUnlink"]
}) {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<AdminPlatformUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    getAdminPlatformUser(userId)
      .send()
      .then((response) => {
        if (active) setDetail(response.user)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [userId])

  return (
    <>
      {loading ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("adminPlatformUsers.detail.loadFailed")}</AlertTitle>
          <AlertDescription>
            {t("adminPlatformUsers.messages.loadFailed")}
          </AlertDescription>
        </Alert>
      ) : detail ? (
        <div className="flex flex-col gap-5">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <DetailField
              label={t("adminPlatformUsers.table.email")}
              value={detail.email ?? t("adminPlatformUsers.detail.noEmail")}
            />
            <DetailField
              label={t("adminPlatformUsers.detail.password")}
              value={
                detail.hasPassword
                  ? t("adminPlatformUsers.detail.hasPassword")
                  : t("adminPlatformUsers.detail.noPassword")
              }
            />
            <DetailField
              label={t("adminPlatformUsers.detail.activeSessions")}
              value={String(detail.activeSessionCount)}
            />
            <DetailField
              label={t("adminPlatformUsers.detail.lastLogin")}
              value={
                formatTime(detail.lastLoginAt) ??
                t("adminPlatformUsers.detail.never")
              }
            />
            <DetailField
              label={t("adminPlatformUsers.detail.createdAt")}
              value={formatTime(detail.createdAt) ?? "—"}
            />
            <DetailField
              label={t("adminPlatformUsers.detail.updatedAt")}
              value={formatTime(detail.updatedAt) ?? "—"}
            />
          </dl>

          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <KeyRoundIcon
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <h3 className="text-sm font-medium">
                {t("adminPlatformUsers.detail.oauthTitle")}
              </h3>
            </div>
            {detail.oauthLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("adminPlatformUsers.detail.oauthEmpty")}
              </p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {detail.oauthLinks.map((link) => {
                  const linkedAt = formatTime(link.linkedAt)
                  return (
                    <li
                      key={link.provider}
                      className="flex items-center gap-3 p-3"
                    >
                      <div className="mr-auto min-w-0">
                        <p className="truncate text-sm font-medium">
                          {link.providerName || link.provider}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {linkedAt
                            ? t("adminPlatformUsers.detail.oauthLinkedAt", {
                                time: linkedAt,
                              })
                            : link.provider}
                        </p>
                        {!link.removable ? (
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <ShieldCheckIcon
                              className="size-3"
                              aria-hidden="true"
                            />
                            {t("adminPlatformUsers.detail.oauthNotRemovable")}
                          </p>
                        ) : null}
                      </div>
                      <Badge variant="secondary">{link.provider}</Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!link.removable}
                        title={
                          link.removable
                            ? undefined
                            : t("adminPlatformUsers.detail.oauthNotRemovable")
                        }
                        onClick={() =>
                          onRequestUnlink(
                            userId,
                            link.provider,
                            link.providerName || link.provider
                          )
                        }
                      >
                        {t("adminPlatformUsers.detail.unlink")}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          {t("adminPlatformUsers.detail.close")}
        </DialogClose>
      </DialogFooter>
    </>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="wrap-break-word">{value}</dd>
    </div>
  )
}
