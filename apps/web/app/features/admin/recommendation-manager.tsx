import { useRequest } from "alova/client"
import {
  ArrowUpRightIcon,
  ImageIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import { isApiError } from "~/shared/api"
import {
  createRecommendation,
  deleteRecommendation,
  getRecommendations,
} from "./api"
import type { Recommendation } from "./api"
import { AdminField, AdminPageHeader, adminControlClass } from "./admin-ui"

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

function formatDate(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date)
}

function RecommendationRow({
  recommendation,
  deleting,
  onDelete,
}: {
  recommendation: Recommendation
  deleting: boolean
  onDelete: () => void
}) {
  return (
    <article className="grid grid-cols-[5rem_minmax(0,1fr)] gap-4 border-b py-5 last:border-b-0 sm:grid-cols-[6rem_minmax(0,1fr)_auto]">
      <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
        {recommendation.thumbnail || recommendation.image ? (
          <img
            src={recommendation.thumbnail || recommendation.image || ""}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <ImageIcon className="size-5" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0">
        <h3 className="line-clamp-2 text-sm font-semibold">
          {recommendation.title}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {recommendation.author || "未知发布者"}
          {recommendation.date ? ` · ${formatDate(recommendation.date)}` : ""}
        </p>
        <a
          href={recommendation.content}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
        >
          <span className="truncate">{recommendation.content}</span>
          <ArrowUpRightIcon className="size-3 shrink-0" aria-hidden="true" />
        </a>
      </div>
      <div className="col-span-2 flex justify-end sm:col-span-1 sm:self-center">
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

export function RecommendationManager() {
  const {
    data,
    loading,
    error,
    send: refresh,
    onError,
  } = useRequest(getRecommendations(), {
    initialData: { success: true as const, data: [] },
  })
  onError(() => undefined)
  const [title, setTitle] = useState("")
  const [url, setUrl] = useState("")
  const [image, setImage] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    setSaving(true)
    try {
      const form = new FormData()
      form.append("title", title)
      form.append("content", url)
      if (image) form.append("image", image)
      await createRecommendation(form).send()
      setTitle("")
      setUrl("")
      setImage(null)
      const imageInput = formElement.elements.namedItem(
        "image"
      ) as HTMLInputElement | null
      if (imageInput) imageInput.value = ""
      await refresh()
      toast.success("推荐已发布")
    } catch (saveError) {
      toast.error(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function remove(recommendation: Recommendation) {
    if (!window.confirm(`确定删除“${recommendation.title}”吗？`)) return
    setDeletingId(recommendation.id)
    try {
      await deleteRecommendation(recommendation.id).send()
      await refresh()
      toast.success("推荐已删除")
    } catch (deleteError) {
      toast.error(errorMessage(deleteError))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="RECOMMENDATION DESK"
        title="向您推荐"
        description="发布首页推荐条目，并管理跳转链接与封面图片。"
        actions={
          <Button type="button" variant="outline" onClick={() => refresh()}>
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      <form
        className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(16rem,0.7fr)_auto] lg:items-end"
        onSubmit={submit}
      >
        <AdminField label="推荐标题" htmlFor="recommendation-title">
          <input
            id="recommendation-title"
            className={adminControlClass}
            maxLength={300}
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </AdminField>
        <AdminField label="跳转链接" htmlFor="recommendation-url">
          <input
            id="recommendation-url"
            type="url"
            className={adminControlClass}
            placeholder="https://"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </AdminField>
        <AdminField
          label="封面图片"
          htmlFor="recommendation-image"
          description="不上传时使用默认占位。"
        >
          <input
            id="recommendation-image"
            name="image"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            className={adminControlClass}
            onChange={(event) => setImage(event.target.files?.[0] ?? null)}
          />
        </AdminField>
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin"
            />
          ) : (
            <PlusIcon data-icon="inline-start" />
          )}
          发布推荐
        </Button>
      </form>

      <Separator />

      <section aria-labelledby="recommendation-list-title">
        <div>
          <h2 id="recommendation-list-title" className="text-lg font-semibold">
            已发布推荐
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.data.length} 条推荐
          </p>
        </div>
        {error ? (
          <Alert className="mt-5">
            <AlertTitle>推荐内容加载失败</AlertTitle>
            <AlertDescription>{errorMessage(error)}</AlertDescription>
          </Alert>
        ) : loading ? (
          <p className="mt-5 text-sm text-muted-foreground">正在加载推荐</p>
        ) : data.data.length ? (
          <div className="mt-3">
            {data.data.map((recommendation) => (
              <RecommendationRow
                key={recommendation.id}
                recommendation={recommendation}
                deleting={deletingId === recommendation.id}
                onDelete={() => void remove(recommendation)}
              />
            ))}
          </div>
        ) : (
          <p className="mt-5 border-y py-8 text-sm text-muted-foreground">
            还没有推荐内容。
          </p>
        )}
      </section>
    </div>
  )
}
