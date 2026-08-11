import {
  LinkIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"
import { useMemo, type FormEvent } from "react"

import { CoverImagePreview } from "~/components/shared/cover-image-preview"
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
import { Separator } from "~/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import type {
  InformationCategory,
  InformationContentType,
  InformationSubmission,
} from "~/lib/api"
import { AdminImageUploadField } from "~/pages/admin/components/admin-image-upload-field"
import {
  AdminField,
  adminControlClass,
  adminTextareaClass,
} from "~/pages/admin/components/admin-ui"
import { buildInformationHtmlDocument } from "~/pages/information/html-document"

import {
  contentTypeLabel,
  restoreInformationBodyAssets,
  type InformationBodyAsset,
} from "../information-model"
import { InformationPreview } from "./information-panels"

export function InformationEditorDialog({
  open,
  editing,
  submission,
  bodyAssets,
  saving,
  coverUploading,
  bodyImageUploading,
  onOpenChange,
  onSubmit,
  onUpdate,
  onUpload,
}: {
  open: boolean
  editing: boolean
  submission: InformationSubmission
  bodyAssets: InformationBodyAsset[]
  saving: boolean
  coverUploading: boolean
  bodyImageUploading: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
  onUpdate: <Key extends keyof InformationSubmission>(
    key: Key,
    value: InformationSubmission[Key]
  ) => void
  onUpload: (file: File, usage: "cover" | "body") => void
}) {
  const busy = saving || coverUploading || bodyImageUploading
  const previewDocument = useMemo(
    () =>
      buildInformationHtmlDocument(
        submission.title,
        restoreInformationBodyAssets(submission.html, bodyAssets)
      ),
    [bodyAssets, submission.html, submission.title]
  )

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-5xl"
      >
        <form className="contents" onSubmit={submit}>
          <DialogHeader className="pr-8">
            <DialogTitle>
              {editing ? "编辑活动内容" : "新增活动内容"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "修改活动卡片、内容类型与正文。"
                : "新内容将显示在首页活动区。"}
            </DialogDescription>
          </DialogHeader>

          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-2 right-2"
                aria-label="关闭活动内容编辑器"
                disabled={busy}
              />
            }
          >
            <XIcon aria-hidden="true" />
          </DialogClose>

          <div className="-mx-4 grid min-h-0 gap-6 overflow-y-auto border-t px-4 py-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
            <fieldset
              disabled={busy}
              aria-label="活动内容表单"
              className="flex min-w-0 flex-col gap-6"
            >
              <AdminField label="标题" htmlFor="information-title">
                <input
                  id="information-title"
                  className={adminControlClass}
                  autoFocus
                  maxLength={200}
                  required
                  value={submission.title}
                  onChange={(event) => onUpdate("title", event.target.value)}
                />
              </AdminField>

              <div className="grid gap-5 sm:grid-cols-2">
                <AdminField label="活动分类" htmlFor="information-category">
                  <select
                    id="information-category"
                    className={adminControlClass}
                    value={submission.category}
                    onChange={(event) =>
                      onUpdate(
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
                      if (contentType) onUpdate("contentType", contentType)
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
                description="必填；PNG、JPEG、WebP 或 AVIF，上传后转换为 WebP 并托管。"
                uploading={coverUploading}
                required
                resetAfterSelect
                onSelect={(file) => {
                  if (file) onUpload(file, "cover")
                }}
              />
              {submission.image ? (
                <div className="flex min-w-0 items-center gap-3 border-l-2 border-primary pl-3">
                  <CoverImagePreview
                    src={submission.image}
                    alt="当前封面"
                    className="h-16 w-24"
                  />
                  <p className="text-xs font-medium">当前封面预览</p>
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
                        onUpdate("externalUrl", event.target.value)
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
                      onChange={(event) => onUpdate("html", event.target.value)}
                    />
                  </AdminField>
                  <AdminImageUploadField
                    id="information-body-image"
                    label="正文图片"
                    description="上传成功后会把图片标签插入 HTML 末尾。"
                    uploading={bodyImageUploading}
                    resetAfterSelect
                    onSelect={(file) => {
                      if (file) onUpload(file, "body")
                    }}
                  />
                </>
              )}

              <Separator className="lg:hidden" />
            </fieldset>

            <InformationPreview
              document={previewDocument}
              submission={submission}
            />
          </div>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              取消
            </DialogClose>
            <Button
              type="submit"
              size="lg"
              disabled={busy || !submission.image}
            >
              {saving ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : editing ? (
                <PencilIcon data-icon="inline-start" />
              ) : (
                <PlusIcon data-icon="inline-start" />
              )}
              {editing ? "保存活动内容" : "发布活动内容"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
