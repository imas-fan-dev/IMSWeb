import { LoaderCircleIcon, WandSparklesIcon } from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { AdminFileUploadControl } from "~/pages/admin/components/admin-file-upload-field"
import {
  createWikiStory,
  isApiError,
  parseBilibiliStoryUrl,
  updateWikiStory,
} from "~/shared/api"
import type { WikiAdminStory, WikiStorySubmission } from "~/shared/api"

type StoryForm = {
  category: string
  cardName: string
  subtitle: string
  upName: string
  videoTitle: string
  url: string
  image: File | null
}

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

function storyForm(story: WikiAdminStory | null, category: string): StoryForm {
  if (!story) {
    return {
      category,
      cardName: "",
      subtitle: "",
      upName: "",
      videoTitle: "",
      url: "",
      image: null,
    }
  }
  return {
    category: story.category,
    cardName: story.cardName,
    subtitle: story.subtitle,
    upName: story.upName,
    videoTitle: story.videoTitle,
    url: story.url,
    image: null,
  }
}

export function StoryEditorDialog({
  open,
  story,
  agency,
  idol,
  categories,
  defaultCategory,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  story: WikiAdminStory | null
  agency: string
  idol: string
  categories: string[]
  defaultCategory: string
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [form, setForm] = useState(() => storyForm(story, defaultCategory))
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)

  function setValue<Key extends keyof StoryForm>(
    key: Key,
    value: StoryForm[Key]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function parseBilibili() {
    if (!form.url.trim()) return
    setParsing(true)
    try {
      const result = await parseBilibiliStoryUrl(form.url).send()
      setForm((current) => ({
        ...current,
        url: result.std_url,
        upName: result.up,
        videoTitle: result.title,
      }))
      toast.success("Bilibili 信息已补全")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setParsing(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submission: WikiStorySubmission = {
      agency,
      idol,
      ...form,
    }
    setSaving(true)
    try {
      if (story) {
        await updateWikiStory(story.id, story, submission).send()
      } else {
        await createWikiStory(submission).send()
      }
      toast.success(story ? "剧情链接已更新" : "剧情链接已新增")
      onOpenChange(false)
      onSaved()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <form className="contents" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{story ? "编辑剧情链接" : "新增剧情链接"}</DialogTitle>
            <DialogDescription>
              {agency} · {idol}
              {story
                ? "。分类或卡名变化时，同组卡片会同步重命名。"
                : "。同一卡名可添加多个来源链接。"}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="wiki-story-category">分类</FieldLabel>
                <Input
                  id="wiki-story-category"
                  list="wiki-story-categories"
                  required
                  value={form.category}
                  onChange={(event) => setValue("category", event.target.value)}
                />
                <datalist id="wiki-story-categories">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </Field>
              <Field>
                <FieldLabel htmlFor="wiki-story-card-name">卡片名</FieldLabel>
                <Input
                  id="wiki-story-card-name"
                  required
                  value={form.cardName}
                  onChange={(event) => setValue("cardName", event.target.value)}
                />
                <FieldDescription>
                  保存时自动补齐中文书名括号。
                </FieldDescription>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="wiki-story-url">视频链接</FieldLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="wiki-story-url"
                  type="url"
                  required
                  placeholder="https://www.bilibili.com/video/BV..."
                  value={form.url}
                  onChange={(event) => setValue("url", event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!form.url.trim() || parsing}
                  onClick={() => void parseBilibili()}
                >
                  {parsing ? (
                    <LoaderCircleIcon
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : (
                    <WandSparklesIcon data-icon="inline-start" />
                  )}
                  解析
                </Button>
              </div>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="wiki-story-up-name">投稿者</FieldLabel>
                <Input
                  id="wiki-story-up-name"
                  required
                  value={form.upName}
                  onChange={(event) => setValue("upName", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="wiki-story-video-title">
                  视频标题
                </FieldLabel>
                <Input
                  id="wiki-story-video-title"
                  required
                  value={form.videoTitle}
                  onChange={(event) =>
                    setValue("videoTitle", event.target.value)
                  }
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="wiki-story-subtitle">剧情备注</FieldLabel>
                <Input
                  id="wiki-story-subtitle"
                  value={form.subtitle}
                  onChange={(event) => setValue("subtitle", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="wiki-story-image">卡片图片</FieldLabel>
                <AdminFileUploadControl
                  id="wiki-story-image"
                  accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                  emptyTitle={
                    story?.imageFile ? "保留当前卡片图片" : "选择卡片图片"
                  }
                  emptyDetail="PNG、JPEG、WebP、AVIF 或 GIF"
                  fileKind="卡片图片"
                  file={form.image}
                  disabled={saving}
                  onSelect={(image) => setValue("image", image)}
                />
                <FieldDescription>
                  {story?.imageFile
                    ? "不选择文件会保留当前图片。"
                    : "可选；上传后由对象存储统一提供。"}
                </FieldDescription>
              </Field>
            </div>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              取消
            </DialogClose>
            <Button type="submit" disabled={saving || parsing}>
              {saving ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : null}
              {story ? "保存修改" : "新增链接"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
