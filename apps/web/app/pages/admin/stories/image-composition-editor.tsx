import {
  ChevronDownIcon,
  FocusIcon,
  RotateCcwIcon,
  RotateCwIcon,
  ScanIcon,
  SlidersHorizontalIcon,
  Undo2Icon,
} from "lucide-react"
import {
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { useTranslation } from "react-i18next"

import { FileUploadControl } from "~/components/shared/file-upload-control"
import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { Button } from "~/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Slider } from "~/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import { cn } from "~/lib/utils"
import {
  defaultWikiImageTransform,
  type WikiImageTransform,
} from "~/shared/api"

type PreviewRatio = "square" | "story"

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

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
  const activePointerId = useRef<number | null>(null)
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
  const canAdjust = Boolean(previewUrl) && !disabled

  function update<Key extends keyof WikiImageTransform>(
    key: Key,
    value: WikiImageTransform[Key]
  ) {
    onTransformChange({ ...transform, [key]: value })
  }

  function updateFocalPoint(focalX: number, focalY: number) {
    onTransformChange({
      ...transform,
      focalX: clamp(focalX, 0, 1),
      focalY: clamp(focalY, 0, 1),
    })
  }

  function updateFocalPointFromPointer(
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    updateFocalPoint(
      (event.clientX - bounds.left) / bounds.width,
      (event.clientY - bounds.top) / bounds.height
    )
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!canAdjust || event.button !== 0) return
    event.preventDefault()
    activePointerId.current = event.pointerId
    event.currentTarget.setPointerCapture?.(event.pointerId)
    updateFocalPointFromPointer(event)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointerId.current !== event.pointerId) return
    updateFocalPointFromPointer(event)
  }

  function finishPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointerId.current === event.pointerId) {
      activePointerId.current = null
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!canAdjust) return
    const step = event.shiftKey ? 0.05 : 0.01
    const movement = {
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
    }[event.key]
    if (!movement) return
    event.preventDefault()
    updateFocalPoint(
      transform.focalX + movement[0],
      transform.focalY + movement[1]
    )
  }

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(15rem,1fr)_minmax(16rem,1fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <div
          role="group"
          tabIndex={canAdjust ? 0 : -1}
          aria-label="图片焦点，可拖动或使用方向键调整"
          aria-disabled={!canAdjust || undefined}
          data-testid="image-composition-preview"
          className={cn(
            "group relative w-full touch-none overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
            previewRatio === "story" ? "aspect-16/10" : "aspect-square",
            canAdjust && "cursor-crosshair"
          )}
          onKeyDown={handleKeyDown}
          onPointerCancel={finishPointer}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointer}
        >
          {previewUrl ? (
            <>
              <WikiTransformedImage
                src={previewUrl}
                alt="图片构图预览"
                draggable={false}
                transform={transform}
                className="pointer-events-none select-none"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute grid size-7 -translate-1/2 place-items-center rounded-full border border-background/80 bg-foreground/75 text-background shadow-sm transition-[top,left] duration-75 motion-reduce:transition-none"
                style={{
                  left: `${transform.focalX * 100}%`,
                  top: `${transform.focalY * 100}%`,
                }}
              >
                <FocusIcon className="size-4" />
              </span>
            </>
          ) : (
            <span className="flex size-full items-center justify-center text-muted-foreground">
              <ScanIcon aria-hidden="true" />
            </span>
          )}
        </div>

        <div className="flex min-h-7 items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground tabular-nums">
            焦点 {Math.round(transform.focalX * 100)} /{" "}
            {Math.round(transform.focalY * 100)}
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={!canAdjust}
              aria-label="向左旋转"
              title="向左旋转"
              onClick={() =>
                update("rotation", normalizedRotation(transform.rotation - 90))
              }
            >
              <RotateCcwIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={!canAdjust}
              aria-label="向右旋转"
              title="向右旋转"
              onClick={() =>
                update("rotation", normalizedRotation(transform.rotation + 90))
              }
            >
              <RotateCwIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={!canAdjust}
              aria-label="重置构图"
              title="重置构图"
              onClick={() => onTransformChange(defaultWikiImageTransform)}
            >
              <Undo2Icon aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      <FieldGroup className="min-w-0 gap-4">
        {showFileInput ? (
          <Field data-disabled={disabled || undefined}>
            <FieldLabel htmlFor={id}>{t("upload.image.label")}</FieldLabel>
            <FileUploadControl
              id={id}
              compact
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

        <Field data-disabled={disabled || undefined}>
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
            <ToggleGroupItem
              value="cover"
              className="min-w-0 flex-1"
              disabled={disabled}
            >
              裁满
            </ToggleGroupItem>
            <ToggleGroupItem
              value="contain"
              className="min-w-0 flex-1"
              disabled={disabled}
            >
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
          disabled={disabled}
          onChange={(value) => update("zoom", value)}
        />

        <Collapsible className="border-t pt-1">
          <CollapsibleTrigger
            type="button"
            className="group flex w-full items-center gap-2 rounded-md px-1 py-2 text-left text-sm font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <SlidersHorizontalIcon className="size-4 text-muted-foreground" />
            <span className="flex-1">精细调整</span>
            <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-aria-expanded:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-4 pt-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
            <TransformSlider
              label="水平焦点"
              value={transform.focalX}
              min={0}
              max={1}
              step={0.01}
              display={`${Math.round(transform.focalX * 100)}%`}
              disabled={disabled}
              onChange={(value) => update("focalX", value)}
            />
            <TransformSlider
              label="垂直焦点"
              value={transform.focalY}
              min={0}
              max={1}
              step={0.01}
              display={`${Math.round(transform.focalY * 100)}%`}
              disabled={disabled}
              onChange={(value) => update("focalY", value)}
            />
          </CollapsibleContent>
        </Collapsible>
      </FieldGroup>
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
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <Field data-disabled={disabled || undefined}>
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
        disabled={disabled}
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
