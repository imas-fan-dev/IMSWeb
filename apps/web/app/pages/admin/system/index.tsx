import { useRequest } from "alova/client"
import {
  CircleCheckIcon,
  CloudCogIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SaveIcon,
  ServerCogIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
} from "~/components/admin/admin-ui"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  getAdminFudabaMapDelivery,
  isApiError,
  updateAdminFudabaMapDelivery,
  type FudabaMapDeliverySnapshot,
} from "~/lib/api"

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

export function meta() {
  return [{ title: "系统配置 | IMSWeb" }]
}

export default function AdminSystemPage() {
  const [snapshot, setSnapshot] = useState<FudabaMapDeliverySnapshot | null>(
    null
  )
  const [draftPrefix, setDraftPrefix] = useState("")
  const [saving, setSaving] = useState(false)
  const {
    loading,
    error,
    send: refresh,
    onError,
    onSuccess,
  } = useRequest(getAdminFudabaMapDelivery())

  onError(() => undefined)
  onSuccess((event) => {
    setSnapshot(event.data)
    setDraftPrefix(event.data.selectedPrefix ?? event.data.effectivePrefix)
  })

  async function save() {
    if (!snapshot || !draftPrefix) return
    setSaving(true)
    try {
      const result = await updateAdminFudabaMapDelivery(
        draftPrefix,
        snapshot.revision
      ).send()
      setSnapshot(result.delivery)
      setDraftPrefix(
        result.delivery.selectedPrefix ?? result.delivery.effectivePrefix
      )
      toast.success("地图分发配置已保存")
    } catch (saveError) {
      if (isApiError(saveError) && saveError.status === 409) {
        toast.error("配置已被其他管理员更新，正在重新读取")
        await refresh()
      } else {
        toast.error(errorMessage(saveError))
      }
    } finally {
      setSaving(false)
    }
  }

  const savedPrefix =
    snapshot?.selectedPrefix ?? snapshot?.effectivePrefix ?? ""
  const dirty = Boolean(draftPrefix && draftPrefix !== savedPrefix)

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <AdminPageHeader
        eyebrow="SYSTEM"
        title="系统配置"
        description="管理运行时基础设施与公共服务的生效配置。"
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={loading || saving}
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

      {snapshot ? (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 items-start gap-3 border-b pb-4">
            <ServerCogIcon
              className="mt-0.5 size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">当前生效前缀</p>
              <p className="mt-1 font-mono text-sm font-medium break-all">
                {snapshot.effectivePrefix}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-start gap-3 border-b pb-4">
            <CircleCheckIcon
              className="mt-0.5 size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">配置来源</p>
              <Badge className="mt-1" variant="secondary">
                {snapshot.selectedPrefix ? "运营选择" : "部署默认值"}
              </Badge>
            </div>
          </div>
        </div>
      ) : null}

      <AdminPanel
        title="交换地图分发"
        description="选择地图样式、瓦片、字形与精灵图的访问前缀。"
        icon={CloudCogIcon}
      >
        {error && !snapshot ? (
          <Alert variant="destructive">
            <AlertTitle>地图分发配置读取失败</AlertTitle>
            <AlertDescription className="mt-2 flex flex-col items-start gap-4">
              <span>{errorMessage(error)}</span>
              <Button
                type="button"
                variant="outline"
                onClick={() => void refresh()}
              >
                <RefreshCwIcon data-icon="inline-start" />
                重新加载
              </Button>
            </AlertDescription>
          </Alert>
        ) : loading && !snapshot ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
            正在读取地图分发配置
          </div>
        ) : snapshot && snapshot.availablePrefixes.length ? (
          <div className="flex min-w-0 flex-col gap-5">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>重新读取失败</AlertTitle>
                <AlertDescription>{errorMessage(error)}</AlertDescription>
              </Alert>
            ) : null}
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="mb-1 text-sm leading-none font-medium">
                访问前缀
              </legend>
              {snapshot.availablePrefixes.map((prefix) => (
                <label
                  key={prefix}
                  className={
                    draftPrefix === prefix
                      ? "flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-primary bg-primary/5 p-3"
                      : "flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 hover:bg-muted/40"
                  }
                >
                  <input
                    type="radio"
                    name="map-delivery-prefix"
                    value={prefix}
                    checked={draftPrefix === prefix}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                    onChange={() => setDraftPrefix(prefix)}
                  />
                  <span className="min-w-0 font-mono text-sm break-all">
                    {prefix}
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 font-mono text-xs break-all text-muted-foreground">
                {draftPrefix}
              </p>
              <Button
                type="button"
                disabled={!dirty || saving || loading}
                onClick={() => void save()}
              >
                {saving ? (
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
          </div>
        ) : snapshot ? (
          <AdminEmptyState
            icon={CloudCogIcon}
            title="没有可选的地图分发前缀"
            description="当前部署尚未提供可切换的地图分发地址。"
          />
        ) : null}
      </AdminPanel>
    </div>
  )
}
