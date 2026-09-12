import { useRequest } from "alova/client"
import {
  CheckCircle2Icon,
  Code2Icon,
  KeyRoundIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"
import { useOutletContext } from "react-router"
import { toast } from "sonner"

import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
} from "~/components/admin/admin-ui"
import { platformOAuthButtonStyle } from "~/components/platform/platform-oauth-button-theme"
import { PlatformOAuthProviderIcon } from "~/components/platform/platform-oauth-provider-icon"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  createAdminPlatformOAuthProvider,
  deleteAdminPlatformOAuthProvider,
  getAdminPlatformOAuthProviders,
  isApiError,
  updateAdminPlatformOAuthProvider,
  type PlatformOAuthAdminProvider,
  type PlatformOAuthProviderCreateInput,
  type PlatformOAuthProviderUpdateInput,
} from "~/lib/api"
import { ProviderConfigDialog } from "~/pages/admin/platform-oauth/components/provider-config-dialog"
import {
  emptyDraft,
  providerInput,
  toDraft,
  type ProviderDraft,
} from "~/pages/admin/platform-oauth/platform-oauth-model"

interface AdminOutletContext {
  adminSession: { adminRole: string | null }
}

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

export function meta() {
  return [{ title: "OAuth 登录配置 | IMSWeb" }]
}

export default function AdminPlatformOAuthPage() {
  const { adminSession } = useOutletContext<AdminOutletContext>()
  const {
    data,
    loading,
    error,
    send: refresh,
  } = useRequest(getAdminPlatformOAuthProviders(), {
    initialData: { success: true as const, providers: [] },
  })
  const [editor, setEditor] = useState<{
    draft: ProviderDraft
    creating: boolean
  } | null>(null)
  const [deleteProvider, setDeleteProvider] =
    useState<PlatformOAuthAdminProvider | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  if (adminSession.adminRole !== "super_admin") {
    return (
      <div className="flex flex-col gap-8">
        <AdminPageHeader
          eyebrow="PLATFORM AUTH"
          title="OAuth 登录配置"
          description="管理第三方登录入口与后端凭据。"
        />
        <Alert variant="destructive">
          <ShieldCheckIcon aria-hidden="true" />
          <AlertTitle>仅最高管理员可访问</AlertTitle>
          <AlertDescription>
            OAuth client secret 属于平台安全配置。
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  async function save(draft: ProviderDraft, creating: boolean) {
    setPendingAction(creating ? "create" : `update-${draft.code}`)
    try {
      const input = providerInput(draft)
      const result = creating
        ? await createAdminPlatformOAuthProvider({
            code: draft.code,
            ...input,
          } satisfies PlatformOAuthProviderCreateInput).send()
        : await updateAdminPlatformOAuthProvider(draft.code, {
            ...input,
            expectedUpdatedAt: draft.updatedAt,
          } satisfies PlatformOAuthProviderUpdateInput).send()
      setEditor(null)
      await refresh()
      toast.success(`${result.provider.displayName} 配置已保存`)
    } catch (saveError) {
      if (isApiError(saveError) && saveError.status === 409) {
        toast.error("配置版本已变化，请刷新后再保存")
        setEditor(null)
        await refresh()
      } else {
        toast.error(errorMessage(saveError))
      }
    } finally {
      setPendingAction(null)
    }
  }

  async function confirmDelete() {
    if (!deleteProvider) return
    setPendingAction(`delete-${deleteProvider.code}`)
    try {
      await deleteAdminPlatformOAuthProvider(
        deleteProvider.code,
        deleteProvider.updatedAt
      ).send()
      toast.success(`${deleteProvider.displayName} 已删除`)
      setDeleteProvider(null)
      await refresh()
    } catch (deleteError) {
      toast.error(errorMessage(deleteError))
      if (isApiError(deleteError) && deleteError.status === 409) {
        setDeleteProvider(null)
        await refresh()
      }
    } finally {
      setPendingAction(null)
    }
  }

  const busy = pendingAction !== null

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <AdminPageHeader
        eyebrow="PLATFORM AUTH"
        title="OAuth 登录配置"
        description="管理 OAuth 2.0 与 OpenID Connect 登录方式。"
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={loading || busy}
            onClick={() => void refresh()}
          >
            <RefreshCwIcon
              className={loading ? "animate-spin" : undefined}
              data-icon="inline-start"
            />
            重新读取
          </Button>
        }
      />

      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-4">
          <KeyRoundIcon className="size-5 text-primary" aria-hidden="true" />
          <div>
            <p className="text-xs text-muted-foreground">Provider</p>
            <p className="font-semibold">{data.providers.length} 个配置</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-4">
          <ShieldCheckIcon className="size-5 text-primary" aria-hidden="true" />
          <div>
            <p className="text-xs text-muted-foreground">密钥存储</p>
            <p className="font-semibold">后端加密，不回填</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-4">
          <CheckCircle2Icon
            className="size-5 text-primary"
            aria-hidden="true"
          />
          <div>
            <p className="text-xs text-muted-foreground">公开入口</p>
            <p className="font-semibold">仅显示完整启用项</p>
          </div>
        </div>
      </div>

      <AdminPanel
        title="登录方式"
        description="OAuth provider 与前端按钮显示配置。"
        icon={Code2Icon}
        contentClassName="pt-1"
        action={
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => setEditor({ draft: emptyDraft(), creating: true })}
          >
            <PlusIcon data-icon="inline-start" />
            添加 provider
          </Button>
        }
      >
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>OAuth 配置读取失败</AlertTitle>
            <AlertDescription>{errorMessage(error)}</AlertDescription>
          </Alert>
        ) : loading && !data.providers.length ? (
          <p className="py-8 text-sm text-muted-foreground">
            正在读取 provider 配置
          </p>
        ) : data.providers.length ? (
          <div className="flex min-w-0 flex-col divide-y border-y">
            {data.providers.map((provider) => (
              <div
                key={provider.code}
                className="flex min-w-0 flex-col gap-4 px-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg border"
                    style={platformOAuthButtonStyle(provider.buttonColor)}
                  >
                    <PlatformOAuthProviderIcon
                      provider={provider.icon}
                      className="size-5"
                      aria-hidden="true"
                    />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold">
                        {provider.displayName}
                      </h2>
                      <Badge variant="secondary">{provider.code}</Badge>
                      <Badge
                        variant={
                          provider.enabled && provider.configured
                            ? "default"
                            : "outline"
                        }
                      >
                        {provider.enabled && provider.configured
                          ? "登录入口已启用"
                          : provider.configured
                            ? "已配置，未启用"
                            : "未配置"}
                      </Badge>
                    </div>
                    <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
                      {provider.authorizationEndpoint}
                    </p>
                    <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
                      {provider.redirectUri ?? "尚未设置回调地址"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title={`编辑 ${provider.displayName}`}
                    aria-label={`编辑 ${provider.displayName}`}
                    disabled={busy}
                    onClick={() =>
                      setEditor({ draft: toDraft(provider), creating: false })
                    }
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title={`删除 ${provider.displayName}`}
                    aria-label={`删除 ${provider.displayName}`}
                    disabled={busy}
                    onClick={() => setDeleteProvider(provider)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <AdminEmptyState
            icon={Code2Icon}
            title="没有 OAuth provider"
            description="添加 provider 后即可配置登录入口。"
          />
        )}
      </AdminPanel>

      {editor ? (
        <ProviderConfigDialog
          key={`${editor.creating ? "create" : editor.draft.code}-${editor.draft.updatedAt}`}
          provider={editor.draft}
          creating={editor.creating}
          saving={
            pendingAction === "create" ||
            pendingAction === `update-${editor.draft.code}`
          }
          onOpenChange={(open) => {
            if (!open) setEditor(null)
          }}
          onSave={(draft) => save(draft, editor.creating)}
        />
      ) : null}

      <AlertDialog
        open={Boolean(deleteProvider)}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleteProvider(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 OAuth provider？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除 {deleteProvider?.displayName}
              。已有用户绑定或未完成登录流程时，系统会拒绝删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={confirmDelete}
            >
              {busy ? (
                <LoaderCircleIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              删除 provider
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
