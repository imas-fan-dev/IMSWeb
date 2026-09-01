import { useRequest } from "alova/client"
import {
  CheckCircle2Icon,
  Code2Icon,
  KeyRoundIcon,
  PencilIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { useState } from "react"
import { useOutletContext } from "react-router"
import { toast } from "sonner"

import { AdminConfigDialog } from "~/components/admin/admin-config-dialog"
import { PlatformOAuthProviderIcon } from "~/components/platform/platform-oauth-provider-icon"
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
} from "~/components/admin/admin-ui"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  getAdminPlatformOAuthProviders,
  isApiError,
  updateAdminPlatformOAuthProvider,
  type PlatformOAuthAdminProvider,
} from "~/lib/api"

interface AdminOutletContext {
  adminSession: { adminRole: string | null }
}

type ProviderDraft = PlatformOAuthAdminProvider & {
  clientId: string
  clientSecret: string
  redirectUriInput: string
}

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

function providerDescription(code: PlatformOAuthAdminProvider["code"]) {
  return code === "google" ? "Google OpenID Connect" : "GitHub OAuth App"
}

function toDraft(provider: PlatformOAuthAdminProvider): ProviderDraft {
  return {
    ...provider,
    clientId: "",
    clientSecret: "",
    redirectUriInput: provider.redirectUri ?? "",
  }
}

function ProviderConfigDialog({
  provider,
  saving,
  onOpenChange,
  onSave,
}: {
  provider: ProviderDraft
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSave: (provider: ProviderDraft) => void | Promise<void>
}) {
  const [draft, setDraft] = useState(provider)
  const valid = Boolean(
    draft.displayName.trim() && draft.redirectUriInput.trim()
  )

  return (
    <AdminConfigDialog
      open
      title={`配置 ${provider.displayName}`}
      description={providerDescription(provider.code)}
      icon={
        <PlatformOAuthProviderIcon
          provider={provider.icon}
          className="size-5"
          aria-hidden="true"
        />
      }
      submitLabel="保存 OAuth 配置"
      submitDisabled={!valid}
      saving={saving}
      onOpenChange={onOpenChange}
      onSubmit={() => onSave(draft)}
    >
      <FieldGroup className="grid sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`oauth-${provider.code}-display-name`}>
            显示名称
          </FieldLabel>
          <Input
            id={`oauth-${provider.code}-display-name`}
            required
            maxLength={80}
            autoFocus
            value={draft.displayName}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                displayName: event.target.value,
              }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`oauth-${provider.code}-redirect-uri`}>
            回调地址
          </FieldLabel>
          <Input
            id={`oauth-${provider.code}-redirect-uri`}
            type="url"
            required
            maxLength={2048}
            value={draft.redirectUriInput}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                redirectUriInput: event.target.value,
              }))
            }
          />
          <FieldDescription>
            必须与 provider 控制台登记值完全一致。
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`oauth-${provider.code}-client-id`}>
            Client ID
          </FieldLabel>
          <Input
            id={`oauth-${provider.code}-client-id`}
            value={draft.clientId}
            autoComplete="off"
            maxLength={512}
            placeholder={provider.clientIdMasked ?? "输入 Client ID"}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                clientId: event.target.value,
              }))
            }
          />
          <FieldDescription>
            {provider.clientIdMasked
              ? `当前已保存：${provider.clientIdMasked}`
              : "首次配置时填写"}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`oauth-${provider.code}-client-secret`}>
            Client secret
          </FieldLabel>
          <Input
            id={`oauth-${provider.code}-client-secret`}
            type="password"
            value={draft.clientSecret}
            autoComplete="new-password"
            maxLength={2048}
            placeholder={
              provider.configured
                ? "已保存，输入新值可替换"
                : "输入 Client secret"
            }
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                clientSecret: event.target.value,
              }))
            }
          />
          <FieldDescription>留空时保持已保存的密钥。</FieldDescription>
        </Field>
        <Field className="sm:col-span-2" orientation="horizontal">
          <Checkbox
            id={`oauth-${provider.code}-enabled`}
            checked={draft.enabled}
            onCheckedChange={(checked) =>
              setDraft((current) => ({
                ...current,
                enabled: checked === true,
              }))
            }
          />
          <FieldLabel htmlFor={`oauth-${provider.code}-enabled`}>
            允许用户使用此 provider 登录
          </FieldLabel>
        </Field>
      </FieldGroup>
    </AdminConfigDialog>
  )
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
  const [editingProvider, setEditingProvider] = useState<ProviderDraft | null>(
    null
  )
  const [savingCode, setSavingCode] = useState<string | null>(null)

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

  async function save(provider: ProviderDraft) {
    setSavingCode(provider.code)
    try {
      const input: Parameters<typeof updateAdminPlatformOAuthProvider>[1] = {
        displayName: provider.displayName,
        enabled: provider.enabled,
        expectedUpdatedAt: provider.updatedAt,
      }
      if (provider.clientId.trim()) input.clientId = provider.clientId.trim()
      if (provider.clientSecret.trim()) {
        input.clientSecret = provider.clientSecret.trim()
      }
      if (provider.redirectUriInput !== (provider.redirectUri ?? "")) {
        input.redirectUri = provider.redirectUriInput.trim()
      }
      const result = await updateAdminPlatformOAuthProvider(
        provider.code,
        input
      ).send()
      setEditingProvider(null)
      await refresh()
      toast.success(`${result.provider.displayName} 配置已保存`)
    } catch (saveError) {
      if (isApiError(saveError) && saveError.status === 409) {
        toast.error("配置版本已变化，请刷新后再保存")
        await refresh()
      } else {
        toast.error(errorMessage(saveError))
      }
    } finally {
      setSavingCode(null)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <AdminPageHeader
        eyebrow="PLATFORM AUTH"
        title="OAuth 登录配置"
        description="配置固定支持的 Google 与 GitHub 登录参数。凭据加密保存于后端数据库，保存后无需重启服务。"
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={loading || savingCode !== null}
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
            <p className="text-xs text-muted-foreground">Provider 类型</p>
            <p className="font-semibold">Google、GitHub</p>
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
        title="支持的登录方式"
        description="Provider 类型由应用固定，只能编辑连接参数和启用状态。"
        icon={Code2Icon}
        contentClassName="pt-1"
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
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
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
                    <p className="mt-1 text-xs text-muted-foreground">
                      {providerDescription(provider.code)}
                    </p>
                    <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
                      {provider.redirectUri ?? "尚未设置回调地址"}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={savingCode !== null}
                  onClick={() => setEditingProvider(toDraft(provider))}
                >
                  <PencilIcon data-icon="inline-start" />
                  编辑配置
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <AdminEmptyState
            icon={Code2Icon}
            title="登录方式尚未初始化"
            description="请检查 Google 与 GitHub OAuth 配置迁移。"
          />
        )}
      </AdminPanel>

      {editingProvider ? (
        <ProviderConfigDialog
          key={`${editingProvider.code}-${editingProvider.updatedAt}`}
          provider={editingProvider}
          saving={savingCode === editingProvider.code}
          onOpenChange={(open) => {
            if (!open) setEditingProvider(null)
          }}
          onSave={save}
        />
      ) : null}
    </div>
  )
}
