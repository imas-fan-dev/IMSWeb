import {
  CopyIcon,
  ExternalLinkIcon,
  FileImageIcon,
  ImageUpIcon,
  UploadIcon,
  UserRoundIcon,
} from "lucide-react"
import { useState } from "react"
import type { FormEvent } from "react"

import { toast } from "sonner"

import {
  IdolMultiSelect,
  type IdolSeriesOption,
} from "~/components/community/idol-multi-select"
import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import { FileUploadControl } from "~/components/shared/file-upload-control"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button, buttonVariants } from "~/components/ui/button"
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
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  getWikiCatalog,
  isApiError,
  resolveShareableOrigin,
  uploadFudabaGuestSubmission,
  type WikiPublicCatalog,
} from "~/lib/api"
import { useAppPreparedImage } from "~/lib/media/use-app-prepared-image"
import {
  namecardSubmissionManagePath,
  saveNamecardSubmissionReceipt,
  type NamecardSubmissionReceipt,
} from "~/pages/community/namecard-submission-storage"
import { NavigationLink } from "~/components/navigation/navigation-link"

const MAX_NAMECARD_IMAGE_BYTES = 3 * 1024 * 1024

function validateNamecardImage(file: File): string | null {
  if (!file.type.startsWith("image/")) return "只能上传图片文件"
  if (file.size > MAX_NAMECARD_IMAGE_BYTES) {
    return "每张名片图片不能超过 3 MiB"
  }
  return null
}

export function NamecardUploadDialog() {
  const platform = useOptionalPlatformSession()
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [receipt, setReceipt] = useState<NamecardSubmissionReceipt | null>(null)
  const [catalog, setCatalog] = useState<WikiPublicCatalog | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [seriesCode, setSeriesCode] = useState("")
  const [favoriteIdolIds, setFavoriteIdolIds] = useState<number[]>([])
  const [producerName, setProducerName] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [bio, setBio] = useState("")
  const frontImage = useAppPreparedImage({
    mediaKind: "guest-namecard",
    validate: validateNamecardImage,
    onError: (message) => toast.error(message),
  })
  const backImage = useAppPreparedImage({
    mediaKind: "guest-namecard",
    validate: validateNamecardImage,
    onError: (message) => toast.error(message),
  })
  const front = frontImage.file
  const back = backImage.file
  const preparing = frontImage.preparing || backImage.preparing
  const busy = uploading || preparing

  const series: IdolSeriesOption[] = (catalog?.agencies ?? []).map(
    (agency) => ({
      code: agency.code,
      displayName: agency.name,
      color: agency.color,
    })
  )

  async function loadCatalog() {
    if (catalog || catalogLoading) return
    setCatalogLoading(true)
    try {
      const result = await getWikiCatalog().send()
      setCatalog(result)
      setSeriesCode((current) => current || result.agencies[0]?.code || "")
    } catch {
      toast.error("担当偶像目录载入失败，请稍后重试")
    } finally {
      setCatalogLoading(false)
    }
  }

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && busy) return
    setOpen(nextOpen)
    if (nextOpen) void loadCatalog()
    if (!nextOpen) {
      frontImage.clear()
      backImage.clear()
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!front || !back) {
      toast.error("请同时选择名片正面和背面")
      return
    }
    if (!seriesCode || favoriteIdolIds.length === 0) {
      toast.error("请选择主企划和至少一位担当偶像")
      return
    }
    setUploading(true)
    const form = event.currentTarget
    try {
      const response = await uploadFudabaGuestSubmission(front, back, {
        seriesCode,
        favoriteIdolIds,
        // Descriptive fields are optional, so an untouched field sends nothing
        // rather than an empty string.
        ...(producerName.trim() ? { producerName: producerName.trim() } : {}),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        ...(bio.trim() ? { bio: bio.trim() } : {}),
      }).send()
      toast.success(response.message)
      const nextReceipt = {
        id: response.submission.id,
        token: response.withdrawalToken,
      }
      saveNamecardSubmissionReceipt(nextReceipt)
      setReceipt(nextReceipt)
      frontImage.clear()
      backImage.clear()
      form.reset()
    } catch (error) {
      toast.error(
        isApiError(error) ? error.message : "名片上传失败，请检查图片后重试"
      )
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
    const link = new URL(manageLink(nextReceipt), resolveShareableOrigin()).href
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
        className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        aria-busy={busy}
      >
        <form
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onSubmit={(event) => void submit(event)}
        >
          <DialogHeader className="shrink-0 p-4 pr-12 pb-0">
            <DialogTitle>提交制作人名片</DialogTitle>
            <DialogDescription>
              注册用户可自行管理名片并在审核后摆放到地图名片墙；游客投稿不可编辑。
            </DialogDescription>
          </DialogHeader>

          <div
            className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-5"
            data-namecard-upload-body
          >
            <Alert>
              <UserRoundIcon aria-hidden="true" />
              <AlertTitle>
                {platform.status === "authenticated" ||
                platform.status === "restricted"
                  ? "使用注册用户上传"
                  : "注册用户上传"}
              </AlertTitle>
              <AlertDescription className="space-y-3">
                <p>注册名片支持后续修改、担当管理和地图名片墙摆放。</p>
                <NavigationLink
                  to="/community/exchange/me"
                  className={buttonVariants({ variant: "outline" })}
                >
                  前往我的名片
                  <ExternalLinkIcon data-icon="inline-end" />
                </NavigationLink>
              </AlertDescription>
            </Alert>

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
                    <NavigationLink
                      to={manageLink(receipt)}
                      className={buttonVariants({ variant: "secondary" })}
                    >
                      管理这次投稿
                      <ExternalLinkIcon data-icon="inline-end" />
                    </NavigationLink>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="border-t pt-5">
              <h3 className="text-sm font-medium">游客投稿</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                投稿后只能查看审核状态或在审核前撤回，不能修改图片和担当。
              </p>
            </div>

            <Field data-disabled={busy || undefined}>
              <FieldLabel htmlFor="guest-namecard-series">主企划</FieldLabel>
              <Select
                value={seriesCode}
                disabled={busy || catalogLoading || series.length === 0}
                onValueChange={(value) => setSeriesCode(String(value ?? ""))}
              >
                <SelectTrigger id="guest-namecard-series" className="w-full">
                  <SelectValue placeholder="选择主企划" />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    {series.map((item) => (
                      <SelectItem key={item.code} value={item.code}>
                        {item.displayName}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <FieldGroup className="grid gap-5 md:grid-cols-2">
              <Field data-disabled={busy || undefined}>
                <FieldLabel htmlFor="guest-namecard-producer">
                  制作人昵称（选填）
                </FieldLabel>
                <Input
                  id="guest-namecard-producer"
                  value={producerName}
                  maxLength={80}
                  disabled={busy}
                  placeholder="署名，留空则匿名"
                  onChange={(event) => setProducerName(event.target.value)}
                />
              </Field>
              <Field data-disabled={busy || undefined}>
                <FieldLabel htmlFor="guest-namecard-display">
                  名片名称（选填）
                </FieldLabel>
                <Input
                  id="guest-namecard-display"
                  value={displayName}
                  maxLength={120}
                  disabled={busy}
                  placeholder="这张名片的称呼"
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </Field>
            </FieldGroup>

            <Field data-disabled={busy || undefined}>
              <FieldLabel htmlFor="guest-namecard-bio">简介（选填）</FieldLabel>
              <Textarea
                id="guest-namecard-bio"
                value={bio}
                maxLength={2000}
                rows={3}
                disabled={busy}
                placeholder="名片的设计说明或交换想法"
                onChange={(event) => setBio(event.target.value)}
              />
            </Field>

            <IdolMultiSelect
              id="guest-namecard-idols"
              series={series}
              idols={catalog?.searchEntries ?? []}
              selectedIds={favoriteIdolIds}
              disabled={busy || catalogLoading}
              onChange={setFavoriteIdolIds}
            />

            <FieldGroup className="grid gap-5 md:grid-cols-2">
              <Field data-disabled={busy || undefined}>
                <FieldLabel htmlFor="namecard-front">名片正面</FieldLabel>
                <FileUploadControl
                  id="namecard-front"
                  compact
                  accept="image/*"
                  emptyTitle="选择名片正面"
                  emptyDetail="图片文件 · 不超过 3 MiB"
                  fileKind="名片正面"
                  file={front}
                  disabled={busy && !frontImage.preparing}
                  preparing={frontImage.preparing}
                  uploading={uploading}
                  required
                  selectedIcon={FileImageIcon}
                  emptyIcon={ImageUpIcon}
                  onBrowse={frontImage.browse}
                  onSelect={frontImage.selectFile}
                />
              </Field>
              <Field data-disabled={busy || undefined}>
                <FieldLabel htmlFor="namecard-back">名片背面</FieldLabel>
                <FileUploadControl
                  id="namecard-back"
                  compact
                  accept="image/*"
                  emptyTitle="选择名片背面"
                  emptyDetail="图片文件 · 不超过 3 MiB"
                  fileKind="名片背面"
                  file={back}
                  disabled={busy && !backImage.preparing}
                  preparing={backImage.preparing}
                  uploading={uploading}
                  required
                  selectedIcon={FileImageIcon}
                  emptyIcon={ImageUpIcon}
                  onBrowse={backImage.browse}
                  onSelect={backImage.selectFile}
                />
              </Field>
            </FieldGroup>
          </div>

          <DialogFooter className="m-0 shrink-0 rounded-none">
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              取消
            </DialogClose>
            <Button
              type="submit"
              disabled={
                busy ||
                catalogLoading ||
                !front ||
                !back ||
                !seriesCode ||
                favoriteIdolIds.length === 0
              }
            >
              <UploadIcon data-icon="inline-start" />
              {uploading ? "正在上传" : "提交审核"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
