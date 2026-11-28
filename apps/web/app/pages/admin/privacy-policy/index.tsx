import type { AdminPrivacyPolicySnapshot } from "@imsweb/contracts/privacy-policy"
import { useRequest } from "alova/client"
import {
  FileTextIcon,
  LoaderCircleIcon,
  SaveIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  AdminField,
  AdminPageHeader,
  AdminPanel,
  adminControlClass,
  adminTextareaClass,
} from "~/components/admin/admin-ui"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  getAdminPrivacyPolicy,
  updateAdminPrivacyPolicy,
  type PrivacyPolicyDraft,
} from "~/lib/api"

export function meta() {
  return [{ title: "隐私条款 | IMSWeb" }]
}

function savedAtLabel(value: string | null): string {
  if (!value) return "内置默认文本，尚未保存"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "尚未保存"
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export function PrivacyPolicyManager() {
  const {
    loading,
    error,
    send: refresh,
    onError,
    onSuccess,
  } = useRequest(getAdminPrivacyPolicy())
  onError(() => undefined)

  const [draft, setDraft] = useState<PrivacyPolicyDraft | null>(null)
  const [revision, setRevision] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  onSuccess((event) => {
    const snapshot = event.data as AdminPrivacyPolicySnapshot
    setDraft({
      enabled: snapshot.content.enabled,
      title: snapshot.content.title,
      body: snapshot.content.body,
    })
    setRevision(snapshot.revision)
    setUpdatedAt(snapshot.content.updatedAt)
    setDirty(false)
  })

  function change(update: Partial<PrivacyPolicyDraft>) {
    setDraft((current) => (current ? { ...current, ...update } : current))
    setDirty(true)
  }

  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || saving) return
    if (!draft.title.trim() || !draft.body.trim()) {
      toast.error("条款标题和正文不能为空")
      return
    }
    setSaving(true)
    try {
      const result = await updateAdminPrivacyPolicy(draft, revision).send()
      setDraft({
        enabled: result.content.enabled,
        title: result.content.title,
        body: result.content.body,
      })
      setRevision(result.revision)
      setUpdatedAt(result.content.updatedAt)
      setDirty(false)
      toast.success("隐私条款已保存")
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "隐私条款保存失败"
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading && !draft) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          eyebrow="Site Content"
          title="隐私条款"
          description="登录页展示的条款正文与同意确认框。"
        />
        <p className="text-sm text-muted-foreground">正在载入隐私条款…</p>
      </div>
    )
  }

  if (!draft) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          eyebrow="Site Content"
          title="隐私条款"
          description="登录页展示的条款正文与同意确认框。"
        />
        <Alert variant="destructive">
          <AlertTitle>隐私条款载入失败</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "请稍后重试。"}
          </AlertDescription>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
          >
            重新载入
          </Button>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Site Content"
        title="隐私条款"
        description="控制登录页的隐私条款入口、条款正文与同意确认框。关闭后登录页不再显示该入口，也不会要求勾选。"
        actions={
          <>
            <Badge variant={draft.enabled ? "default" : "secondary"}>
              {draft.enabled ? "登录页已启用" : "登录页已关闭"}
            </Badge>
            <Button
              type="submit"
              form="privacy-policy-form"
              disabled={saving || !dirty}
            >
              {saving ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <SaveIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {saving ? "正在保存" : "保存更改"}
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <AdminPanel
          title="条款内容"
          description={`最后保存：${savedAtLabel(updatedAt)}`}
          icon={ShieldCheckIcon}
        >
          <form id="privacy-policy-form" className="space-y-5" onSubmit={save}>
            <label className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
              <Checkbox
                className="mt-0.5"
                checked={draft.enabled}
                onCheckedChange={(checked) => change({ enabled: checked })}
              />
              <span className="min-w-0 space-y-1">
                <span className="block text-sm font-medium">
                  在登录页显示并启用确认框
                </span>
                <span className="block text-xs/5 text-muted-foreground">
                  关闭后，登录与注册页不再展示隐私条款入口，也不会阻止未勾选的提交。
                </span>
              </span>
            </label>

            <AdminField
              label="条款标题"
              htmlFor="privacy-policy-title"
              description="显示在登录页的链接文案与弹窗标题中，需为 1-120 个字符。"
            >
              <input
                id="privacy-policy-title"
                className={adminControlClass}
                maxLength={120}
                value={draft.title}
                onChange={(event) => change({ title: event.target.value })}
              />
            </AdminField>

            <AdminField
              label="条款正文"
              htmlFor="privacy-policy-body"
              description="支持空行分段，登录页弹窗会按原样展示。需为 1-20000 个字符。"
            >
              <textarea
                id="privacy-policy-body"
                className={adminTextareaClass}
                rows={18}
                maxLength={20000}
                value={draft.body}
                onChange={(event) => change({ body: event.target.value })}
              />
            </AdminField>
          </form>
        </AdminPanel>

        <AdminPanel
          title="登录页预览"
          description={
            draft.enabled
              ? "以下内容会在登录与注册页的条款弹窗中展示。"
              : "当前已关闭：预览仅供参考，登录页不会显示入口。"
          }
          icon={FileTextIcon}
          action={
            <Badge variant="outline">
              {draft.body.length.toLocaleString()} 字符
            </Badge>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <span
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 rounded-[4px] border border-input"
              />
              <p className="text-sm/6 text-muted-foreground">
                我已阅读并同意{" "}
                <span className="font-medium text-foreground underline underline-offset-4">
                  《{draft.title || "未命名条款"}》
                </span>
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20">
              <div className="border-b px-4 py-3">
                <p className="font-medium">{draft.title || "未命名条款"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {savedAtLabel(updatedAt)}
                </p>
              </div>
              <div className="max-h-112 overflow-y-auto p-4 text-sm/7 wrap-break-word whitespace-pre-wrap">
                {draft.body || "条款正文为空。"}
              </div>
            </div>
          </div>
        </AdminPanel>
      </div>
    </div>
  )
}

export default PrivacyPolicyManager
