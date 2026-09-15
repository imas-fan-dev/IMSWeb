import Cropper, { type Area } from "react-easy-crop"
import { ImageIcon, LoaderCircleIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Label } from "~/components/ui/label"
import { Slider } from "~/components/ui/slider"
import {
  cropAvatarImage,
  CropAvatarImageError,
} from "~/lib/media/crop-avatar-image"

export function AvatarCropDialog({
  file,
  onCancel,
  onConfirm,
}: {
  file: File
  onCancel: () => void
  onConfirm: (file: File) => string | null
}) {
  const { t } = useTranslation()
  const [source, setSource] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [cropPixels, setCropPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeRef = useRef(true)

  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
    }
  }, [])

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    let active = true
    queueMicrotask(() => {
      if (active) setSource(objectUrl)
    })
    return () => {
      active = false
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  async function confirmCrop() {
    if (!cropPixels) return
    setProcessing(true)
    setError(null)
    try {
      const croppedFile = await cropAvatarImage(file, cropPixels)
      if (!activeRef.current) return
      const validationError = onConfirm(croppedFile)
      if (validationError) {
        setError(validationError)
        setProcessing(false)
      }
    } catch (error) {
      if (!activeRef.current) return
      const code = error instanceof CropAvatarImageError ? error.code : "export"
      const message =
        code === "decode"
          ? t("platformAccount.profileEditor.avatar.crop.errors.decode")
          : code === "canvas"
            ? t("platformAccount.profileEditor.avatar.crop.errors.canvas")
            : code === "invalid-crop"
              ? t(
                  "platformAccount.profileEditor.avatar.crop.errors.invalidCrop"
                )
              : t("platformAccount.profileEditor.avatar.crop.errors.export")
      setError(message)
      setProcessing(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !processing) onCancel()
      }}
    >
      <DialogContent
        safeArea="custom"
        showCloseButton={false}
        className="inset-x-[max(1rem,var(--safe-area-left))] top-[max(1rem,var(--safe-area-top))] bottom-[max(1rem,var(--safe-area-bottom))] mx-auto grid w-auto max-w-2xl grid-rows-[auto_minmax(14rem,1fr)_auto_auto] gap-4 overflow-hidden sm:top-1/2 sm:bottom-auto sm:w-[min(42rem,var(--overlay-safe-width))] sm:-translate-y-1/2 data-open:zoom-in-100 data-closed:zoom-out-100"
      >
        <DialogHeader className="pr-10">
          <DialogTitle>
            {t("platformAccount.profileEditor.avatar.crop.title")}
          </DialogTitle>
          <DialogDescription>
            {t("platformAccount.profileEditor.avatar.crop.description")}
          </DialogDescription>
        </DialogHeader>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2"
          aria-label={t("platformAccount.profileEditor.avatar.crop.close")}
          title={t("platformAccount.profileEditor.avatar.crop.close")}
          disabled={processing}
          onClick={onCancel}
        >
          <XIcon aria-hidden="true" />
        </Button>

        <div className="relative min-h-0 overflow-hidden rounded-lg bg-muted">
          {source ? (
            <Cropper
              image={source}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              minZoom={1}
              maxZoom={3}
              objectFit="cover"
              showGrid={false}
              roundCropAreaPixels
              keyboardStep={5}
              cropperProps={{
                "aria-label": t(
                  "platformAccount.profileEditor.avatar.crop.cropArea"
                ),
              }}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setCropPixels(pixels)}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <ImageIcon aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="grid gap-3">
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="avatar-crop-zoom">
                {t("platformAccount.profileEditor.avatar.crop.zoom")}
              </Label>
              <output className="text-sm text-muted-foreground">
                {t("platformAccount.profileEditor.avatar.crop.zoomValue", {
                  value: zoom.toFixed(1),
                })}
              </output>
            </div>
            <Slider
              id="avatar-crop-zoom"
              value={[zoom]}
              min={1}
              max={3}
              step={0.1}
              aria-label={t("platformAccount.profileEditor.avatar.crop.zoom")}
              thumbLabel={t("platformAccount.profileEditor.avatar.crop.zoom")}
              disabled={processing}
              onValueChange={(value) =>
                setZoom(Array.isArray(value) ? (value[0] ?? 1) : value)
              }
            />
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={processing}
            onClick={onCancel}
          >
            {t("platformAccount.profileEditor.avatar.crop.cancel")}
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={processing || !cropPixels}
            onClick={() => void confirmCrop()}
          >
            {processing ? (
              <LoaderCircleIcon
                data-icon="inline-start"
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <ImageIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {t("platformAccount.profileEditor.avatar.crop.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
