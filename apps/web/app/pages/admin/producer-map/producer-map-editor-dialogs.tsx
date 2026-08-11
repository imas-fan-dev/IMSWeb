import { ImageIcon, LoaderCircleIcon, SaveIcon, Trash2Icon } from "lucide-react"
import { useMemo, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Textarea } from "~/components/ui/textarea"
import {
  uploadAdminProducerMapImage,
  type ProducerMapCommunity,
  type ProducerMapRegion,
  type ProducerMapSeries,
} from "~/lib/api"
import { AdminImageUploadField } from "~/pages/admin/components/admin-image-upload-field"
import {
  provinceOptions,
  regionIdForProvince,
  seriesOptions,
} from "~/pages/admin/producer-map/producer-map-model"

const seriesItems = seriesOptions.map((option) => ({ ...option }))
const communityRegionItems = [
  { label: "全国 / 未指定", value: "all-regions" },
  ...provinceOptions.map((province) => ({ label: province, value: province })),
]

function ProducerMapImageEditor({
  value,
  label,
  previewAlt,
  onUploadingChange,
  onChange,
}: {
  value: string | null
  label: string
  previewAlt: string
  onUploadingChange: (uploading: boolean) => void
  onChange: (value: string | null) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [failedValue, setFailedValue] = useState<string | null>(null)
  const previewFailed = Boolean(value && value === failedValue)

  async function upload(file: File | null) {
    if (!file) return
    setUploading(true)
    onUploadingChange(true)
    try {
      const result = await uploadAdminProducerMapImage(file).send()
      setFailedValue(null)
      onChange(result.url)
      toast.success(`${label}已上传`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${label}上传失败`)
    } finally {
      setUploading(false)
      onUploadingChange(false)
    }
  }

  return (
    <Field className="sm:col-span-2" data-disabled={uploading || undefined}>
      <FieldLabel>{label}</FieldLabel>
      <div className="grid gap-4 sm:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)] sm:items-start">
        <div className="flex aspect-16/10 min-h-36 items-center justify-center overflow-hidden rounded-lg border bg-muted/25">
          {value && !previewFailed ? (
            <img
              src={value}
              alt={previewAlt}
              className="size-full object-contain"
              onError={() => setFailedValue(value)}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 text-center text-xs text-muted-foreground">
              <ImageIcon aria-hidden="true" />
              <span>{previewFailed ? "图片无法预览" : "尚未设置图片"}</span>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <AdminImageUploadField
            id={`producer-map-${label}-upload`}
            name="image"
            label={value ? `替换${label}` : `上传${label}`}
            description="PNG、JPEG、WebP 或 AVIF，最大 10MB。"
            disabled={uploading}
            uploading={uploading}
            resetAfterSelect
            onSelect={(file) => void upload(file)}
          />
          {value ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={uploading}
              onClick={() => {
                setFailedValue(null)
                onChange(null)
              }}
            >
              <Trash2Icon data-icon="inline-start" />
              移除{label}
            </Button>
          ) : null}
        </div>
      </div>
    </Field>
  )
}

function SeriesField({
  id,
  value,
  onChange,
}: {
  id: string
  value: ProducerMapSeries
  onChange: (value: ProducerMapSeries) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>系列归属</FieldLabel>
      <Select
        items={seriesItems}
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue) onChange(String(nextValue) as ProducerMapSeries)
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {seriesItems.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

function EnabledField({
  id,
  checked,
  className,
  onChange,
}: {
  id: string
  checked: boolean
  className?: string
  onChange: (checked: boolean) => void
}) {
  return (
    <Field className={className} orientation="horizontal">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <FieldContent>
        <FieldLabel htmlFor={id}>
          <FieldTitle>公开显示</FieldTitle>
        </FieldLabel>
      </FieldContent>
    </Field>
  )
}

export function RegionEditorDialog({
  region,
  creating,
  availableProvinces,
  onOpenChange,
  onSave,
}: {
  region: ProducerMapRegion
  creating: boolean
  availableProvinces: readonly string[]
  onOpenChange: (open: boolean) => void
  onSave: (region: ProducerMapRegion) => void
}) {
  const [draft, setDraft] = useState(region)
  const [uploading, setUploading] = useState(false)
  const provinceItems = useMemo(
    () =>
      availableProvinces.map((province) => ({
        label: province,
        value: province,
      })),
    [availableProvinces]
  )

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (!uploading) onSave(draft)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!uploading) onOpenChange(open)
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"
        showCloseButton={!uploading}
      >
        <form className="contents" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {creating ? "新增地图地点" : "编辑地图地点"}
            </DialogTitle>
            <DialogDescription>
              {creating
                ? "地图地点资料"
                : `${region.name} · ${region.province}`}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="grid sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="producer-map-region-province">
                行政区
              </FieldLabel>
              <Select
                items={provinceItems}
                value={draft.province}
                onValueChange={(nextValue) => {
                  if (!nextValue) return
                  const province = String(nextValue)
                  setDraft((current) => ({
                    ...current,
                    id: regionIdForProvince(province),
                    province,
                    name:
                      current.name === current.province
                        ? province
                        : current.name,
                  }))
                }}
              >
                <SelectTrigger
                  id="producer-map-region-province"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  <SelectGroup>
                    {provinceItems.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="producer-map-region-name">
                地点名称
              </FieldLabel>
              <Input
                id="producer-map-region-name"
                required
                maxLength={80}
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </Field>
            <SeriesField
              id="producer-map-region-series"
              value={draft.series}
              onChange={(series) =>
                setDraft((current) => ({ ...current, series }))
              }
            />
            <EnabledField
              id="producer-map-region-enabled"
              checked={draft.enabled}
              onChange={(enabled) =>
                setDraft((current) => ({ ...current, enabled }))
              }
            />
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="producer-map-region-summary">
                地点简介
              </FieldLabel>
              <Textarea
                id="producer-map-region-summary"
                maxLength={1000}
                value={draft.summary}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    summary: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="producer-map-region-contact">
                联络信息
              </FieldLabel>
              <Input
                id="producer-map-region-contact"
                maxLength={240}
                value={draft.contact}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    contact: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="producer-map-region-link">
                地点链接
              </FieldLabel>
              <Input
                id="producer-map-region-link"
                type="url"
                maxLength={500}
                value={draft.linkUrl ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    linkUrl: event.target.value || null,
                  }))
                }
              />
            </Field>
            <ProducerMapImageEditor
              value={draft.imageUrl}
              label="地点资料图片"
              previewAlt={`${draft.name || draft.province}地点资料图片预览`}
              onUploadingChange={setUploading}
              onChange={(imageUrl) =>
                setDraft((current) => ({ ...current, imageUrl }))
              }
            />
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={uploading || !draft.name.trim()}>
              {uploading ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              {creating ? "添加地点" : "保存地点"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CommunityEditorDialog({
  community,
  creating,
  onOpenChange,
  onSave,
}: {
  community: ProducerMapCommunity
  creating: boolean
  onOpenChange: (open: boolean) => void
  onSave: (community: ProducerMapCommunity) => void
}) {
  const [draft, setDraft] = useState(community)
  const [uploading, setUploading] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (!uploading) onSave(draft)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!uploading) onOpenChange(open)
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"
        showCloseButton={!uploading}
      >
        <form className="contents" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{creating ? "新增社群" : "编辑社群"}</DialogTitle>
            <DialogDescription>
              {creating ? "社群名录资料" : community.name}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="grid sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="producer-map-community-name">
                社群名称
              </FieldLabel>
              <Input
                id="producer-map-community-name"
                required
                maxLength={100}
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="producer-map-community-platform">
                平台
              </FieldLabel>
              <Input
                id="producer-map-community-platform"
                required
                maxLength={40}
                value={draft.platform}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    platform: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="producer-map-community-region">
                所属地区
              </FieldLabel>
              <Select
                items={communityRegionItems}
                value={draft.region ?? "all-regions"}
                onValueChange={(nextValue) =>
                  setDraft((current) => ({
                    ...current,
                    region:
                      nextValue && nextValue !== "all-regions"
                        ? String(nextValue)
                        : null,
                  }))
                }
              >
                <SelectTrigger
                  id="producer-map-community-region"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  <SelectGroup>
                    {communityRegionItems.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <SeriesField
              id="producer-map-community-series"
              value={draft.series}
              onChange={(series) =>
                setDraft((current) => ({ ...current, series }))
              }
            />
            <EnabledField
              id="producer-map-community-enabled"
              className="sm:col-span-2"
              checked={draft.enabled}
              onChange={(enabled) =>
                setDraft((current) => ({ ...current, enabled }))
              }
            />
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="producer-map-community-description">
                社群简介
              </FieldLabel>
              <Textarea
                id="producer-map-community-description"
                maxLength={600}
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="producer-map-community-contact">
                联络信息
              </FieldLabel>
              <Input
                id="producer-map-community-contact"
                maxLength={240}
                value={draft.contact}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    contact: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="producer-map-community-link">
                社群链接
              </FieldLabel>
              <Input
                id="producer-map-community-link"
                type="url"
                maxLength={500}
                value={draft.linkUrl ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    linkUrl: event.target.value || null,
                  }))
                }
              />
            </Field>
            <ProducerMapImageEditor
              value={draft.imageUrl}
              label="社群联络图片"
              previewAlt={`${draft.name || "社群"}联络图片预览`}
              onUploadingChange={setUploading}
              onChange={(imageUrl) =>
                setDraft((current) => ({ ...current, imageUrl }))
              }
            />
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={
                uploading || !draft.name.trim() || !draft.platform.trim()
              }
            >
              {uploading ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              {creating ? "添加社群" : "保存社群"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
