import { RotateCcwIcon, RotateCwIcon, ScanIcon, Undo2Icon } from "lucide-react"
import { useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { FileUploadControl } from "~/components/shared/file-upload-control"
import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { Button } from "~/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import { Slider } from "~/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import { cn } from "~/lib/utils"
import {
  defaultWikiImageTransform,
  type WikiImageTransform,
} from "~/shared/api"

type PreviewRatio = "square" | "story"

function normalizedRotation(value: number): WikiImageTransform["rotation"] {
  return (((value % 360) + 360) % 360) as WikiImageTransform["rotation"]
}

export function ImageCompositionEditor({
  id,
  file,
  currentUrl,
  transform,
  previewRatio = "square",
  disabled,
  showFileInput = true,
  onFileChange,
  onTransformChange,
}: {
  id: string
  file: File | null
  currentUrl?: string | null
  transform: WikiImageTransform
  previewRatio?: PreviewRatio
  disabled?: boolean
  showFileInput?: boolean
  onFileChange: (file: File | null) => void
  onTransformChange: (transform: WikiImageTransform) => void
}) {
  const { t } = useTranslation()
  const localUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : ""),
    [file]
  )
  useEffect(
    () => () => {
      if (localUrl) URL.revokeObjectURL(localUrl)
    },
    [localUrl]
  )
  const previewUrl = localUrl || currentUrl || ""

  function update<Key extends keyof WikiImageTransform>(
    key: Key,
    value: WikiImageTransform[Key]
  ) {
    onTransformChange({ ...transform, [key]: value })
  }

  return (
    <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)]">
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-lg border bg-muted",
          previewRatio === "story" ? "aspect-16/10" : "aspect-square"
        )}
      >
        {previewUrl ? (
          <WikiTransformedImage
            src={previewUrl}
            alt="图片构图预览"
            transform={transform}
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <ScanIcon aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        {showFileInput ? (
          <Field data-disabled={disabled || undefined}>
            <FieldLabel htmlFor={id}>{t("upload.image.label")}</FieldLabel>
            <FileUploadControl
              id={id}
              accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
              emptyTitle={t("upload.image.emptyTitle")}
              emptyDetail={t("upload.image.emptyDetailWithGif")}
              fileKind={t("upload.image.fileKind")}
              file={file}
              disabled={disabled}
              onSelect={onFileChange}
            />
            <FieldDescription>
              {t("upload.image.conversionDetail")}
            </FieldDescription>
          </Field>
        ) : null}

        <Field>
          <FieldLabel>适配方式</FieldLabel>
          <ToggleGroup
            value={[transform.fit]}
            variant="outline"
            spacing={0}
            className="w-full"
            aria-label="图片适配方式"
            onValueChange={(values) => {
              const fit = values[0] as WikiImageTransform["fit"] | undefined
              if (fit) update("fit", fit)
            }}
          >
            <ToggleGroupItem value="cover" className="flex-1">
              裁满
            </ToggleGroupItem>
            <ToggleGroupItem value="contain" className="flex-1">
              完整显示
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <TransformSlider
          label="缩放"
          value={transform.zoom}
          min={1}
          max={3}
          step={0.05}
          display={`${Math.round(transform.zoom * 100)}%`}
          onChange={(value) => update("zoom", value)}
        />
        <TransformSlider
          label="水平焦点"
          value={transform.focalX}
          min={0}
          max={1}
          step={0.01}
          display={`${Math.round(transform.focalX * 100)}%`}
          onChange={(value) => update("focalX", value)}
        />
        <TransformSlider
          label="垂直焦点"
          value={transform.focalY}
          min={0}
          max={1}
          step={0.01}
          display={`${Math.round(transform.focalY * 100)}%`}
          onChange={(value) => update("focalY", value)}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() =>
              update("rotation", normalizedRotation(transform.rotation - 90))
            }
          >
            <RotateCcwIcon data-icon="inline-start" />
            左转
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() =>
              update("rotation", normalizedRotation(transform.rotation + 90))
            }
          >
            <RotateCwIcon data-icon="inline-start" />
            右转
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onTransformChange(defaultWikiImageTransform)}
          >
            <Undo2Icon data-icon="inline-start" />
            重置构图
          </Button>
        </div>
      </div>
    </div>
  )
}

function TransformSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
}) {
  return (
    <Field>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel>{label}</FieldLabel>
        <span className="text-xs text-muted-foreground tabular-nums">
          {display}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onValueChange={(values) =>
          onChange(
            Number(typeof values === "number" ? values : (values[0] ?? value))
          )
        }
      />
    </Field>
  )
}
