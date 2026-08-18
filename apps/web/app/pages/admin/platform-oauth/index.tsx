import { useRequest } from "alova/client"
import {
  CheckCircle2Icon,
  Code2Icon,
  KeyRoundIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SaveIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { useState } from "react"
import { useOutletContext } from "react-router"
import { toast } from "sonner"

import {
  AdminEmptyState,
  AdminField,
  AdminPageHeader,
  AdminPanel,
} from "~/components/admin/admin-ui"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { isApiError } from "~/lib/api"
import {
  getAdminPlatformOAuthProviders,
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
  return code === "google"
    ? "使用 Google OpenID Connect 登录，回调地址必须与 Google 控制台完全一致。"
    : "使用 GitHub OAuth 登录，回调地址必须与 GitHub OAuth App 完全一致。"
}

function toDraft(provider: PlatformOAuthAdminProvider): ProviderDraft {
  return {
    ...provider,
    clientId: "",
    clientSecret: "",
    redirectUriInput: provider.redirectUri ?? "",
  }
}

function ProviderConfigForm({
  provider,
  saving,
  onSave,
}: {
  provider: ProviderDraft
  saving: boolean
  onSave: (provider: ProviderDraft) => Promise<void>
}) {
  const [draft, setDraft] = useState(provider)

  return (
    <section className="flex min-w-0 flex-col gap-5 rounded-lg border bg-background p-5">
      <div className="flex min-w-0 items-start justify-between gap-4 border-b pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Code2Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{provider.displayName}</h2>
            <p className="mt-1 text-sm/5 text-muted-foreground">
              {providerDescription(provider.code)}
            </p>
          </div>
        </div>
        <Badge
          variant={
            provider.enabled && provider.configured ? "default" : "outline"
          }
        >
          {provider.enabled && provider.configured
            ? "登录入口已启用"
            : provider.configured
              ? "已配置，未启用"
              : "未配置"}
        </Badge>
      </div>

      <div className="grid min-w-0 gap-5 sm:grid-cols-2">
        <AdminField
          label="显示名称"
          htmlFor={`oauth-${provider.code}-display-name`}
        >
          <Input
            id={`oauth-${provider.code}-display-name`}
            value={draft.displayName}
            maxLength={80}
            onChange={(event) =>
              setDraft({ ...draft, displayName: event.target.value })
            }
          />
        </AdminField>
        <AdminField
          label="回调地址"
          htmlFor={`oauth-${provider.code}-redirect-uri`}
          description="生产环境使用 HTTPS；本地开发可使用 localhost HTTP。"
        >
          <Input
            id={`oauth-${provider.code}-redirect-uri`}
            type="url"
            value={draft.redirectUriInput}
            placeholder="https://example.com/api/platform/auth/oauth/google/callback"
            maxLength={2048}
            onChange={(event) =>
              setDraft({ ...draft, redirectUriInput: event.target.value })
            }
          />
        </AdminField>
        <AdminField
          label="Client ID"
          htmlFor={`oauth-${provider.code}-client-id`}
          description={
            provider.clientIdMasked
              ? `当前已保存：${provider.clientIdMasked}。留空表示保持不变。`
              : "首次配置时必须填写。"
          }
        >
          <Input
            id={`oauth-${provider.code}-client-id`}
            value={draft.clientId}
            autoComplete="off"
            maxLength={512}
            placeholder={provider.clientIdMasked ?? "输入 Client ID"}
            onChange={(event) =>
              setDraft({ ...draft, clientId: event.target.value })
            }
          />
        </AdminField>
        <AdminField
          label="Client secret"
          htmlFor={`oauth-${provider.code}-client-secret`}
          description="不会回填明文；留空表示保持已保存的密钥。"
        >
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
              setDraft({ ...draft, clientSecret: event.target.value })
            }
          />
        </AdminField>
      </div>

      <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-w-0 items-center gap-3 text-sm font-medium">
          <Checkbox
            checked={draft.enabled}
            onCheckedChange={(checked) =>
              setDraft({ ...draft, enabled: checked === true })
            }
          />
          <span>允许用户使用此 provider 登录</span>
        </label>
        <Button
          type="button"
          disabled={saving}
          onClick={() => void onSave(draft)}
        >
          {saving ? (
            <LoaderCircleIcon
              className="animate-spin"
              data-icon="inline-start"
            />
          ) : (
            <SaveIcon data-icon="inline-start" />
          )}
          保存 {provider.displayName} 配置
        </Button>
      </div>
    </section>
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
      if (provider.clientSecret.trim())
        input.clientSecret = provider.clientSecret.trim()
      if (provider.redirectUriInput !== (provider.redirectUri ?? "")) {
        input.redirectUri = provider.redirectUriInput.trim()
      }
      const result = await updateAdminPlatformOAuthProvider(
        provider.code,
        input
      ).send()
      await refresh()
      toast.success(`${result.provider.displayName} 配置已保存`)
    } catch (saveError) {
      if (isApiError(saveError) && saveError.status === 409) {
        toast.error("配置版本已变化，请刷新后再保存")
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
        description="动态管理 Google 与 GitHub 登录参数。凭据加密保存于后端数据库，保存后无需重启服务。"
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={loading}
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
            <p className="text-xs text-muted-foreground">配置入口</p>
            <p className="font-semibold">后台动态管理</p>
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
        title="第三方登录 provider"
        description="启用前请先在对应服务商控制台登记完全一致的回调地址。"
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
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            {data.providers.map((provider) => (
              <ProviderConfigForm
                key={`${provider.code}-${provider.updatedAt}`}
                provider={toDraft(provider)}
                saving={savingCode === provider.code}
                onSave={save}
              />
            ))}
          </div>
        ) : (
          <AdminEmptyState
            icon={Code2Icon}
            title="没有可配置的 provider"
            description="请先完成平台 OAuth provider 的数据库迁移。"
          />
        )}
      </AdminPanel>
    </div>
  )
}
