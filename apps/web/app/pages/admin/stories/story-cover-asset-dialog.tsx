import {
  CropIcon,
  FileImageIcon,
  ImagePlusIcon,
  ImageUpIcon,
  LoaderCircleIcon,
  ScanIcon,
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
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import { cn } from "~/lib/utils"
import {
  createWikiStoryCoverAsset,
  isApiError,
  updateWikiStoryCoverAsset,
  type WikiStoryCoverAsset,
  type WikiStoryCoverPresentationPolicy,
} from "~/lib/api"

type PreviewRatio = "wide" | "standard" | "square"

const PREVIEW_RATIOS: Record<PreviewRatio, string> = {
  wide: "2.8 / 1",
  standard: "16 / 9",
  square: "1 / 1",
}

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
  const [presentationPolicy, setPresentationPolicy] =
    useState<WikiStoryCoverPresentationPolicy>(
      asset?.presentationPolicy ?? "inherit"
    )
  const [previewRatio, setPreviewRatio] = useState<PreviewRatio>("wide")
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
          presentationPolicy,
          expectedRevision: asset.revision,
          image,
        }).send()
      } else {
        await createWikiStoryCoverAsset({
          agencyId,
          name,
          image: image!,
          presentationPolicy,
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
      <DialogContent className="sm:max-w-xl">
        <form className="contents" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{asset ? "编辑共享封面" : "上传共享封面"}</DialogTitle>
            <DialogDescription>{agencyName}</DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel>预览画布</FieldLabel>
                <ToggleGroup
                  value={[previewRatio]}
                  variant="outline"
                  size="sm"
                  spacing={0}
                  aria-label="预览画布比例"
                  onValueChange={(values) => {
                    const ratio = values[0] as PreviewRatio | undefined
                    if (ratio) setPreviewRatio(ratio)
                  }}
                >
                  <ToggleGroupItem value="wide">宽幅</ToggleGroupItem>
                  <ToggleGroupItem value="standard">标准</ToggleGroupItem>
                  <ToggleGroupItem value="square">方形</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="flex min-h-64 items-center justify-center rounded-lg border bg-muted/30 p-3">
                <div
                  className={cn(
                    "w-full overflow-hidden rounded-md border bg-background",
                    previewRatio === "square" && "max-w-56"
                  )}
                  style={{ aspectRatio: PREVIEW_RATIOS[previewRatio] }}
                >
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={`${name.trim() || "共享封面"}预览`}
                      className={cn(
                        "size-full",
                        presentationPolicy === "contain"
                          ? "object-contain"
                          : "object-cover"
                      )}
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <ImagePlusIcon aria-hidden="true" />
                    </div>
                  )}
                </div>
              </div>
            </Field>
            <Field data-disabled={saving || undefined}>
              <FieldLabel>展示方式</FieldLabel>
              <ToggleGroup
                value={[presentationPolicy]}
                variant="outline"
                spacing={0}
                className="w-full"
                aria-label="共享封面展示方式"
                onValueChange={(values) => {
                  const policy = values[0] as
                    | WikiStoryCoverPresentationPolicy
                    | undefined
                  if (policy) setPresentationPolicy(policy)
                }}
              >
                <ToggleGroupItem
                  value="inherit"
                  className="min-w-0 flex-1"
                  disabled={saving}
                >
                  <CropIcon data-icon="inline-start" />
                  跟随卡片
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="contain"
                  className="min-w-0 flex-1"
                  disabled={saving}
                >
                  <ScanIcon data-icon="inline-start" />
                  完整显示
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                {presentationPolicy === "contain"
                  ? "标识和带文字素材会在不同画布中保留完整边缘。"
                  : "使用该素材的卡片可以分别调整裁切和焦点。"}
              </FieldDescription>
            </Field>
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
