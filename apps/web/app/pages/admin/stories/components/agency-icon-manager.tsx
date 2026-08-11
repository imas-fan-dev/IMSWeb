import { useRequest } from "alova/client"
import {
  CloudUploadIcon,
  ImageIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  ShapesIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
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
import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import { AdminImageUploadField } from "~/components/admin/admin-image-upload-field"
import {
  AdminEmptyState,
  AdminField,
  AdminPageHeader,
  AdminPanel,
  AdminStatus,
  adminControlClass,
} from "~/components/admin/admin-ui"
import {
  deleteWikiAgencyIcon,
  getAdminWikiCatalog,
  isApiError,
  uploadWikiAgencyIcon,
} from "~/lib/api"
import type { WikiAdminCatalog } from "~/lib/api"

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

export function AgencyIconManager() {
  const {
    data,
    loading,
    error,
    send: refresh,
    onError,
  } = useRequest(getAdminWikiCatalog(), {
    initialData: { status: "success" as const, agencies: [] },
  })
  onError(() => undefined)
  const catalog = data as WikiAdminCatalog
  const [agencyCode, setAgencyCode] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [localPreview, setLocalPreview] = useState("")
  const localPreviewRef = useRef("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const selectedAgency =
    catalog.agencies.find((agency) => agency.code === agencyCode) ??
    catalog.agencies[0]
  useEffect(
    () => () => {
      if (localPreviewRef.current) {
        URL.revokeObjectURL(localPreviewRef.current)
      }
    },
    []
  )

  function selectFile(nextFile: File | null) {
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current)
    }
    const preview = nextFile ? URL.createObjectURL(nextFile) : ""
    localPreviewRef.current = preview
    setLocalPreview(preview)
    setFile(nextFile)
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedAgency || !file) return
    setSaving(true)
    try {
      await uploadWikiAgencyIcon(selectedAgency.name, file).send()
      selectFile(null)
      await refresh()
      toast.success(`${selectedAgency.name}系列图标已保存`)
    } catch (uploadError) {
      toast.error(errorMessage(uploadError))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!selectedAgency?.iconUrl) return
    setDeleting(true)
    try {
      await deleteWikiAgencyIcon(selectedAgency.name).send()
      selectFile(null)
      await refresh()
      setDeleteOpen(false)
      toast.success("系列图标已移除")
    } catch (deleteError) {
      toast.error(errorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  const imageUrl = localPreview || selectedAgency?.iconUrl || ""

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="SERIES IDENTITY"
        title="Wiki 系列图标"
        description="上传后会更新公开剧情档案中的系列图标。"
        actions={
          <Button type="button" variant="outline" onClick={() => refresh()}>
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      {error ? (
        <Alert>
          <AlertTitle>系列目录加载失败</AlertTitle>
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      ) : loading && !catalog.agencies.length ? (
        <AdminPanel
          title="系列图标"
          description="正在读取 Wiki 系列目录。"
          icon={ShapesIcon}
        >
          <p className="py-8 text-sm text-muted-foreground">正在加载系列目录</p>
        </AdminPanel>
      ) : !catalog.agencies.length ? (
        <AdminEmptyState
          icon={ShapesIcon}
          title="还没有可管理的系列"
          description="确认 Wiki 系列数据已经初始化后再刷新。"
        />
      ) : (
        <AdminPanel
          title="系列识别图标"
          description="选择系列、检查当前自定义图标，并上传对象存储版本。"
          icon={ShapesIcon}
          contentClassName="grid gap-8 lg:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]"
        >
          <div className="min-w-0">
            <div className="aspect-square w-full overflow-hidden rounded-lg border bg-muted/40">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={`${selectedAgency?.name ?? ""}系列图标`}
                  className="size-full object-contain p-6"
                />
              ) : (
                <span className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageIcon className="size-8" aria-hidden="true" />
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {selectedAgency?.name ?? "暂无系列"}
                </p>
                <div className="mt-1">
                  <AdminStatus>
                    {selectedAgency?.iconUrl ? "已设置" : "未设置"}
                  </AdminStatus>
                </div>
              </div>
              {selectedAgency ? (
                <span
                  className="size-4 shrink-0 rounded-sm border"
                  style={{ backgroundColor: selectedAgency.color ?? undefined }}
                  aria-label={`${selectedAgency.name}系列色`}
                />
              ) : null}
            </div>
          </div>

          <form className="flex min-w-0 flex-col gap-6" onSubmit={upload}>
            <AdminField label="系列" htmlFor="wiki-agency-icon-series">
              <select
                id="wiki-agency-icon-series"
                className={adminControlClass}
                value={selectedAgency?.code ?? ""}
                onChange={(event) => {
                  setAgencyCode(event.target.value)
                  selectFile(null)
                }}
              >
                {catalog.agencies.map((agency) => (
                  <option key={agency.code} value={agency.code}>
                    {agency.name}
                  </option>
                ))}
              </select>
            </AdminField>

            <Separator />

            <AdminImageUploadField
              id="wiki-agency-icon-image"
              name="image"
              label="系列图标"
              description="建议使用透明背景的方形 PNG、WebP 或 AVIF；系统会统一转换为 WebP。"
              file={file}
              disabled={!selectedAgency}
              uploading={saving}
              onSelect={selectFile}
            />

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={!file || saving}>
                {saving ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <CloudUploadIcon data-icon="inline-start" />
                )}
                保存系列图标
              </Button>
              {selectedAgency?.iconUrl ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleting}
                  onClick={() => setDeleteOpen(true)}
                >
                  {deleting ? (
                    <LoaderCircleIcon
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : (
                    <Trash2Icon data-icon="inline-start" />
                  )}
                  移除图标
                </Button>
              ) : null}
            </div>
          </form>
        </AdminPanel>
      )}

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteOpen(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>移除自定义系列图标？</AlertDialogTitle>
            <AlertDialogDescription>
              “{selectedAgency?.name ?? ""}”将不再显示系列图标。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
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
              确认移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
