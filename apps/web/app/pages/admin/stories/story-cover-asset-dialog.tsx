import {
  FileImageIcon,
  ImagePlusIcon,
  ImageUpIcon,
  LoaderCircleIcon,
} from "lucide-react"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { FileUploadControl } from "~/components/shared/file-upload-control"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
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
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  createWikiStoryCoverAsset,
  isApiError,
  updateWikiStoryCoverAsset,
  type WikiStoryCoverAsset,
} from "~/lib/api"

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "保存失败，请稍后重试"
}

export function StoryCoverAssetDialog({
  open,
  agencyId,
  agencyName,
  asset,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  agencyId: number
  agencyName: string
  asset: WikiStoryCoverAsset | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(asset?.name ?? "")
  const [isActive, setIsActive] = useState(asset?.isActive ?? true)
  const [image, setImage] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const localPreviewUrl = useMemo(
    () => (image ? URL.createObjectURL(image) : ""),
    [image]
  )
  useEffect(
    () => () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl)
    },
    [localPreviewUrl]
  )
  const previewUrl = localPreviewUrl || asset?.imageUrl || ""

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) return
    if (!asset && !image) {
      toast.error("请选择封面图片")
      return
    }
    setSaving(true)
    try {
      if (asset) {
        await updateWikiStoryCoverAsset({
          assetId: asset.id,
          name,
          isActive,
          expectedRevision: asset.revision,
          image,
        }).send()
      } else {
        await createWikiStoryCoverAsset({
          agencyId,
          name,
          image: image!,
        }).send()
      }
      toast.success(asset ? "素材已更新" : "素材已上传")
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
            <DialogTitle>{asset ? "编辑共享封面" : "上传共享封面"}</DialogTitle>
            <DialogDescription>{agencyName}</DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <div className="aspect-video overflow-hidden rounded-lg border bg-muted/30">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt=""
                  className="size-full object-contain"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <ImagePlusIcon aria-hidden="true" />
                </div>
              )}
            </div>
            <Field>
              <FieldLabel htmlFor="story-cover-asset-name">素材名称</FieldLabel>
              <Input
                id="story-cover-asset-name"
                required
                maxLength={200}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field data-disabled={saving || undefined}>
              <FieldLabel htmlFor="story-cover-asset-image">
                {asset ? "替换图片" : "封面图片"}
              </FieldLabel>
              <FileUploadControl
                id="story-cover-asset-image"
                compact
                accept="image/jpeg,image/png,image/webp,image/gif"
                emptyTitle={t("upload.storyCover.emptyTitle")}
                emptyDetail={t("upload.storyCover.emptyDetail")}
                fileKind={t("upload.storyCover.fileKind")}
                file={image}
                disabled={saving}
                required={!asset}
                selectedIcon={FileImageIcon}
                emptyIcon={ImageUpIcon}
                onSelect={setImage}
              />
              {asset ? (
                <FieldDescription>不选择文件则保留当前图片。</FieldDescription>
              ) : null}
            </Field>
            {asset ? (
              <Field orientation="horizontal">
                <Checkbox
                  id="story-cover-asset-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
                <FieldContent>
                  <FieldLabel htmlFor="story-cover-asset-active">
                    <FieldTitle>允许新卡片使用</FieldTitle>
                  </FieldLabel>
                  <FieldDescription>
                    停用不会影响已经引用该素材的卡片。
                  </FieldDescription>
                </FieldContent>
              </Field>
            ) : null}
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
              ) : (
                <ImagePlusIcon data-icon="inline-start" />
              )}
              {asset ? "保存" : "上传"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
