import {
  CopyIcon,
  ExternalLinkIcon,
  FileImageIcon,
  ImageUpIcon,
  UploadIcon,
} from "lucide-react"
import { useState } from "react"
import type { FormEvent } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import { FileUploadControl } from "~/components/shared/file-upload-control"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field"
import { uploadNamecard } from "~/lib/api"
import {
  namecardSubmissionManagePath,
  saveNamecardSubmissionReceipt,
  type NamecardSubmissionReceipt,
} from "~/pages/community/namecard-submission-storage"

export function NamecardUploadDialog() {
  const [open, setOpen] = useState(false)
  const [front, setFront] = useState<File | null>(null)
  const [back, setBack] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [receipt, setReceipt] = useState<NamecardSubmissionReceipt | null>(null)

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && uploading) return
    setOpen(nextOpen)
    if (!nextOpen) {
      setFront(null)
      setBack(null)
    }
  }

  function chooseFile(file: File | null, side: "front" | "back") {
    if (!file) {
      if (side === "front") setFront(null)
      else setBack(null)
      return
    }
    if (!file.type.startsWith("image/")) {
      toast.error("只能上传图片文件")
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("每张名片图片不能超过 3 MiB")
      return
    }
    if (side === "front") setFront(file)
    else setBack(file)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!front || !back) {
      toast.error("请同时选择名片正面和背面")
      return
    }
    setUploading(true)
    const form = event.currentTarget
    try {
      const response = await uploadNamecard(front, back).send()
      toast.success(response.msg)
      const nextReceipt = {
        id: response.submission.id,
        token: response.withdrawalToken,
      }
      saveNamecardSubmissionReceipt(nextReceipt)
      setReceipt(nextReceipt)
      setFront(null)
      setBack(null)
      form.reset()
    } catch {
      toast.error("名片上传失败，请检查图片后重试")
    } finally {
      setUploading(false)
    }
  }

  function manageLink(nextReceipt: NamecardSubmissionReceipt) {
    return namecardSubmissionManagePath(nextReceipt.id, nextReceipt.token)
  }

  async function copyManageLink(nextReceipt: NamecardSubmissionReceipt) {
    if (!navigator.clipboard?.writeText) {
      toast.error("浏览器不支持复制，请手动保存投稿管理链接")
      return
    }
    const link = new URL(manageLink(nextReceipt), window.location.origin).href
    try {
      await navigator.clipboard.writeText(link)
      toast.success("投稿管理链接已复制")
    } catch {
      toast.error("复制失败，请手动保存投稿管理链接")
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="icon"
            className="size-12 rounded-full shadow-lg shadow-primary/20 sm:w-auto sm:gap-2 sm:rounded-lg sm:px-5"
            aria-label="上传名片"
            title="上传名片"
            data-namecard-upload-trigger
          />
        }
      >
        <ImageUpIcon className="size-5 sm:size-4" aria-hidden="true" />
        <span className="hidden sm:inline">上传名片</span>
      </DialogTrigger>

      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"
        aria-busy={uploading}
      >
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => void submit(event)}
        >
          <DialogHeader className="pr-8">
            <DialogTitle>提交制作人名片</DialogTitle>
            <DialogDescription>
              请分别上传正面和背面。每张不超过 3 MiB，图片会转换为 WebP
              并进入审核队列。
            </DialogDescription>
          </DialogHeader>

          {receipt ? (
            <Alert>
              <ExternalLinkIcon aria-hidden="true" />
              <AlertTitle>请保存投稿管理链接</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>
                  审核完成前，你可以凭这个链接查看状态或撤回投稿。链接丢失后无法自行找回。
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void copyManageLink(receipt)}
                  >
                    <CopyIcon data-icon="inline-start" />
                    复制管理链接
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    render={<Link to={manageLink(receipt)} />}
                  >
                    管理这次投稿
                    <ExternalLinkIcon data-icon="inline-end" />
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <Field data-disabled={uploading || undefined}>
              <FieldLabel htmlFor="namecard-front">名片正面</FieldLabel>
              <FileUploadControl
                id="namecard-front"
                compact
                accept="image/*"
                emptyTitle="选择名片正面"
                emptyDetail="图片文件 · 不超过 3 MiB"
                fileKind="名片正面"
                file={front}
                uploading={uploading}
                required
                selectedIcon={FileImageIcon}
                emptyIcon={ImageUpIcon}
                onSelect={(file) => chooseFile(file, "front")}
              />
            </Field>
            <Field data-disabled={uploading || undefined}>
              <FieldLabel htmlFor="namecard-back">名片背面</FieldLabel>
              <FileUploadControl
                id="namecard-back"
                compact
                accept="image/*"
                emptyTitle="选择名片背面"
                emptyDetail="图片文件 · 不超过 3 MiB"
                fileKind="名片背面"
                file={back}
                uploading={uploading}
                required
                selectedIcon={FileImageIcon}
                emptyIcon={ImageUpIcon}
                onSelect={(file) => chooseFile(file, "back")}
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={uploading} />
              }
            >
              取消
            </DialogClose>
            <Button type="submit" disabled={uploading || !front || !back}>
              <UploadIcon data-icon="inline-start" />
              {uploading ? "正在上传" : "提交审核"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
