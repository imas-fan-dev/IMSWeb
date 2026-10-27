import {
  EllipsisIcon,
  ImageUpIcon,
  LoaderCircleIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Field, FieldDescription, FieldTitle } from "~/components/ui/field"
import { useAppPreparedImage } from "~/lib/media/use-app-prepared-image"
import type { PlatformProfile } from "~/lib/api"
import { AvatarCropDialog } from "./avatar-crop-dialog"

export function AvatarUploadEditor({
  profile,
  disabled,
  onBusyChange,
  onError,
  onClearFeedback,
  validate,
  onUpload,
  onRemove,
}: {
  profile: PlatformProfile
  disabled: boolean
  onBusyChange: (busy: boolean) => void
  onError: (message: string) => void
  onClearFeedback: () => void
  validate: (file: File) => string | null
  onUpload: (file: File) => Promise<boolean>
  onRemove: () => Promise<boolean>
}) {
  const { t } = useTranslation()
  const avatarSource = profile.avatarUrl
  const [cropOpen, setCropOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<{
    file: File
    source: string
  } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [failedImageSource, setFailedImageSource] = useState<string | null>(
    null
  )
  const mountedRef = useRef(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const {
    browse,
    clear: clearPrepared,
    file: selectedFile,
    preparing,
    selectFile,
  } = useAppPreparedImage({
    mediaKind: "platform-avatar",
    validate,
    onError,
    onSelected: () => {
      onClearFeedback()
      setCropOpen(true)
    },
  })

  function clearPending() {
    setPendingPreview(null)
    setPendingFile(null)
  }

  function stagePendingFile(file: File) {
    setPendingPreview(null)
    setPendingFile(file)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!pendingFile) return

    const source = URL.createObjectURL(pendingFile)
    let active = true
    queueMicrotask(() => {
      if (active) setPendingPreview({ file: pendingFile, source })
    })
    return () => {
      active = false
      URL.revokeObjectURL(source)
    }
  }, [pendingFile])

  useEffect(() => {
    if (!selectedFile && inputRef.current) inputRef.current.value = ""
  }, [selectedFile])

  const operationBusy = preparing || cropOpen || uploading || removing

  useEffect(() => {
    onBusyChange(operationBusy)
  }, [onBusyChange, operationBusy])

  useEffect(() => () => onBusyChange(false), [onBusyChange])

  const busy = disabled || preparing || cropOpen || uploading || removing
  const candidateSource =
    pendingPreview?.file === pendingFile ? pendingPreview.source : avatarSource
  const displaySource =
    candidateSource && candidateSource !== failedImageSource
      ? candidateSource
      : null
  const fallbackInitial = profile.displayName.trim().slice(0, 1).toUpperCase()
  const showingPending = Boolean(
    pendingFile && pendingPreview?.file === pendingFile
  )
  const statusKey = showingPending
    ? "platformAccount.profileEditor.avatar.pending"
    : profile.avatarUrl
      ? "platformAccount.profileEditor.avatar.current"
      : "platformAccount.profileEditor.avatar.fallback"
  const detailKey = showingPending
    ? "platformAccount.profileEditor.avatar.pendingDetail"
    : profile.avatarUrl
      ? "platformAccount.profileEditor.avatar.currentDetail"
      : "platformAccount.profileEditor.avatar.fallbackDetail"

  function cancelCrop() {
    if (uploading || removing) return
    setCropOpen(false)
    clearPrepared()
  }

  function confirmCrop(file: File) {
    const invalid = validate(file)
    if (invalid) return invalid
    onClearFeedback()
    stagePendingFile(file)
    setCropOpen(false)
    clearPrepared()
    return null
  }

  function cancelPendingChanges() {
    if (busy) return
    clearPrepared()
    clearPending()
    onClearFeedback()
  }

  async function upload() {
    const file = pendingFile
    if (!file || busy) return
    setUploading(true)
    try {
      if ((await onUpload(file)) && mountedRef.current) {
        clearPending()
      }
    } finally {
      if (mountedRef.current) setUploading(false)
    }
  }

  async function remove() {
    if (busy) return
    setRemoving(true)
    try {
      if ((await onRemove()) && mountedRef.current) {
        setRemoveOpen(false)
        clearPrepared()
        clearPending()
      }
    } finally {
      if (mountedRef.current) setRemoving(false)
    }
  }

  return (
    <>
      <div className="py-1">
        <Field data-disabled={disabled || undefined}>
          <div className="relative flex flex-wrap items-center justify-center gap-2 lg:justify-start">
            <FieldTitle>
              {t("platformAccount.profileEditor.avatar.label")}
            </FieldTitle>
            <Badge variant="secondary">{t(statusKey)}</Badge>
            {profile.avatarUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute right-0 lg:static lg:ml-auto"
                aria-label={t("platformAccount.profileEditor.avatar.remove")}
                title={t("platformAccount.profileEditor.avatar.remove")}
                disabled={busy}
                onClick={() => setRemoveOpen(true)}
              >
                <EllipsisIcon aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="group/avatar relative mt-3 size-20! shrink-0 self-center rounded-full p-0 hover:bg-transparent lg:self-start"
            aria-label={t("platformAccount.profileEditor.avatar.select")}
            title={t("platformAccount.profileEditor.avatar.select")}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Avatar
              size="lg"
              className="pointer-events-none data-[size=lg]:size-20"
            >
              {displaySource ? (
                <AvatarImage
                  src={displaySource}
                  alt={t(
                    showingPending
                      ? "platformAccount.profileEditor.avatar.preview"
                      : "platformAccount.profileEditor.avatar.current"
                  )}
                  onError={() => setFailedImageSource(candidateSource)}
                />
              ) : null}
              <AvatarFallback>{fallbackInitial}</AvatarFallback>
            </Avatar>
            <span className="absolute right-0 bottom-0 flex size-7 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors group-hover/avatar:border-primary group-hover/avatar:text-primary group-focus-visible/avatar:border-ring group-focus-visible/avatar:text-primary">
              <ImageUpIcon className="size-3.5" aria-hidden="true" />
            </span>
          </Button>
          {showingPending || !profile.avatarUrl ? (
            <FieldDescription className="mt-2 text-center lg:text-left">
              {t(detailKey)}
            </FieldDescription>
          ) : null}

          <input
            ref={inputRef}
            id="exchange-profile-avatar"
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            aria-label={t("platformAccount.profileEditor.avatar.label")}
            aria-busy={preparing || uploading}
            onClick={(event) => {
              if (!browse) return
              event.preventDefault()
              void browse()
            }}
            onChange={(event) =>
              selectFile(event.currentTarget.files?.[0] ?? null)
            }
          />

          {pendingFile ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                className="min-h-11 sm:self-start"
                disabled={busy}
                onClick={() => void upload()}
              >
                {uploading ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <ImageUpIcon data-icon="inline-start" aria-hidden="true" />
                )}
                {uploading
                  ? t("platformAccount.profileEditor.avatar.uploading")
                  : t("platformAccount.profileEditor.avatar.save")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 sm:self-start"
                disabled={busy}
                onClick={cancelPendingChanges}
              >
                {t("platformAccount.profileEditor.avatar.cancelChanges")}
              </Button>
            </div>
          ) : null}
        </Field>
      </div>

      {cropOpen && selectedFile ? (
        <AvatarCropDialog
          file={selectedFile}
          onCancel={cancelCrop}
          onConfirm={confirmCrop}
        />
      ) : null}

      <AlertDialog
        open={removeOpen}
        onOpenChange={(nextOpen) => {
          if (!removing) setRemoveOpen(nextOpen)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="text-destructive">
              <Trash2Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t("platformAccount.profileEditor.avatar.removeConfirm.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "platformAccount.profileEditor.avatar.removeConfirm.description"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>
              {t("platformAccount.profileEditor.avatar.crop.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={removing}
              onClick={() => void remove()}
            >
              {removing ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Trash2Icon data-icon="inline-start" aria-hidden="true" />
              )}
              {removing
                ? t("platformAccount.profileEditor.avatar.removing")
                : t(
                    "platformAccount.profileEditor.avatar.removeConfirm.confirm"
                  )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
