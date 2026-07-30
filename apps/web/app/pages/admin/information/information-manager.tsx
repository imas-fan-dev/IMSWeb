import { useRequest } from "alova/client"
import {
  LinkIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { CoverImagePreview } from "~/components/shared/cover-image-preview"
import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import { buildInformationHtmlDocument } from "~/pages/information/html-document"
import {
  createInformation,
  deleteInformation,
  deleteInformationAsset,
  getAdminInformation,
  updateInformation,
  uploadInformationAsset,
} from "~/lib/api"
import type {
  AdminInformationCard,
  InformationCategory,
  InformationContentType,
  InformationSubmission,
} from "~/lib/api"
import { AdminImageUploadField } from "~/pages/admin/components/admin-image-upload-field"
import {
  AdminField,
  AdminPageHeader,
  AdminPanel,
  adminControlClass,
  adminTextareaClass,
} from "~/pages/admin/components/admin-ui"

import {
  InformationAssetsPanel,
  InformationPreview,
  PublishedInformationPanel,
} from "./components/information-panels"
import {
  contentTypeLabel,
  emptyInformationSubmission,
  informationErrorMessage,
} from "./information-model"

export function meta() {
  return [{ title: "活动内容管理 | IMSWeb" }]
}

export function InformationManager() {
  const {
    data,
    loading,
    error,
    send: refresh,
    onError,
  } = useRequest(getAdminInformation(), {
    initialData: { version: 1, cards: [], assets: [] },
  })
  onError(() => undefined)
  const [submission, setSubmission] = useState<InformationSubmission>(
    emptyInformationSubmission
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)
  const [bodyImageUploading, setBodyImageUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [assetDeleting, setAssetDeleting] = useState<string | null>(null)

  const previewDocument = useMemo(
    () => buildInformationHtmlDocument(submission.title, submission.html),
    [submission.html, submission.title]
  )

  function updateSubmission<Key extends keyof InformationSubmission>(
    key: Key,
    value: InformationSubmission[Key]
  ) {
    setSubmission((current) => ({ ...current, [key]: value }))
  }

  function resetForm() {
    setSubmission(emptyInformationSubmission)
    setEditingId(null)
  }

  function editCard(card: AdminInformationCard) {
    setEditingId(card.id)
    setSubmission({
      title: card.title,
      category: card.category,
      contentType: card.contentType,
      externalUrl: card.contentType === "external" ? card.link : "",
      html: card.html ?? "",
      image: card.image,
    })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function uploadAsset(file: File, usage: "cover" | "body") {
    const setUploading =
      usage === "cover" ? setCoverUploading : setBodyImageUploading
    setUploading(true)
    try {
      const result = await uploadInformationAsset(file).send()
      if (usage === "cover") {
        updateSubmission("image", result.url)
      } else {
        setSubmission((current) => ({
          ...current,
          html: `${current.html}${current.html ? "\n" : ""}<img src="${result.url}" alt="">`,
        }))
      }
      await refresh()
      toast.success(usage === "cover" ? "封面已托管" : "正文图片已插入")
    } catch (uploadError) {
      toast.error(informationErrorMessage(uploadError))
    } finally {
      setUploading(false)
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      if (editingId) {
        await updateInformation(editingId, submission).send()
        toast.success("活动内容已更新")
      } else {
        await createInformation(submission).send()
        toast.success("活动内容已发布")
      }
      resetForm()
      await refresh()
    } catch (saveError) {
      toast.error(informationErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function removeCard(card: AdminInformationCard) {
    if (!window.confirm(`确定删除“${card.title}”吗？`)) return
    setDeletingId(card.id)
    try {
      await deleteInformation(card.id).send()
      if (editingId === card.id) resetForm()
      await refresh()
      toast.success("活动内容已删除")
    } catch (deleteError) {
      toast.error(informationErrorMessage(deleteError))
    } finally {
      setDeletingId(null)
    }
  }

  async function removeAsset(url: string) {
    if (!window.confirm("确定删除这张托管图片吗？")) return
    setAssetDeleting(url)
    try {
      await deleteInformationAsset(url).send()
      await refresh()
      toast.success("托管图片已删除")
    } catch (deleteError) {
      toast.error(informationErrorMessage(deleteError))
    } finally {
      setAssetDeleting(null)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="CONTENT DESK"
        title="活动内容"
        description="发布活动资讯与同人活动，统一管理外部链接、站内 HTML 和正文图片。"
        actions={
          <Button type="button" variant="outline" onClick={() => refresh()}>
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)]">
        <form className="min-w-0" onSubmit={submit}>
          <AdminPanel
            title={editingId ? "编辑活动内容" : "添加活动内容"}
            description={
              editingId ? `内容 ID：${editingId}` : "新内容将显示在首页活动区"
            }
            icon={editingId ? PencilIcon : PlusIcon}
            action={
              editingId ? (
                <Button type="button" variant="ghost" onClick={resetForm}>
                  <XIcon data-icon="inline-start" />
                  取消编辑
                </Button>
              ) : null
            }
            contentClassName="flex flex-col gap-6"
          >
            <AdminField label="标题" htmlFor="information-title">
              <input
                id="information-title"
                className={adminControlClass}
                maxLength={200}
                required
                value={submission.title}
                onChange={(event) =>
                  updateSubmission("title", event.target.value)
                }
              />
            </AdminField>

            <div className="grid gap-5 sm:grid-cols-2">
              <AdminField label="活动分类" htmlFor="information-category">
                <select
                  id="information-category"
                  className={adminControlClass}
                  value={submission.category}
                  onChange={(event) =>
                    updateSubmission(
                      "category",
                      event.target.value as InformationCategory
                    )
                  }
                >
                  <option value="activity">活动资讯</option>
                  <option value="fan">同人活动</option>
                </select>
              </AdminField>

              <AdminField label="内容类型">
                <ToggleGroup
                  value={[submission.contentType]}
                  variant="outline"
                  spacing={0}
                  className="w-full"
                  aria-label="内容类型"
                  onValueChange={(values) => {
                    const contentType = values[0] as
                      | InformationContentType
                      | undefined
                    if (contentType) {
                      updateSubmission("contentType", contentType)
                    }
                  }}
                >
                  {(["external", "html"] as InformationContentType[]).map(
                    (contentType) => (
                      <ToggleGroupItem
                        key={contentType}
                        value={contentType}
                        className="flex-1"
                      >
                        {contentTypeLabel(contentType)}
                      </ToggleGroupItem>
                    )
                  )}
                </ToggleGroup>
              </AdminField>
            </div>

            <AdminImageUploadField
              id="information-cover"
              label="封面图片"
              description="PNG、JPEG、WebP 或 AVIF，上传后转换为 WebP 并托管。"
              uploading={coverUploading}
              resetAfterSelect
              onSelect={(file) => {
                if (file) void uploadAsset(file, "cover")
              }}
            />
            {submission.image ? (
              <div className="flex min-w-0 items-center gap-3 border-l-2 border-primary pl-3">
                <CoverImagePreview
                  src={submission.image}
                  alt="当前封面"
                  className="h-16 w-24"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium">当前封面</p>
                  <code className="mt-1 block truncate text-xs text-muted-foreground">
                    {submission.image}
                  </code>
                </div>
              </div>
            ) : null}

            {submission.contentType === "external" ? (
              <AdminField label="外部链接" htmlFor="information-link">
                <div className="relative">
                  <LinkIcon
                    className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    id="information-link"
                    type="url"
                    className={`${adminControlClass} pl-9`}
                    placeholder="https://"
                    required
                    value={submission.externalUrl}
                    onChange={(event) =>
                      updateSubmission("externalUrl", event.target.value)
                    }
                  />
                </div>
              </AdminField>
            ) : (
              <>
                <AdminField
                  label="HTML 正文"
                  htmlFor="information-html"
                  description="脚本、表单和外部资源不会在站内详情页执行。"
                >
                  <textarea
                    id="information-html"
                    className={`${adminTextareaClass} min-h-80`}
                    required
                    value={submission.html}
                    onChange={(event) =>
                      updateSubmission("html", event.target.value)
                    }
                  />
                </AdminField>
                <AdminImageUploadField
                  id="information-body-image"
                  label="正文图片"
                  description="上传成功后会把图片标签插入 HTML 末尾。"
                  uploading={bodyImageUploading}
                  resetAfterSelect
                  onSelect={(file) => {
                    if (file) void uploadAsset(file, "body")
                  }}
                />
              </>
            )}

            <Separator />

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="submit"
                size="lg"
                disabled={saving || coverUploading || !submission.image}
              >
                {saving ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : editingId ? (
                  <PencilIcon data-icon="inline-start" />
                ) : (
                  <PlusIcon data-icon="inline-start" />
                )}
                {editingId ? "保存活动内容" : "发布活动内容"}
              </Button>
            </div>
          </AdminPanel>
        </form>

        <InformationPreview
          document={previewDocument}
          submission={submission}
        />
      </div>

      <PublishedInformationPanel
        cards={data.cards}
        deletingId={deletingId}
        error={error}
        loading={loading}
        onEdit={editCard}
        onDelete={(card) => void removeCard(card)}
      />

      <InformationAssetsPanel
        assets={data.assets}
        deletingUrl={assetDeleting}
        onDelete={(url) => void removeAsset(url)}
      />
    </div>
  )
}

export default InformationManager
