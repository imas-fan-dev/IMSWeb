import { useRequest } from "alova/client"
import {
  CircleCheckIcon,
  CloudCogIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  ServerCogIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
} from "~/components/admin/admin-ui"
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
  activateAdminFudabaMapSource,
  createAdminFudabaMapSource,
  deleteAdminFudabaMapSource,
  getAdminFudabaMapDelivery,
  isApiError,
  updateAdminFudabaMapSource,
  type FudabaMapDeliverySnapshot,
  type FudabaMapSource,
} from "~/lib/api"
import { MapSourceEditorDialog } from "~/pages/admin/system/map-source-editor-dialog"

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
  const [selectedSourceId, setSelectedSourceId] = useState("")
  const [editorSource, setEditorSource] = useState<
    FudabaMapSource | null | undefined
  >()
  const [deleteSource, setDeleteSource] = useState<FudabaMapSource | null>(null)
  const [activateSource, setActivateSource] = useState<FudabaMapSource | null>(
    null
  )
  const [pendingAction, setPendingAction] = useState<string | null>(null)
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
    setSelectedSourceId((current) =>
      event.data.sources.some((source) => source.id === current)
        ? current
        : event.data.activeSourceId
    )
  })

  function applyDelivery(delivery: FudabaMapDeliverySnapshot) {
    setSnapshot(delivery)
    setSelectedSourceId((current) =>
      delivery.sources.some((source) => source.id === current)
        ? current
        : delivery.activeSourceId
    )
  }

  async function handleMutationError(mutationError: unknown) {
    if (isApiError(mutationError) && mutationError.status === 409) {
      toast.error("配置已被其他管理员更新，正在重新读取")
      await refresh()
      return
    }
    toast.error(errorMessage(mutationError))
  }

  async function saveSource(draft: { name: string; styleUrl: string }) {
    if (!snapshot || editorSource === undefined) return
    const action = editorSource ? `edit-${editorSource.id}` : "create"
    setPendingAction(action)
    try {
      const result = editorSource
        ? await updateAdminFudabaMapSource(
            editorSource.id,
            draft.name,
            draft.styleUrl,
            snapshot.revision
          ).send()
        : await createAdminFudabaMapSource(
            draft.name,
            draft.styleUrl,
            snapshot.revision
          ).send()
      applyDelivery(result.delivery)
      setEditorSource(undefined)
      toast.success(editorSource ? "地图源已更新" : "地图源已添加")
    } catch (mutationError) {
      await handleMutationError(mutationError)
    } finally {
      setPendingAction(null)
    }
  }

  async function confirmActivation() {
    if (!snapshot || !activateSource) return
    setPendingAction(`activate-${activateSource.id}`)
    try {
      const result = await activateAdminFudabaMapSource(
        activateSource.id,
        snapshot.revision
      ).send()
      applyDelivery(result.delivery)
      setActivateSource(null)
      toast.success(`${activateSource.name} 已设为线上地图源`)
    } catch (mutationError) {
      await handleMutationError(mutationError)
      setActivateSource(null)
    } finally {
      setPendingAction(null)
    }
  }

  async function confirmDelete() {
    if (!snapshot || !deleteSource) return
    setPendingAction(`delete-${deleteSource.id}`)
    try {
      const result = await deleteAdminFudabaMapSource(
        deleteSource.id,
        snapshot.revision
      ).send()
      applyDelivery(result.delivery)
      setDeleteSource(null)
      toast.success("地图源已删除")
    } catch (mutationError) {
      await handleMutationError(mutationError)
      setDeleteSource(null)
    } finally {
      setPendingAction(null)
    }
  }

  const activeSource = snapshot?.sources.find(
    (source) => source.id === snapshot.activeSourceId
  )
  const selectedSource = snapshot?.sources.find(
    (source) => source.id === selectedSourceId
  )
  const busy = pendingAction !== null

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

      {snapshot && activeSource ? (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 items-start gap-3 border-b pb-4">
            <ServerCogIcon
              className="mt-0.5 size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">当前地图源</p>
              <p className="mt-1 text-sm font-semibold">{activeSource.name}</p>
              <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
                {activeSource.styleUrl}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-start gap-3 border-b pb-4">
            <CircleCheckIcon
              className="mt-0.5 size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">配置状态</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge>线上激活</Badge>
                <Badge variant="secondary">
                  {snapshot.sources.length} 个地图源
                </Badge>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <AdminPanel
        title="交换地图源"
        description="管理可用样式并指定当前线上配置。"
        icon={CloudCogIcon}
        action={
          <Button
            type="button"
            size="sm"
            disabled={!snapshot || busy}
            onClick={() => setEditorSource(null)}
          >
            <PlusIcon data-icon="inline-start" />
            添加地图源
          </Button>
        }
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
        ) : snapshot?.sources.length ? (
          <div className="flex min-w-0 flex-col gap-5">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>重新读取失败</AlertTitle>
                <AlertDescription>{errorMessage(error)}</AlertDescription>
              </Alert>
            ) : null}
            <fieldset className="flex min-w-0 flex-col divide-y border-y">
              <legend className="sr-only">地图源配置</legend>
              {snapshot.sources.map((source) => {
                const active = source.id === snapshot.activeSourceId
                const selected = source.id === selectedSourceId
                return (
                  <div
                    key={source.id}
                    className={
                      selected
                        ? "flex min-w-0 flex-col gap-3 bg-primary/5 px-3 py-4 sm:flex-row sm:items-center"
                        : "flex min-w-0 flex-col gap-3 px-3 py-4 sm:flex-row sm:items-center"
                    }
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="radio"
                        name="map-source"
                        value={source.id}
                        checked={selected}
                        aria-label={`选择 ${source.name}`}
                        className="mt-1 size-4 shrink-0 accent-primary"
                        onChange={() => setSelectedSourceId(source.id)}
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">
                            {source.name}
                          </span>
                          {active ? <Badge>线上激活</Badge> : null}
                        </span>
                        <span className="mt-1 block font-mono text-xs break-all text-muted-foreground">
                          {source.styleUrl}
                        </span>
                      </span>
                    </label>
                    <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title={`编辑 ${source.name}`}
                        aria-label={`编辑 ${source.name}`}
                        disabled={busy}
                        onClick={() => setEditorSource(source)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title={
                          active
                            ? "当前激活地图源不能删除"
                            : `删除 ${source.name}`
                        }
                        aria-label={`删除 ${source.name}`}
                        disabled={active || busy}
                        onClick={() => setDeleteSource(source)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </fieldset>
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">待激活配置</p>
                <p className="mt-1 truncate text-sm font-medium">
                  {selectedSource?.name ?? "未选择"}
                </p>
              </div>
              <Button
                type="button"
                disabled={
                  !selectedSource ||
                  selectedSource.id === snapshot.activeSourceId ||
                  busy ||
                  loading
                }
                onClick={() => setActivateSource(selectedSource ?? null)}
              >
                <CircleCheckIcon data-icon="inline-start" />
                设为线上源
              </Button>
            </div>
          </div>
        ) : snapshot ? (
          <AdminEmptyState
            icon={CloudCogIcon}
            title="没有地图源"
            description="添加第一条地图源配置后即可激活。"
          />
        ) : null}
      </AdminPanel>

      {editorSource !== undefined ? (
        <MapSourceEditorDialog
          key={editorSource?.id ?? "create"}
          source={editorSource}
          saving={
            pendingAction === "create" ||
            pendingAction === `edit-${editorSource?.id}`
          }
          onOpenChange={(open) => {
            if (!open) setEditorSource(undefined)
          }}
          onSave={saveSource}
        />
      ) : null}

      <AlertDialog
        open={Boolean(activateSource)}
        onOpenChange={(open) => {
          if (!open && !busy) setActivateSource(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>激活此地图源？</AlertDialogTitle>
            <AlertDialogDescription>
              {activateSource?.name} 将立即成为客户端读取的线上地图配置。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={confirmActivation}>
              {busy ? (
                <LoaderCircleIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <CircleCheckIcon data-icon="inline-start" />
              )}
              确认激活
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteSource)}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleteSource(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除地图源？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除 {deleteSource?.name}。此操作不会删除对象存储中的地图文件。
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
              删除地图源
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
