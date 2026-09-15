import {
  ImageUpIcon,
  LoaderCircleIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { usePlatformAvatarSource } from "~/components/platform/use-platform-avatar-source"
import { FileUploadControl } from "~/components/shared/file-upload-control"
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
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import { useAppPreparedImage } from "~/lib/media/use-app-prepared-image"
import type { PlatformProfile } from "~/lib/api"
import { AvatarCropDialog } from "./avatar-crop-dialog"

export function AvatarUploadEditor({
  profile,
  accountId,
  disabled,
  onBusyChange,
  onError,
  onClearFeedback,
  validate,
  onUpload,
  onRemove,
}: {
  profile: PlatformProfile
  accountId?: string | null
  disabled: boolean
  onBusyChange: (busy: boolean) => void
  onError: (message: string) => void
  onClearFeedback: () => void
  validate: (file: File) => string | null
  onUpload: (file: File) => Promise<boolean>
  onRemove: () => Promise<boolean>
}) {
  const { t } = useTranslation()
  const avatarSource = usePlatformAvatarSource(profile.avatarUrl, accountId)
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
      <div className="mt-5 border-y py-5">
        <Field data-disabled={disabled || undefined}>
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar size="lg" className="size-24 self-center sm:self-start">
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
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <FieldLabel htmlFor="exchange-profile-avatar">
                  {t("platformAccount.profileEditor.avatar.label")}
                </FieldLabel>
                <Badge variant="secondary">{t(statusKey)}</Badge>
              </div>
              <FieldDescription className="mt-1">
                {t(detailKey)}
              </FieldDescription>
            </div>
          </div>

          <div className="mt-4">
            <FileUploadControl
              id="exchange-profile-avatar"
              compact
              accept="image/*"
              emptyTitle={t(
                pendingFile
                  ? "platformAccount.profileEditor.avatar.change"
                  : "platformAccount.profileEditor.avatar.select"
              )}
              emptyDetail={t(
                "platformAccount.profileEditor.avatar.emptyDetail"
              )}
              fileKind={t("platformAccount.profileEditor.avatar.fileKind")}
              file={selectedFile}
              disabled={busy}
              preparing={preparing}
              uploading={uploading}
              selectedIcon={UserRoundIcon}
              emptyIcon={ImageUpIcon}
              onBrowse={browse}
              onSelect={selectFile}
            />
          </div>

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

          {profile.avatarUrl ? (
            <Button
              type="button"
              variant="ghost"
              className="mt-4 min-h-11 self-start text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => setRemoveOpen(true)}
            >
              <Trash2Icon data-icon="inline-start" aria-hidden="true" />
              {t("platformAccount.profileEditor.avatar.remove")}
            </Button>
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
