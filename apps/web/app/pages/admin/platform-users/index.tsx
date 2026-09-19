import {
  ArrowLeftIcon,
  ArrowRightIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from "lucide-react"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { useOutletContext, useSearchParams } from "react-router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  adminControlClass,
} from "~/components/admin/admin-ui"
import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Skeleton } from "~/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { adminErrorMessage } from "~/lib/admin-error"
import {
  getAdminPlatformUsers,
  isApiError,
  revokeAdminPlatformUserSessions,
  triggerAdminPlatformUserPasswordReset,
  unlinkAdminPlatformUserOAuth,
  updateAdminPlatformUserStatus,
  type AdminPlatformUser,
  type AdminPlatformUserList,
  type AdminPlatformUserSearchField,
} from "~/lib/api"
import { useConfirmAction } from "~/pages/admin/hooks/use-confirm-action"
import { UserDetailDialog } from "~/pages/admin/platform-users/user-detail-dialog"

interface AdminOutletContext {
  adminSession: { adminRole: string | null }
}

const EMPTY_PAGE_INFO: AdminPlatformUserList["pageInfo"] = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
}

const SEARCH_FIELDS: AdminPlatformUserSearchField[] = [
  "display_name",
  "email",
  "id",
]

function formatTime(value: number | null, never: string) {
  return value === null ? never : new Date(value).toLocaleString()
}

export function meta() {
  return [{ title: "平台用户 | IMSWeb" }]
}

export default function AdminPlatformUsersPage() {
  const { t } = useTranslation()
  const { adminSession } = useOutletContext<AdminOutletContext>()
  const canManage = adminSession.adminRole === "super_admin"

  const [searchParams, setSearchParams] = useSearchParams()
  const queryParam = searchParams.get("query") ?? ""
  const fieldParam = (
    SEARCH_FIELDS.includes(
      searchParams.get("field") as AdminPlatformUserSearchField
    )
      ? searchParams.get("field")
      : "display_name"
  ) as AdminPlatformUserSearchField
  const requestedPage = Number(searchParams.get("page") ?? "1")
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1

  const [draftQuery, setDraftQuery] = useState(queryParam)
  const [draftField, setDraftField] =
    useState<AdminPlatformUserSearchField>(fieldParam)
  const [users, setUsers] = useState<AdminPlatformUser[]>([])
  const [pageInfo, setPageInfo] =
    useState<AdminPlatformUserList["pageInfo"]>(EMPTY_PAGE_INFO)
  const [loading, setLoading] = useState(canManage)
  const [error, setError] = useState(false)
  const [detailUserId, setDetailUserId] = useState<string | null>(null)
  const [detailReloadKey, setDetailReloadKey] = useState(0)
  const [unlinkTarget, setUnlinkTarget] = useState<{
    userId: string
    displayName: string
    provider: string
    providerName: string
  } | null>(null)
  const [unlinking, setUnlinking] = useState(false)

  const applyResult = useCallback((result: AdminPlatformUserList) => {
    setUsers(result.users)
    setPageInfo(result.pageInfo)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      applyResult(
        await getAdminPlatformUsers({
          query: queryParam || undefined,
          field: fieldParam,
          page,
        }).send()
      )
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [applyResult, fieldParam, page, queryParam])

  useEffect(() => {
    if (!canManage) return
    let active = true
    getAdminPlatformUsers({
      query: queryParam || undefined,
      field: fieldParam,
      page,
    })
      .send()
      .then((result) => {
        if (active) applyResult(result)
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
  }, [applyResult, canManage, fieldParam, page, queryParam])

  const suspendConfirm = useConfirmAction<AdminPlatformUser>({
    onConfirm: async (user) => {
      try {
        await updateAdminPlatformUserStatus(user.id, {
          status: "suspended",
          expectedUpdatedAt: user.updatedAt,
        }).send()
        await refresh()
      } catch (actionError) {
        if (isApiError(actionError) && actionError.status === 409)
          await refresh()
        throw actionError
      }
    },
    getTitle: () => t("adminPlatformUsers.confirm.suspendTitle"),
    getDescription: (user) =>
      t("adminPlatformUsers.confirm.suspendDescription", {
        name: user.displayName,
      }),
    successMessage: (user) =>
      t("adminPlatformUsers.messages.suspended", { name: user.displayName }),
  })

  const activateConfirm = useConfirmAction<AdminPlatformUser>({
    onConfirm: async (user) => {
      try {
        await updateAdminPlatformUserStatus(user.id, {
          status: "active",
          expectedUpdatedAt: user.updatedAt,
        }).send()
        await refresh()
      } catch (actionError) {
        if (isApiError(actionError) && actionError.status === 409)
          await refresh()
        throw actionError
      }
    },
    getTitle: () => t("adminPlatformUsers.confirm.activateTitle"),
    getDescription: (user) =>
      t("adminPlatformUsers.confirm.activateDescription", {
        name: user.displayName,
      }),
    successMessage: (user) =>
      t("adminPlatformUsers.messages.activated", { name: user.displayName }),
  })

  const logoutConfirm = useConfirmAction<AdminPlatformUser>({
    onConfirm: async (user) => {
      await revokeAdminPlatformUserSessions(user.id).send()
      await refresh()
    },
    getTitle: () => t("adminPlatformUsers.confirm.forceLogoutTitle"),
    getDescription: (user) =>
      t("adminPlatformUsers.confirm.forceLogoutDescription", {
        name: user.displayName,
      }),
    successMessage: (user) =>
      t("adminPlatformUsers.messages.sessionsRevoked", {
        name: user.displayName,
      }),
  })

  const resetConfirm = useConfirmAction<AdminPlatformUser>({
    onConfirm: async (user) => {
      await triggerAdminPlatformUserPasswordReset(user.id).send()
    },
    getTitle: () => t("adminPlatformUsers.confirm.resetTitle"),
    getDescription: (user) =>
      t("adminPlatformUsers.confirm.resetDescription", {
        name: user.displayName,
      }),
    successMessage: () => t("adminPlatformUsers.messages.resetQueued"),
  })

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = new URLSearchParams()
    const trimmed = draftQuery.trim()
    if (trimmed) next.set("query", trimmed)
    if (draftField !== "display_name") next.set("field", draftField)
    setLoading(true)
    setError(false)
    setSearchParams(next)
  }

  function clearSearch() {
    setDraftQuery("")
    setDraftField("display_name")
    setLoading(true)
    setError(false)
    setSearchParams(new URLSearchParams())
  }

  function changePage(nextPage: number) {
    const next = new URLSearchParams(searchParams)
    if (nextPage <= 1) next.delete("page")
    else next.set("page", String(nextPage))
    setLoading(true)
    setError(false)
    setSearchParams(next)
  }

  async function confirmUnlink() {
    if (!unlinkTarget || unlinking) return
    setUnlinking(true)
    try {
      await unlinkAdminPlatformUserOAuth(
        unlinkTarget.userId,
        unlinkTarget.provider
      ).send()
      toast.success(
        t("adminPlatformUsers.messages.unlinked", {
          provider: unlinkTarget.providerName,
        })
      )
      setUnlinkTarget(null)
      setDetailReloadKey((current) => current + 1)
      await refresh()
    } catch (unlinkError) {
      if (
        isApiError(unlinkError) &&
        unlinkError.code === "PLATFORM_OAUTH_LAST_LOGIN_METHOD"
      ) {
        toast.error(t("adminPlatformUsers.messages.lastLoginMethod"))
      } else if (isApiError(unlinkError) && unlinkError.status === 409) {
        toast.error(t("adminPlatformUsers.messages.unlinkFailed"))
      } else {
        toast.error(adminErrorMessage(unlinkError))
      }
    } finally {
      setUnlinking(false)
    }
  }

  const busy =
    unlinking ||
    suspendConfirm.submitting ||
    activateConfirm.submitting ||
    logoutConfirm.submitting ||
    resetConfirm.submitting

  if (!canManage) {
    return (
      <div className="flex flex-col gap-8">
        <AdminPageHeader
          eyebrow={t("adminPlatformUsers.eyebrow")}
          title={t("adminPlatformUsers.title")}
          description={t("adminPlatformUsers.description")}
        />
        <Alert variant="destructive">
          <ShieldCheckIcon aria-hidden="true" />
          <AlertTitle>{t("adminPlatformUsers.restrictedTitle")}</AlertTitle>
          <AlertDescription>
            {t("adminPlatformUsers.restrictedDescription")}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-7">
      <AdminPageHeader
        eyebrow={t("adminPlatformUsers.eyebrow")}
        title={t("adminPlatformUsers.title")}
        description={t("adminPlatformUsers.description")}
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={loading || busy}
            onClick={() => void refresh()}
          >
            <RefreshCwIcon data-icon="inline-start" />
            {t("adminPlatformUsers.refresh")}
          </Button>
        }
      />

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={submitSearch}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">
            {t("adminPlatformUsers.search.label")}
          </span>
          <Input
            value={draftQuery}
            placeholder={t("adminPlatformUsers.search.placeholder")}
            className={adminControlClass}
            disabled={busy}
            onChange={(event) => setDraftQuery(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 sm:w-44">
          <span className="text-sm font-medium">
            {t("adminPlatformUsers.search.field")}
          </span>
          <Select
            items={SEARCH_FIELDS.map((value) => ({
              value,
              label: t(
                `adminPlatformUsers.search.field${
                  value === "display_name"
                    ? "DisplayName"
                    : value === "email"
                      ? "Email"
                      : "Id"
                }`
              ),
            }))}
            value={draftField}
            disabled={busy}
            onValueChange={(value) =>
              setDraftField(value as AdminPlatformUserSearchField)
            }
          >
            <SelectTrigger className={`${adminControlClass} w-full`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="display_name">
                  {t("adminPlatformUsers.search.fieldDisplayName")}
                </SelectItem>
                <SelectItem value="email">
                  {t("adminPlatformUsers.search.fieldEmail")}
                </SelectItem>
                <SelectItem value="id">
                  {t("adminPlatformUsers.search.fieldId")}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={busy}>
            {t("adminPlatformUsers.search.submit")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={clearSearch}
          >
            {t("adminPlatformUsers.search.clear")}
          </Button>
        </div>
      </form>

      <AdminPanel
        title={t("adminPlatformUsers.title")}
        description={t("adminPlatformUsers.pagination.total", {
          total: pageInfo.total,
        })}
        icon={UserRoundIcon}
      >
        {loading ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>{t("adminPlatformUsers.table.loadFailed")}</AlertTitle>
            <AlertDescription>
              {t("adminPlatformUsers.table.loadFailedDescription")}
            </AlertDescription>
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refresh()}
              >
                {t("adminPlatformUsers.table.retry")}
              </Button>
            </div>
          </Alert>
        ) : users.length === 0 ? (
          <AdminEmptyState
            icon={UserRoundIcon}
            title={t("adminPlatformUsers.table.empty")}
            description={t("adminPlatformUsers.table.emptyDescription")}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t("adminPlatformUsers.table.displayName")}
                  </TableHead>
                  <TableHead>{t("adminPlatformUsers.table.email")}</TableHead>
                  <TableHead>{t("adminPlatformUsers.table.status")}</TableHead>
                  <TableHead>
                    {t("adminPlatformUsers.table.activeSessions")}
                  </TableHead>
                  <TableHead>
                    {t("adminPlatformUsers.table.lastLogin")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("adminPlatformUsers.table.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="min-w-40 whitespace-normal">
                      <p className="font-medium">{user.displayName}</p>
                      <p className="text-xs text-muted-foreground">{user.id}</p>
                    </TableCell>
                    <TableCell className="min-w-40 whitespace-normal">
                      {user.email ?? t("adminPlatformUsers.detail.noEmail")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.status === "suspended"
                            ? "destructive"
                            : user.status === "active"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {t(
                          `adminPlatformUsers.statusLabel.${user.status}` as const
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>{user.activeSessionCount}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      {formatTime(
                        user.lastLoginAt,
                        t("adminPlatformUsers.detail.never")
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setDetailUserId(user.id)}
                        >
                          {t("adminPlatformUsers.actions.detail")}
                        </Button>
                        {user.status === "suspended" ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={(event) =>
                              activateConfirm.requestAction(
                                user,
                                event.currentTarget
                              )
                            }
                          >
                            {t("adminPlatformUsers.actions.activate")}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={busy}
                            onClick={(event) =>
                              suspendConfirm.requestAction(
                                user,
                                event.currentTarget
                              )
                            }
                          >
                            {t("adminPlatformUsers.actions.suspend")}
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={(event) =>
                            logoutConfirm.requestAction(
                              user,
                              event.currentTarget
                            )
                          }
                        >
                          {t("adminPlatformUsers.actions.forceLogout")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            busy ||
                            !user.hasPassword ||
                            user.status === "suspended"
                          }
                          title={
                            user.hasPassword
                              ? undefined
                              : t(
                                  "adminPlatformUsers.messages.resetUnavailable"
                                )
                          }
                          onClick={(event) =>
                            resetConfirm.requestAction(
                              user,
                              event.currentTarget
                            )
                          }
                        >
                          {t("adminPlatformUsers.actions.resetPassword")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </AdminPanel>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1 || loading}
          onClick={() => changePage(page - 1)}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {t("adminPlatformUsers.pagination.previous")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {pageInfo.totalPages
            ? t("adminPlatformUsers.pagination.pageOf", {
                page,
                totalPages: pageInfo.totalPages,
              })
            : t("adminPlatformUsers.pagination.noRecords")}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={!pageInfo.hasNextPage || loading}
          onClick={() => changePage(page + 1)}
        >
          {t("adminPlatformUsers.pagination.next")}
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </div>

      <UserDetailDialog
        userId={detailUserId}
        reloadKey={detailReloadKey}
        onOpenChange={(open) => {
          if (!open) setDetailUserId(null)
        }}
        onRequestUnlink={(userId, provider, providerName) => {
          setUnlinkTarget({
            userId,
            displayName:
              users.find((user) => user.id === userId)?.displayName ?? userId,
            provider,
            providerName,
          })
        }}
      />

      <ConfirmActionDialog
        open={suspendConfirm.open}
        onOpenChange={suspendConfirm.onOpenChange}
        title={suspendConfirm.title}
        description={suspendConfirm.description}
        submitting={suspendConfirm.submitting}
        onConfirm={() => void suspendConfirm.confirmAction()}
        confirmLabel={t("adminPlatformUsers.confirm.suspendLabel")}
        cancelLabel={t("adminPlatformUsers.confirm.cancel")}
        icon={ShieldCheckIcon}
      />

      <ConfirmActionDialog
        open={activateConfirm.open}
        onOpenChange={activateConfirm.onOpenChange}
        title={activateConfirm.title}
        description={activateConfirm.description}
        submitting={activateConfirm.submitting}
        onConfirm={() => void activateConfirm.confirmAction()}
        confirmLabel={t("adminPlatformUsers.confirm.activateLabel")}
        cancelLabel={t("adminPlatformUsers.confirm.cancel")}
        variant="default"
        icon={UserRoundIcon}
      />

      <ConfirmActionDialog
        open={logoutConfirm.open}
        onOpenChange={logoutConfirm.onOpenChange}
        title={logoutConfirm.title}
        description={logoutConfirm.description}
        submitting={logoutConfirm.submitting}
        onConfirm={() => void logoutConfirm.confirmAction()}
        confirmLabel={t("adminPlatformUsers.confirm.forceLogoutLabel")}
        cancelLabel={t("adminPlatformUsers.confirm.cancel")}
        icon={KeyRoundIcon}
      />

      <ConfirmActionDialog
        open={resetConfirm.open}
        onOpenChange={resetConfirm.onOpenChange}
        title={resetConfirm.title}
        description={resetConfirm.description}
        submitting={resetConfirm.submitting}
        onConfirm={() => void resetConfirm.confirmAction()}
        confirmLabel={t("adminPlatformUsers.confirm.resetLabel")}
        cancelLabel={t("adminPlatformUsers.confirm.cancel")}
        variant="default"
        icon={KeyRoundIcon}
      />

      <ConfirmActionDialog
        open={unlinkTarget !== null}
        onOpenChange={(open) => {
          if (!open && !unlinking) setUnlinkTarget(null)
        }}
        title={t("adminPlatformUsers.confirm.unlinkTitle")}
        description={
          unlinkTarget
            ? t("adminPlatformUsers.confirm.unlinkDescription", {
                name: unlinkTarget.displayName,
                provider: unlinkTarget.providerName,
              })
            : null
        }
        submitting={unlinking}
        onConfirm={() => void confirmUnlink()}
        confirmLabel={t("adminPlatformUsers.confirm.unlinkLabel")}
        cancelLabel={t("adminPlatformUsers.confirm.cancel")}
        icon={LoaderCircleIcon}
      />
    </div>
  )
}
