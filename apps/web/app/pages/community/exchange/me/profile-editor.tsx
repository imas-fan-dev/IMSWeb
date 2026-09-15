import {
  CircleAlertIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SaveIcon,
} from "lucide-react"
import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

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
import {
  apiMessage,
  isFeatureClosed,
  isProfileConflict,
  profileFields,
  validateImage,
  type EditorFeedback,
} from "./exchange-me-model"
import { AvatarUploadEditor } from "./components/avatar-upload-editor"

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

export function ProfileEditor({
  profile,
  accountId,
  readOnly,
  readOnlyReason,
  onSaved,
  onReload,
  isOperationCurrent,
  onWriteClosed,
}: {
  profile: PlatformProfile
  accountId?: string | null
  readOnly: boolean
  readOnlyReason: string | null
  onSaved: (profile: PlatformProfile) => boolean
  onReload: () => Promise<PlatformProfile | null>
  isOperationCurrent: () => boolean
  onWriteClosed: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(() => profileFields(profile))
  const [saving, setSaving] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [feedback, setFeedback] = useState<EditorFeedback | null>(null)

  function mutationFailure(error: unknown, fallback: string) {
    if (!isOperationCurrent()) return
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
      if (!onSaved(result.profile)) return
      setDraft(profileFields(result.profile))
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

  async function uploadAvatar(file: File) {
    setFeedback(null)
    try {
      const result = await uploadPlatformAvatar({
        image: file,
        expectedUpdatedAt: profile.updatedAt,
      }).send()
      if (!onSaved(result.profile)) return false
      setDraft(profileFields(result.profile))
      setFeedback({
        kind: "success",
        message: t("platformAccount.profileEditor.avatar.updated"),
      })
      toast.success(t("platformAccount.profileEditor.avatar.updatedToast"))
      return true
    } catch (error) {
      mutationFailure(
        error,
        t("platformAccount.profileEditor.avatar.uploadFailed")
      )
      return false
    }
  }

  async function removeAvatar() {
    setFeedback(null)
    try {
      const result = await removePlatformAvatar(profile.updatedAt).send()
      if (!onSaved(result.profile)) return false
      setDraft(profileFields(result.profile))
      setFeedback({
        kind: "success",
        message: t("platformAccount.profileEditor.avatar.removed"),
      })
      toast.success(t("platformAccount.profileEditor.avatar.removedToast"))
      return true
    } catch (error) {
      mutationFailure(
        error,
        t("platformAccount.profileEditor.avatar.removeFailed")
      )
      return false
    }
  }

  async function reloadLatest() {
    try {
      const latest = await onReload()
      if (!latest) return
      setDraft(profileFields(latest))
      setFeedback({
        kind: "success",
        message: t("platformAccount.profileEditor.reloaded"),
      })
    } catch (error) {
      if (!isOperationCurrent()) return
      setFeedback({
        kind: "error",
        message: apiMessage(
          error,
          t("platformAccount.profileEditor.reloadFailed")
        ),
      })
    }
  }

  const busy = saving || avatarBusy

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

      <AvatarUploadEditor
        key={accountId ?? "no-account"}
        profile={profile}
        disabled={readOnly || saving}
        onBusyChange={setAvatarBusy}
        onError={(message) => setFeedback({ kind: "error", message })}
        onClearFeedback={() => setFeedback(null)}
        validate={(file) => validateImage(file, MAX_AVATAR_BYTES)}
        onUpload={uploadAvatar}
        onRemove={removeAvatar}
      />

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
