import {
  CircleAlertIcon,
  ImageUpIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SaveIcon,
  UserRoundIcon,
} from "lucide-react"
import { useState, type FormEvent } from "react"
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
  const [draft, setDraft] = useState(() => profileFields(profile))
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
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
        message:
          "资料已在其他窗口更新。当前输入仍保留，请载入最新版本后再修改。",
      })
      return
    }
    if (isFeatureClosed(error)) {
      onWriteClosed()
      setFeedback({
        kind: "error",
        message: "资料与名片编辑当前未开放。",
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
      setFeedback({ kind: "success", message: "制作人资料已保存。" })
      toast.success("制作人资料已保存")
    } catch (error) {
      mutationFailure(error, "制作人资料保存失败，请重试。")
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
      setFeedback({ kind: "success", message: "头像已更新。" })
      toast.success("头像已更新")
    } catch (error) {
      mutationFailure(error, "头像上传失败，请检查图片后重试。")
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function reloadLatest() {
    try {
      const latest = await onReload()
      setDraft(profileFields(latest))
      setFeedback({ kind: "success", message: "已载入最新制作人资料。" })
    } catch (error) {
      setFeedback({
        kind: "error",
        message: apiMessage(error, "最新资料载入失败，请重试。"),
      })
    }
  }

  const busy = saving || preparingAvatar || uploadingAvatar

  return (
    <section
      className="max-w-3xl min-w-0"
      aria-labelledby="profile-editor-title"
    >
      <div className="flex min-w-0 items-start justify-between gap-3 border-b pb-5">
        <div className="min-w-0">
          <h2 id="profile-editor-title" className="text-xl font-semibold">
            个人资料
          </h2>
          <p className="mt-2 text-sm/6 text-muted-foreground">
            更新头像、显示名称、常驻城市和个人简介。
          </p>
        </div>
        {readOnly ? <Badge variant="secondary">只读</Badge> : null}
      </div>

      {readOnlyReason ? (
        <Alert className="mt-4">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>资料暂时只读</AlertTitle>
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
              ? "操作成功"
              : feedback.kind === "conflict"
                ? "资料版本冲突"
                : "操作未完成"}
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
                载入最新资料
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-5">
        <Field data-disabled={readOnly || undefined}>
          <FieldLabel htmlFor="exchange-profile-avatar">头像</FieldLabel>
          <FileUploadControl
            id="exchange-profile-avatar"
            compact
            accept="image/*"
            emptyTitle="选择新头像"
            emptyDetail="图片文件 · 不超过 5 MiB"
            fileKind="头像"
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
            {uploadingAvatar ? "正在上传" : "上传头像"}
          </Button>
        </Field>
      </div>

      <form className="mt-6" onSubmit={(event) => void saveProfile(event)}>
        <FieldGroup>
          <Field data-disabled={readOnly || undefined}>
            <FieldLabel htmlFor="exchange-profile-name">显示名称</FieldLabel>
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
            <FieldLabel htmlFor="exchange-profile-city">常驻城市</FieldLabel>
            <Input
              id="exchange-profile-city"
              value={draft.homeCity}
              maxLength={100}
              disabled={readOnly || busy}
              placeholder="例如：上海"
              onChange={(event) => {
                const homeCity = event.currentTarget.value
                setDraft((current) => ({
                  ...current,
                  homeCity,
                }))
              }}
            />
            <FieldDescription>用于交换资料展示，可留空。</FieldDescription>
          </Field>
          <Field data-disabled={readOnly || undefined}>
            <FieldLabel htmlFor="exchange-profile-bio">个人简介</FieldLabel>
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
          {saving ? "正在保存" : "保存资料"}
        </Button>
      </form>
    </section>
  )
}
