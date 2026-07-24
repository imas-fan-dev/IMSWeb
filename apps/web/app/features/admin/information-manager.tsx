import { useRequest } from "alova/client"
import {
  ArrowUpRightIcon,
  CalendarDaysIcon,
  FileCode2Icon,
  ImagePlusIcon,
  ImagesIcon,
  LinkIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import { buildInformationHtmlDocument } from "~/features/information/html-document"
import { isApiError } from "~/shared/api"
import {
  createInformation,
  deleteInformation,
  deleteInformationAsset,
  getAdminInformation,
  updateInformation,
  uploadInformationAsset,
} from "./api"
import type {
  AdminInformationCard,
  InformationCategory,
  InformationContentType,
  InformationSubmission,
} from "./api"
import {
  AdminField,
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminStatus,
  adminControlClass,
  adminTextareaClass,
} from "./admin-ui"

const emptySubmission: InformationSubmission = {
  title: "",
  category: "activity",
  contentType: "external",
  externalUrl: "",
  html: "",
  image: "",
}

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

function categoryLabel(category: InformationCategory) {
  return category === "activity" ? "活动资讯" : "同人活动"
}

function contentTypeLabel(contentType: InformationContentType) {
  return contentType === "external" ? "外部链接" : "站内 HTML"
}

function InformationRow({
  card,
  onEdit,
  onDelete,
  deleting,
}: {
  card: AdminInformationCard
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  return (
    <article className="grid grid-cols-[6rem_minmax(0,1fr)] gap-4 border-b py-5 last:border-b-0 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto]">
      <img
        src={card.image}
        alt=""
        className="aspect-[16/10] w-full rounded-md bg-muted object-cover"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <AdminStatus>{categoryLabel(card.category)}</AdminStatus>
          <AdminStatus>{contentTypeLabel(card.contentType)}</AdminStatus>
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold">
          {card.title}
        </h3>
        <a
          href={card.link}
          target={card.contentType === "external" ? "_blank" : undefined}
          rel={card.contentType === "external" ? "noreferrer" : undefined}
          className="mt-2 inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
        >
          <span className="truncate">{card.link}</span>
          <ArrowUpRightIcon className="size-3 shrink-0" aria-hidden="true" />
        </a>
      </div>
      <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1 sm:self-center">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <PencilIcon data-icon="inline-start" />
          编辑
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={deleting}
          onClick={onDelete}
        >
          {deleting ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin"
            />
          ) : (
            <Trash2Icon data-icon="inline-start" />
          )}
          删除
        </Button>
      </div>
    </article>
  )
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
  const [submission, setSubmission] =
    useState<InformationSubmission>(emptySubmission)
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
    setSubmission(emptySubmission)
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
      toast.error(errorMessage(uploadError))
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
      toast.error(errorMessage(saveError))
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
      toast.error(errorMessage(deleteError))
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
      toast.error(errorMessage(deleteError))
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

            <AdminField
              label="封面图片"
              htmlFor="information-cover"
              description="PNG、JPEG 或 WebP，上传后转换为 WebP 并托管。"
            >
              <input
                id="information-cover"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif"
                className={adminControlClass}
                disabled={coverUploading}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void uploadAsset(file, "cover")
                  event.target.value = ""
                }}
              />
              {coverUploading ? (
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <LoaderCircleIcon
                    className="size-3 animate-spin"
                    aria-hidden="true"
                  />
                  正在托管封面
                </span>
              ) : null}
              {submission.image ? (
                <div className="flex items-center gap-3 border-l-2 border-primary pl-3">
                  <img
                    src={submission.image}
                    alt="封面预览"
                    className="h-16 w-24 rounded-md object-cover"
                  />
                  <code className="min-w-0 flex-1 truncate text-xs">
                    {submission.image}
                  </code>
                </div>
              ) : null}
            </AdminField>

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
                <AdminField
                  label="正文图片"
                  htmlFor="information-body-image"
                  description="上传成功后会把图片标签插入 HTML 末尾。"
                >
                  <input
                    id="information-body-image"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/avif"
                    className={adminControlClass}
                    disabled={bodyImageUploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void uploadAsset(file, "body")
                      event.target.value = ""
                    }}
                  />
                </AdminField>
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

        <aside className="min-w-0">
          <AdminPanel
            title="内容预览"
            description={
              submission.contentType === "html"
                ? "以站内安全策略渲染 HTML。"
                : "首页活动卡片的展示效果。"
            }
            icon={submission.contentType === "html" ? FileCode2Icon : LinkIcon}
            className="sticky top-24"
          >
            {submission.contentType === "html" ? (
              <iframe
                title="活动 HTML 预览"
                sandbox=""
                srcDoc={previewDocument}
                className="h-[36rem] w-full rounded-lg border bg-background"
              />
            ) : (
              <div className="overflow-hidden rounded-lg border bg-background">
                <div className="aspect-[16/9] bg-muted">
                  {submission.image ? (
                    <img
                      src={submission.image}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <ImagePlusIcon className="size-8" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-xs font-medium text-primary">
                    {categoryLabel(submission.category)}
                  </p>
                  <p className="mt-2 font-semibold">
                    {submission.title || "活动标题"}
                  </p>
                </div>
              </div>
            )}
          </AdminPanel>
        </aside>
      </div>

      <AdminPanel
        title="已发布活动内容"
        description={`${data.cards.length} 条内容`}
        icon={CalendarDaysIcon}
        contentClassName="pt-1"
      >
        {error ? (
          <Alert>
            <AlertTitle>活动内容加载失败</AlertTitle>
            <AlertDescription>{errorMessage(error)}</AlertDescription>
          </Alert>
        ) : loading ? (
          <p className="py-6 text-sm text-muted-foreground">正在加载内容</p>
        ) : data.cards.length ? (
          <div>
            {data.cards.map((card) => (
              <InformationRow
                key={card.id}
                card={card}
                deleting={deletingId === card.id}
                onEdit={() => editCard(card)}
                onDelete={() => void removeCard(card)}
              />
            ))}
          </div>
        ) : (
          <AdminEmptyState
            icon={CalendarDaysIcon}
            title="还没有活动内容"
            description="使用上方表单发布第一条活动资讯或同人活动。"
          />
        )}
      </AdminPanel>

      <AdminPanel
        title="托管图片"
        description={`${data.assets.length} 个对象`}
        icon={ImagesIcon}
      >
        {data.assets.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.assets.map((url) => (
              <article key={url} className="min-w-0">
                <img
                  src={url}
                  alt=""
                  className="aspect-[16/9] w-full rounded-lg border bg-muted object-cover"
                />
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="删除托管图片"
                    title="删除托管图片"
                    disabled={assetDeleting === url}
                    onClick={() => void removeAsset(url)}
                  >
                    {assetDeleting === url ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : (
                      <Trash2Icon />
                    )}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <AdminEmptyState
            icon={ImagesIcon}
            title="还没有托管图片"
            description="上传封面或正文图片后，资源会显示在这里。"
          />
        )}
      </AdminPanel>
    </div>
  )
}
