import { useRequest } from "alova/client"
import {
  ArrowUpRightIcon,
  CloudUploadIcon,
  ImageIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import { AdminFileUploadField } from "~/components/admin/admin-file-upload-field"
import {
  deleteIdolMedia,
  getIdolMediaCatalog,
  isApiError,
  uploadIdolMedia,
} from "~/lib/api"
import type { IdolMediaCatalog, IdolMediaItem } from "~/lib/api"
import {
  AdminEmptyState,
  AdminField,
  AdminPageHeader,
  AdminPanel,
  AdminStatus,
  adminControlClass,
} from "~/components/admin/admin-ui"

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

function sourceLabel(source: IdolMediaItem["source"]) {
  if (source === "object-storage") return "对象存储"
  return "未关联"
}

export function StoryMediaManager() {
  const {
    data,
    loading,
    error,
    send: refresh,
    onError,
  } = useRequest(getIdolMediaCatalog(), {
    initialData: { status: "success" as const, agencies: [] },
  })
  onError(() => undefined)
  const catalog = data as IdolMediaCatalog
  const [agencyCode, setAgencyCode] = useState("")
  const [idolName, setIdolName] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const selectedAgency =
    catalog.agencies.find((agency) => agency.code === agencyCode) ??
    catalog.agencies[0]
  const selectedIdol =
    selectedAgency?.idols.find((idol) => idol.name === idolName) ??
    selectedAgency?.idols[0]

  const localPreview = useMemo(
    () => (file ? URL.createObjectURL(file) : ""),
    [file]
  )

  useEffect(
    () => () => {
      if (localPreview) URL.revokeObjectURL(localPreview)
    },
    [localPreview]
  )

  function chooseAgency(code: string) {
    const agency = catalog.agencies.find((candidate) => candidate.code === code)
    setAgencyCode(code)
    setIdolName(agency?.idols[0]?.name ?? "")
    setFile(null)
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedAgency || !selectedIdol || !file) return
    setSaving(true)
    try {
      await uploadIdolMedia(selectedAgency.name, selectedIdol.name, file).send()
      setFile(null)
      await refresh()
      toast.success(`${selectedIdol.name}的角色素材已保存到对象存储`)
    } catch (uploadError) {
      toast.error(errorMessage(uploadError))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!selectedAgency || !selectedIdol) return
    if (!window.confirm(`移除${selectedIdol.name}的对象存储素材吗？`)) return
    setDeleting(true)
    try {
      await deleteIdolMedia(selectedAgency.name, selectedIdol.name).send()
      setFile(null)
      await refresh()
      toast.success("对象存储素材已移除")
    } catch (deleteError) {
      toast.error(errorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  const imageUrl = localPreview || selectedIdol?.imageUrl || ""
  const imageFit = localPreview ? "cover" : (selectedIdol?.imageFit ?? "cover")
  const storyUrl =
    selectedAgency && selectedIdol
      ? `/story?agency=${encodeURIComponent(selectedAgency.name)}&idol=${encodeURIComponent(selectedIdol.name)}`
      : "/wiki/"

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="STORY ARCHIVE"
        title="剧情与角色素材"
        description="管理剧情入口所使用的角色图片；上传内容由对象存储统一提供。"
        actions={
          <Button type="button" variant="outline" onClick={() => refresh()}>
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      {error ? (
        <Alert>
          <AlertTitle>角色素材加载失败</AlertTitle>
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      ) : loading && !catalog.agencies.length ? (
        <AdminPanel
          title="角色素材"
          description="正在读取事务所与角色目录。"
          icon={ImageIcon}
        >
          <p className="py-8 text-sm text-muted-foreground">正在加载角色目录</p>
        </AdminPanel>
      ) : !catalog.agencies.length ? (
        <AdminEmptyState
          icon={ImageIcon}
          title="还没有角色目录"
          description="确认 Wiki 偶像数据已经初始化后再刷新。"
        />
      ) : (
        <AdminPanel
          title="角色素材"
          description="选择角色、预览当前素材，并上传对象存储版本。"
          icon={ImageIcon}
          contentClassName="grid gap-8 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]"
        >
          <div className="min-w-0">
            <div className="aspect-square w-full overflow-hidden rounded-lg border bg-muted">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={selectedIdol?.name ?? ""}
                  className="size-full"
                  style={{ objectFit: imageFit }}
                />
              ) : (
                <span className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageIcon className="size-8" aria-hidden="true" />
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {selectedIdol?.name ?? "暂无角色"}
                </p>
                {selectedIdol ? (
                  <div className="mt-1">
                    <AdminStatus>
                      {sourceLabel(selectedIdol.source)}
                    </AdminStatus>
                  </div>
                ) : null}
              </div>
              <a
                href={storyUrl}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                打开剧情档案
                <ArrowUpRightIcon className="size-3" aria-hidden="true" />
              </a>
            </div>
          </div>

          <form className="flex min-w-0 flex-col gap-6" onSubmit={upload}>
            <div className="grid gap-5 sm:grid-cols-2">
              <AdminField label="事务所" htmlFor="story-media-agency">
                <select
                  id="story-media-agency"
                  className={adminControlClass}
                  value={selectedAgency?.code ?? ""}
                  onChange={(event) => chooseAgency(event.target.value)}
                >
                  {catalog.agencies.map((agency) => (
                    <option key={agency.code} value={agency.code}>
                      {agency.name}
                    </option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="角色" htmlFor="story-media-idol">
                <select
                  id="story-media-idol"
                  className={adminControlClass}
                  value={selectedIdol?.name ?? ""}
                  onChange={(event) => {
                    setIdolName(event.target.value)
                    setFile(null)
                  }}
                >
                  {(selectedAgency?.idols ?? []).map((idol) => (
                    <option key={idol.name} value={idol.name}>
                      {idol.name}
                    </option>
                  ))}
                </select>
              </AdminField>
            </div>

            <Separator />

            <AdminFileUploadField
              id="story-media-image"
              name="image"
              compact
              label="角色图片"
              description="PNG、JPEG、WebP、AVIF 或 GIF；保存后由对象存储统一提供。"
              accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
              emptyTitle="选择角色图片"
              emptyDetail="PNG、JPEG、WebP、AVIF 或 GIF"
              fileKind="角色图片"
              file={file}
              disabled={!selectedIdol}
              uploading={saving}
              required
              onSelect={setFile}
            />

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={!file || saving || !selectedIdol}>
                {saving ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <CloudUploadIcon data-icon="inline-start" />
                )}
                保存到对象存储
              </Button>
              {selectedIdol?.source === "object-storage" ? (
                <Button
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
                  移除存储版本
                </Button>
              ) : null}
            </div>
          </form>
        </AdminPanel>
      )}
    </div>
  )
}
