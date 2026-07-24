import { useRequest } from "alova/client"
import {
  ImageIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  createRecommendation,
  deleteRecommendation,
  getRecommendations,
  isApiError,
} from "~/shared/api"
import type { AdminRecommendation } from "~/shared/api"
import { AdminImageUploadField } from "~/pages/admin/components/admin-image-upload-field"
import {
  AdminEmptyState,
  AdminField,
  AdminPageHeader,
  AdminPanel,
  adminControlClass,
} from "~/pages/admin/components/admin-ui"
import { RecommendationRow } from "./components/recommendation-row"

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
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

  async function remove(recommendation: AdminRecommendation) {
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

      <AdminPanel
        title="发布推荐"
        description="填写首页展示信息，封面为空时使用站点默认图。"
        icon={PlusIcon}
        contentClassName="pt-1"
      >
        <form
          className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(16rem,0.7fr)_auto] lg:items-start"
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
          <AdminImageUploadField
            id="recommendation-image"
            name="image"
            label="封面图片"
            description="PNG、JPEG、WebP 或 AVIF。"
            file={image}
            disabled={saving}
            onSelect={setImage}
          />
          <Button type="submit" size="lg" className="lg:mt-6" disabled={saving}>
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
      </AdminPanel>

      <AdminPanel
        title="已发布推荐"
        description={`${data.data.length} 条推荐`}
        icon={ImageIcon}
        contentClassName="pt-1"
      >
        {error ? (
          <Alert>
            <AlertTitle>推荐内容加载失败</AlertTitle>
            <AlertDescription>{errorMessage(error)}</AlertDescription>
          </Alert>
        ) : loading ? (
          <p className="py-6 text-sm text-muted-foreground">正在加载推荐</p>
        ) : data.data.length ? (
          <div>
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
          <AdminEmptyState
            icon={ImageIcon}
            title="还没有推荐内容"
            description="使用上方表单发布第一条首页推荐。"
          />
        )}
      </AdminPanel>
    </div>
  )
}
