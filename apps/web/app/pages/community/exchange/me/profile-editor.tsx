import {
  CircleAlertIcon,
  ImageUpIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react"
import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { FileUploadControl } from "~/components/shared/file-upload-control"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import {
  updatePlatformProfile,
  removePlatformAvatar,
  uploadPlatformAvatar,
  type PlatformProfile,
} from "~/lib/api"
import { useAppPreparedImage } from "~/lib/media/use-app-prepared-image"
import {
  apiMessage,
  isFeatureClosed,
  isProfileConflict,
  profileFields,
  validateImage,
  type EditorFeedback,
} from "./exchange-me-model"

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

export function ProfileEditor({
  profile,
  readOnly,
  readOnlyReason,
  onSaved,
  onReload,
  onWriteClosed,
}: {
  profile: PlatformProfile
  readOnly: boolean
  readOnlyReason: string | null
  onSaved: (profile: PlatformProfile) => void
  onReload: () => Promise<PlatformProfile>
  onWriteClosed: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(() => profileFields(profile))
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [removingAvatar, setRemovingAvatar] = useState(false)
  const [feedback, setFeedback] = useState<EditorFeedback | null>(null)
  const {
    browse: browseAvatar,
    clear: clearAvatar,
    file: avatarFile,
    preparing: preparingAvatar,
    selectFile: selectAvatar,
  } = useAppPreparedImage({
    mediaKind: "platform-avatar",
    validate: (file) => validateImage(file, MAX_AVATAR_BYTES),
    onError: (message) => setFeedback({ kind: "error", message }),
    onSelected: () => setFeedback(null),
  })

  function mutationFailure(error: unknown, fallback: string) {
    if (isProfileConflict(error)) {
      setFeedback({
        kind: "conflict",
        message: t("platformAccount.profileEditor.conflictMessage"),
      })
      return
    }
    if (isFeatureClosed(error)) {
      onWriteClosed()
      setFeedback({
        kind: "error",
        message: t("platformAccount.profileEditor.writeClosed"),
      })
      return
    }
    setFeedback({ kind: "error", message: apiMessage(error, fallback) })
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      const result = await updatePlatformProfile({
        displayName: draft.displayName,
        homeCity: draft.homeCity || null,
        bio: draft.bio,
        expectedUpdatedAt: profile.updatedAt,
      }).send()
      setDraft(profileFields(result.profile))
      onSaved(result.profile)
      setFeedback({
        kind: "success",
        message: t("platformAccount.profileEditor.saved"),
      })
      toast.success(t("platformAccount.profileEditor.savedToast"))
    } catch (error) {
      mutationFailure(error, t("platformAccount.profileEditor.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  async function uploadAvatar() {
    if (!avatarFile) return
    setUploadingAvatar(true)
    setFeedback(null)
    try {
      const result = await uploadPlatformAvatar({
        image: avatarFile,
        expectedUpdatedAt: profile.updatedAt,
      }).send()
      setDraft(profileFields(result.profile))
      onSaved(result.profile)
      clearAvatar()
      setFeedback({
        kind: "success",
        message: t("platformAccount.profileEditor.avatar.updated"),
      })
      toast.success(t("platformAccount.profileEditor.avatar.updatedToast"))
    } catch (error) {
      mutationFailure(
        error,
        t("platformAccount.profileEditor.avatar.uploadFailed")
      )
    } finally {
      setUploadingAvatar(false)
    }
  }

  // `clearAvatar()` only drops the locally staged file. This removes the avatar
  // the server already stores, under the same optimistic fence as a save.
  async function removeAvatar() {
    setRemovingAvatar(true)
    setFeedback(null)
    try {
      const result = await removePlatformAvatar(profile.updatedAt).send()
      setDraft(profileFields(result.profile))
      onSaved(result.profile)
      clearAvatar()
      setFeedback({
        kind: "success",
        message: t("platformAccount.profileEditor.avatar.removed"),
      })
      toast.success(t("platformAccount.profileEditor.avatar.removedToast"))
    } catch (error) {
      mutationFailure(
        error,
        t("platformAccount.profileEditor.avatar.removeFailed")
      )
    } finally {
      setRemovingAvatar(false)
    }
  }

  async function reloadLatest() {
    try {
      const latest = await onReload()
      setDraft(profileFields(latest))
      setFeedback({
        kind: "success",
        message: t("platformAccount.profileEditor.reloaded"),
      })
    } catch (error) {
      setFeedback({
        kind: "error",
        message: apiMessage(
          error,
          t("platformAccount.profileEditor.reloadFailed")
        ),
      })
    }
  }

  const busy = saving || preparingAvatar || uploadingAvatar || removingAvatar

  return (
    <section
      className="max-w-3xl min-w-0"
      aria-labelledby="profile-editor-title"
    >
      <div className="flex min-w-0 items-start justify-between gap-3 border-b pb-5">
        <div className="min-w-0">
          <h2 id="profile-editor-title" className="text-xl font-semibold">
            {t("platformAccount.profileEditor.title")}
          </h2>
          <p className="mt-2 text-sm/6 text-muted-foreground">
            {t("platformAccount.profileEditor.description")}
          </p>
        </div>
        {readOnly ? (
          <Badge variant="secondary">
            {t("platformAccount.profileEditor.readOnlyBadge")}
          </Badge>
        ) : null}
      </div>

      {readOnlyReason ? (
        <Alert className="mt-4">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>
            {t("platformAccount.profileEditor.readOnlyTitle")}
          </AlertTitle>
          <AlertDescription>{readOnlyReason}</AlertDescription>
        </Alert>
      ) : null}

      {feedback ? (
        <Alert
          className="mt-4"
          variant={feedback.kind === "error" ? "destructive" : "default"}
        >
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>
            {feedback.kind === "success"
              ? t("platformAccount.profileEditor.feedback.successTitle")
              : feedback.kind === "conflict"
                ? t("platformAccount.profileEditor.feedback.conflictTitle")
                : t("platformAccount.profileEditor.feedback.errorTitle")}
          </AlertTitle>
          <AlertDescription>
            <p>{feedback.message}</p>
            {feedback.kind === "conflict" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void reloadLatest()}
              >
                <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                {t("platformAccount.profileEditor.feedback.reload")}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-5">
        <Field data-disabled={readOnly || undefined}>
          <FieldLabel htmlFor="exchange-profile-avatar">
            {t("platformAccount.profileEditor.avatar.label")}
          </FieldLabel>
          <FileUploadControl
            id="exchange-profile-avatar"
            compact
            accept="image/*"
            emptyTitle={t("platformAccount.profileEditor.avatar.emptyTitle")}
            emptyDetail={t("platformAccount.profileEditor.avatar.emptyDetail")}
            fileKind={t("platformAccount.profileEditor.avatar.fileKind")}
            file={avatarFile}
            disabled={readOnly || saving}
            preparing={preparingAvatar}
            uploading={uploadingAvatar}
            selectedIcon={UserRoundIcon}
            emptyIcon={ImageUpIcon}
            onBrowse={browseAvatar}
            onSelect={selectAvatar}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={readOnly || busy || !avatarFile}
            onClick={() => void uploadAvatar()}
          >
            {uploadingAvatar ? (
              <LoaderCircleIcon
                data-icon="inline-start"
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <ImageUpIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {uploadingAvatar
              ? t("platformAccount.profileEditor.avatar.uploading")
              : t("platformAccount.profileEditor.avatar.upload")}
          </Button>
          {profile.avatarUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              disabled={readOnly || busy}
              onClick={() => void removeAvatar()}
            >
              {removingAvatar ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Trash2Icon data-icon="inline-start" aria-hidden="true" />
              )}
              {removingAvatar
                ? t("platformAccount.profileEditor.avatar.removing")
                : t("platformAccount.profileEditor.avatar.remove")}
            </Button>
          ) : null}
        </Field>
      </div>

      <form className="mt-6" onSubmit={(event) => void saveProfile(event)}>
        <FieldGroup>
          <Field data-disabled={readOnly || undefined}>
            <FieldLabel htmlFor="exchange-profile-name">
              {t("platformAccount.profileEditor.fields.displayName")}
            </FieldLabel>
            <Input
              id="exchange-profile-name"
              value={draft.displayName}
              maxLength={80}
              required
              disabled={readOnly || busy}
              onChange={(event) => {
                const displayName = event.currentTarget.value
                setDraft((current) => ({
                  ...current,
                  displayName,
                }))
              }}
            />
          </Field>
          <Field data-disabled={readOnly || undefined}>
            <FieldLabel htmlFor="exchange-profile-city">
              {t("platformAccount.profileEditor.fields.homeCity")}
            </FieldLabel>
            <Input
              id="exchange-profile-city"
              value={draft.homeCity}
              maxLength={100}
              disabled={readOnly || busy}
              placeholder={t(
                "platformAccount.profileEditor.fields.homeCityPlaceholder"
              )}
              onChange={(event) => {
                const homeCity = event.currentTarget.value
                setDraft((current) => ({
                  ...current,
                  homeCity,
                }))
              }}
            />
            <FieldDescription>
              {t("platformAccount.profileEditor.fields.homeCityDescription")}
            </FieldDescription>
          </Field>
          <Field data-disabled={readOnly || undefined}>
            <FieldLabel htmlFor="exchange-profile-bio">
              {t("platformAccount.profileEditor.fields.bio")}
            </FieldLabel>
            <Textarea
              id="exchange-profile-bio"
              value={draft.bio}
              maxLength={2000}
              disabled={readOnly || busy}
              className="min-h-28 resize-y"
              onChange={(event) => {
                const bio = event.currentTarget.value
                setDraft((current) => ({
                  ...current,
                  bio,
                }))
              }}
            />
          </Field>
        </FieldGroup>
        <Button
          type="submit"
          className="mt-5 w-full"
          disabled={readOnly || busy || !draft.displayName.trim()}
        >
          {saving ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <SaveIcon data-icon="inline-start" aria-hidden="true" />
          )}
          {saving
            ? t("platformAccount.profileEditor.saving")
            : t("platformAccount.profileEditor.save")}
        </Button>
      </form>
    </section>
  )
}
