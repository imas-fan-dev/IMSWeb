import { useRequest } from "alova/client"
import {
  CheckCircle2Icon,
  Clock3Icon,
  LoaderCircleIcon,
  MailCheckIcon,
  RefreshCwIcon,
  SaveIcon,
  SendIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { useState } from "react"
import { useOutletContext } from "react-router"
import { toast } from "sonner"

import {
  AdminField,
  AdminPageHeader,
  AdminPanel,
  AdminStatus,
  adminControlClass,
} from "~/components/admin/admin-ui"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  getAdminPlatformEmailSettings,
  isApiError,
  testAdminPlatformEmailSettings,
  updateAdminPlatformEmailSettings,
  type AdminPlatformEmailSecurity,
} from "~/lib/api"
import {
  emptyPlatformEmailDraft,
  platformEmailConfigurationInput,
  platformEmailDraft,
  platformEmailTestInput,
  testablePlatformEmailDraft,
  validPlatformEmailDraft,
  type PlatformEmailDraft,
} from "~/pages/admin/platform-email/platform-email-model"

interface AdminOutletContext {
  adminSession: { adminRole: string | null }
}

const securityOptions: Array<{
  value: AdminPlatformEmailSecurity
  label: string
}> = [
  { value: "tls", label: "TLS（通常为 465）" },
  { value: "starttls", label: "STARTTLS（通常为 587）" },
]

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

export function meta() {
  return [{ title: "邮件服务配置 | IMSWeb" }]
}

export default function AdminPlatformEmailPage() {
  const { adminSession } = useOutletContext<AdminOutletContext>()
  const [draft, setDraft] = useState<PlatformEmailDraft>(
    emptyPlatformEmailDraft
  )
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const {
    loading,
    error,
    send: refresh,
    onSuccess,
  } = useRequest(getAdminPlatformEmailSettings())

  onSuccess((event) => {
    setDraft(platformEmailDraft(event.data.settings))
  })

  function update<Key extends keyof PlatformEmailDraft>(
    key: Key,
    value: PlatformEmailDraft[Key]
  ) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function saveSettings() {
    setPendingAction("save")
    try {
      const result = await updateAdminPlatformEmailSettings(
        platformEmailConfigurationInput(draft)
      ).send()
      setDraft(platformEmailDraft(result.settings))
      toast.success(result.settings.enabled ? "SMTP 已启用" : "SMTP 配置已保存")
    } catch (saveError) {
      toast.error(errorMessage(saveError))
      if (isApiError(saveError) && saveError.status === 409) {
        await refresh()
      }
    } finally {
      setPendingAction(null)
    }
  }

  async function sendTest() {
    setPendingAction("test")
    try {
      const result = await testAdminPlatformEmailSettings(
        platformEmailTestInput(draft)
      ).send()
      toast.success(`测试邮件已发送至 ${result.deliveredTo}`)
    } catch (testError) {
      toast.error(errorMessage(testError))
      if (isApiError(testError) && testError.status === 409) {
        await refresh()
      }
    } finally {
      setPendingAction(null)
    }
  }

  if (adminSession.adminRole !== "super_admin") {
    return (
      <div className="flex flex-col gap-8">
        <AdminPageHeader
          eyebrow="PLATFORM EMAIL"
          title="邮件服务配置"
          description="管理平台 SMTP 发件服务。"
        />
        <Alert variant="destructive">
          <ShieldCheckIcon aria-hidden="true" />
          <AlertTitle>仅最高管理员可访问</AlertTitle>
          <AlertDescription>SMTP 凭据属于平台安全配置。</AlertDescription>
        </Alert>
      </div>
    )
  }

  const busy = pendingAction !== null
  const valid = validPlatformEmailDraft(draft)
  const testable = testablePlatformEmailDraft(draft)

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <AdminPageHeader
        eyebrow="PLATFORM EMAIL"
        title="邮件服务配置"
        description="管理注册验证与密码重置邮件的 SMTP 发件服务。"
        actions={
          <div className="flex items-center gap-2">
            <AdminStatus>
              {draft.enabled
                ? "已启用"
                : draft.configured
                  ? "已配置"
                  : "未配置"}
            </AdminStatus>
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
          </div>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>配置读取失败</AlertTitle>
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <AdminPanel
        title="SMTP 连接"
        description="凭据加密保存，证书校验始终开启。"
        icon={MailCheckIcon}
        footer={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {draft.configured ? (
              <CheckCircle2Icon
                className="size-4 text-success"
                aria-hidden="true"
              />
            ) : null}
            {draft.configured ? "凭据已保存" : "尚未保存凭据"}
          </div>
        }
      >
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <label className="flex min-h-16 items-start gap-3 rounded-lg border bg-muted/20 p-4 lg:col-span-2">
            <Checkbox
              checked={draft.enabled}
              disabled={busy || loading}
              onCheckedChange={(checked) => update("enabled", checked === true)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">启用 SMTP 发件</span>
              <span className="mt-1 block text-xs/5 text-muted-foreground">
                启用前会验证 SMTP 连接和登录凭据。
              </span>
            </span>
          </label>

          <AdminField label="SMTP 主机" htmlFor="platform-email-host">
            <Input
              id="platform-email-host"
              value={draft.host}
              placeholder="smtp.example.com"
              autoComplete="off"
              className={adminControlClass}
              disabled={busy || loading}
              onChange={(event) => update("host", event.target.value)}
            />
          </AdminField>

          <div className="grid min-w-0 gap-5 sm:grid-cols-2">
            <AdminField label="端口" htmlFor="platform-email-port">
              <Input
                id="platform-email-port"
                type="number"
                min={1}
                max={65535}
                value={draft.port}
                className={adminControlClass}
                disabled={busy || loading}
                onChange={(event) => update("port", event.target.value)}
              />
            </AdminField>
            <AdminField label="连接安全" htmlFor="platform-email-security">
              <Select
                items={securityOptions}
                value={draft.security}
                disabled={busy || loading}
                onValueChange={(value) =>
                  update(
                    "security",
                    String(value) as AdminPlatformEmailSecurity
                  )
                }
              >
                <SelectTrigger
                  id="platform-email-security"
                  className={`${adminControlClass} w-full`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {securityOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </AdminField>
          </div>

          <AdminField
            label="SMTP 用户名"
            htmlFor="platform-email-username"
            description={
              draft.usernameMasked ? `当前：${draft.usernameMasked}` : undefined
            }
          >
            <Input
              id="platform-email-username"
              value={draft.username}
              placeholder={
                draft.usernameMasked
                  ? "留空以保留当前用户名"
                  : "mail@example.com"
              }
              autoComplete="username"
              className={adminControlClass}
              disabled={busy || loading}
              onChange={(event) => update("username", event.target.value)}
            />
          </AdminField>

          <AdminField
            label="SMTP 密码"
            htmlFor="platform-email-password"
            description={
              draft.passwordConfigured ? "当前密码已加密保存" : undefined
            }
          >
            <Input
              id="platform-email-password"
              type="password"
              value={draft.password}
              placeholder={
                draft.passwordConfigured
                  ? "留空以保留当前密码"
                  : "输入 SMTP 密码"
              }
              autoComplete="new-password"
              className={adminControlClass}
              disabled={busy || loading}
              onChange={(event) => update("password", event.target.value)}
            />
          </AdminField>

          <AdminField label="发件地址" htmlFor="platform-email-from-address">
            <Input
              id="platform-email-from-address"
              type="email"
              value={draft.fromAddress}
              placeholder="mail@example.com"
              autoComplete="email"
              className={adminControlClass}
              disabled={busy || loading}
              onChange={(event) => update("fromAddress", event.target.value)}
            />
          </AdminField>

          <AdminField label="发件名称" htmlFor="platform-email-from-name">
            <Input
              id="platform-email-from-name"
              value={draft.fromName}
              placeholder="IMSWeb"
              autoComplete="organization"
              className={adminControlClass}
              disabled={busy || loading}
              onChange={(event) => update("fromName", event.target.value)}
            />
          </AdminField>
        </div>
      </AdminPanel>

      <AdminPanel
        title="发送策略"
        description="注册验证与密码重置共用此重发间隔。"
        icon={Clock3Icon}
        footer={
          <div className="flex w-full justify-end">
            <Button
              type="button"
              disabled={!valid || busy || loading}
              onClick={() => void saveSettings()}
            >
              {pendingAction === "save" ? (
                <LoaderCircleIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              保存配置
            </Button>
          </div>
        }
      >
        <AdminField
          label="验证码重发间隔（秒）"
          htmlFor="platform-email-resend-cooldown"
          description="只允许 30 至 600 的整数秒。"
          className="max-w-sm"
        >
          <Input
            id="platform-email-resend-cooldown"
            type="number"
            min={30}
            max={600}
            step={1}
            value={draft.resendCooldownSeconds}
            className={adminControlClass}
            disabled={busy || loading}
            onChange={(event) =>
              update("resendCooldownSeconds", event.target.value)
            }
          />
        </AdminField>
      </AdminPanel>

      <AdminPanel
        title="发送测试"
        description="使用当前表单内容发送，不会先保存配置。"
        icon={SendIcon}
      >
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end">
          <AdminField
            label="测试收件人"
            htmlFor="platform-email-test-recipient"
            className="flex-1"
          >
            <Input
              id="platform-email-test-recipient"
              type="email"
              value={draft.testRecipient}
              placeholder="admin@example.com"
              autoComplete="email"
              className={adminControlClass}
              disabled={busy || loading}
              onChange={(event) => update("testRecipient", event.target.value)}
            />
          </AdminField>
          <Button
            type="button"
            variant="outline"
            className="h-10 shrink-0"
            disabled={!testable || busy || loading}
            onClick={() => void sendTest()}
          >
            {pendingAction === "test" ? (
              <LoaderCircleIcon
                className="animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <SendIcon data-icon="inline-start" />
            )}
            发送测试邮件
          </Button>
        </div>
      </AdminPanel>
    </div>
  )
}
