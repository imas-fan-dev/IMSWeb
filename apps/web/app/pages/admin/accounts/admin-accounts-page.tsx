import { useRequest } from "alova/client"
import {
  AlertCircleIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UsersRoundIcon,
} from "lucide-react"
import { useState } from "react"
import { useOutletContext } from "react-router"
import { toast } from "sonner"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "~/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Skeleton } from "~/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
} from "~/pages/admin/components/admin-ui"
import {
  createAdminAccount,
  deleteAdminAccount,
  getAdminAccounts,
  isApiError,
  type AdminAccount,
  type AdminSession,
} from "~/shared/api"

type AdminOutletContext = {
  adminSession: AdminSession
}

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

function AdminAccountsManager({ session }: { session: AdminSession }) {
  const {
    data,
    loading,
    error,
    send: refresh,
    onError,
  } = useRequest(getAdminAccounts(), {
    initialData: { success: true as const, accounts: [] },
  })
  onError(() => undefined)

  const [createOpen, setCreateOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [producername, setProducername] = useState("")
  const [password, setPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminAccount | null>(null)
  const [deleting, setDeleting] = useState(false)

  function resetCreateForm() {
    setUsername("")
    setProducername("")
    setPassword("")
  }

  function changeCreateOpen(open: boolean) {
    if (!open && saving) return
    setCreateOpen(open)
    if (!open) resetCreateForm()
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await createAdminAccount({ username, producername, password }).send()
      await refresh()
      toast.success("管理员账号已创建")
      setCreateOpen(false)
      resetCreateForm()
    } catch (saveError) {
      toast.error(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteAdminAccount(deleteTarget.id).send()
      await refresh()
      toast.success("管理员账号已删除")
      setDeleteTarget(null)
    } catch (deleteError) {
      toast.error(errorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="ACCESS CONTROL"
        title="管理员账号"
        description="维护管理工作台的登录账号与管理员身份。"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCwIcon
                data-icon="inline-start"
                className={loading ? "animate-spin" : undefined}
              />
              刷新
            </Button>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              新增管理员
            </Button>
          </>
        }
      />

      <AdminPanel
        title="账号列表"
        description={`${data.accounts.length} 个运营管理员账号`}
        icon={UsersRoundIcon}
        contentClassName="pt-1"
      >
        {error ? (
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>管理员账号加载失败</AlertTitle>
            <AlertDescription>{errorMessage(error)}</AlertDescription>
            <AlertAction>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refresh()}
              >
                重试
              </Button>
            </AlertAction>
          </Alert>
        ) : loading ? (
          <div className="space-y-3 py-2" aria-label="正在加载管理员账号">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-14 w-full" />
            ))}
          </div>
        ) : data.accounts.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>制作人名称</TableHead>
                <TableHead>用户名</TableHead>
                <TableHead>角色</TableHead>
                <TableHead className="w-16 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.accounts.map((account) => {
                const isCurrent = account.id === session.id
                const canDelete = account.adminRole === "admin" && !isCurrent

                return (
                  <TableRow key={account.id}>
                    <TableCell className="min-w-40 whitespace-normal">
                      <div className="flex items-center gap-2 font-medium">
                        {account.producername || "未设置"}
                        {isCurrent ? (
                          <Badge variant="outline">当前账号</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-72 whitespace-normal text-muted-foreground">
                      <span className="break-all">{account.username}</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          account.adminRole === "super_admin"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {account.adminRole === "super_admin" ? (
                          <ShieldCheckIcon
                            data-icon="inline-start"
                            aria-hidden="true"
                          />
                        ) : null}
                        {account.adminRole === "super_admin"
                          ? "最高管理员"
                          : "一般管理员"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canDelete ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`删除管理员 ${account.username}`}
                          onClick={() => setDeleteTarget(account)}
                        >
                          <Trash2Icon aria-hidden="true" />
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <AdminEmptyState
            icon={UsersRoundIcon}
            title="没有管理员账号"
            description="当前未找到可管理的运营账号。"
          />
        )}
      </AdminPanel>

      <Dialog open={createOpen} onOpenChange={changeCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>新增管理员</DialogTitle>
              <DialogDescription>
                新账号将获得一般管理员权限。
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-5">
              <Field>
                <FieldLabel htmlFor="admin-account-username">用户名</FieldLabel>
                <Input
                  id="admin-account-username"
                  name="username"
                  autoComplete="username"
                  maxLength={128}
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="admin-account-producername">
                  制作人名称
                </FieldLabel>
                <Input
                  id="admin-account-producername"
                  name="producername"
                  maxLength={80}
                  required
                  value={producername}
                  onChange={(event) => setProducername(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="admin-account-password">密码</FieldLabel>
                <Input
                  id="admin-account-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <FieldDescription>至少 12 个字符。</FieldDescription>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => changeCreateOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <PlusIcon data-icon="inline-start" />
                )}
                创建账号
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="text-destructive">
              <Trash2Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>删除管理员账号？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.username}”将被删除，且无法再次登录管理工作台。`
                : "该账号将被删除，且无法再次登录管理工作台。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void remove()}
            >
              {deleting ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function meta() {
  return [{ title: "管理员账号 | IMSWeb" }]
}

export default function AdminAccountsPage() {
  const { adminSession } = useOutletContext<AdminOutletContext>()

  if (adminSession.adminRole !== "super_admin") {
    return (
      <div className="flex flex-col gap-8">
        <AdminPageHeader
          eyebrow="ACCESS CONTROL"
          title="管理员账号"
          description="维护管理工作台的登录账号与管理员身份。"
        />
        <Alert variant="destructive">
          <ShieldCheckIcon aria-hidden="true" />
          <AlertTitle>仅最高管理员可访问</AlertTitle>
          <AlertDescription>当前账号没有管理员账号管理权限。</AlertDescription>
        </Alert>
      </div>
    )
  }

  return <AdminAccountsManager session={adminSession} />
}
