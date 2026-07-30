import { LoaderCircleIcon } from "lucide-react"
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
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  createWikiCategory,
  isApiError,
  updateWikiCategory,
  type WikiAdminStories,
} from "~/lib/api"

type WikiAdminCategory = WikiAdminStories["categories"][number]

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "保存失败，请稍后重试"
}

export function StoryCategoryEditorDialog({
  open,
  agencyId,
  idolId,
  agencyName,
  idolName,
  category,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  agencyId: number
  idolId: number
  agencyName: string
  idolName: string
  category: WikiAdminCategory | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = useState(category?.name ?? "")
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      if (category) {
        await updateWikiCategory({
          categoryId: category.id,
          agencyId,
          idolId,
          name,
          expectedName: category.name,
        }).send()
      } else {
        await createWikiCategory({ agencyId, idolId, name }).send()
      }
      toast.success(category ? "剧情分类已更新" : "剧情分类已新增")
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
      <DialogContent className="sm:max-w-lg">
        <form className="contents" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {category ? "编辑剧情分类" : "新增剧情分类"}
            </DialogTitle>
            <DialogDescription>
              {agencyName} · {idolName}
              {category
                ? "。分类名称属于企划级定义，将同步到本企划所有引用位置；素材目录保持不变。"
                : "。新分类会加入当前内容页的大纲；若企划已有同名分类，将复用其素材目录。"}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="wiki-story-category-name">
                分类名称
              </FieldLabel>
              <Input
                id="wiki-story-category-name"
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              取消
            </DialogClose>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : null}
              {category ? "保存分类" : "新增分类"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
