import {
  CircleAlertIcon,
  FileImageIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { Button } from "~/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import {
  createFudabaCard,
  deleteFudabaCard,
  updateFudabaCard,
  replaceFudabaCardMedia,
  type FudabaCardFields,
  type FudabaOwnerCard,
  type FudabaSeries,
  type PlatformProfile,
} from "~/lib/api"
import { CardDeleteDialog } from "./card-delete-dialog"
import {
  artworkSidesMismatch,
  buildMediaSubmit,
  CardMediaGallery,
  mediaSlotsFromCard,
  releaseMediaSlot,
  type MediaSlot,
} from "./card-media-gallery"
import { CardFields } from "./card-editor-fields"
import {
  CardModule,
  type CardModuleModes,
} from "./card-module"
import {
  apiMessage,
  isFeatureClosed,
  type EditorFeedback,
} from "../account-me-model"

import { cardFields, emptyCardFields, isCardConflict } from "./card-model"

export function CardEditor({
  card,
  creating,
  profile,
  series,
  readOnly,
  readOnlyReason,
  modes,
  onCreated,
  onSaved,
  onDeleted,
  onReload,
  onWriteClosed,
}: {
  card: FudabaOwnerCard | null
  creating: boolean
  profile: PlatformProfile
  series: FudabaSeries[]
  readOnly: boolean
  readOnlyReason: string | null
  /** 每个模块可单独设为仅显示 / 编辑 / 不可见。 */
  modes?: CardModuleModes
  onCreated: (card: FudabaOwnerCard) => void
  onSaved: (card: FudabaOwnerCard) => void
  onDeleted: (cardId: string) => void
  onReload: (cardId: string) => Promise<FudabaOwnerCard>
  onWriteClosed: () => void
}) {
  const [draft, setDraft] = useState<FudabaCardFields>(() =>
    card ? cardFields(card) : emptyCardFields(profile, series)
  )
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [feedback, setFeedback] = useState<EditorFeedback | null>(null)
  const [invalidFields, setInvalidFields] = useState<readonly string[]>([])
  const [aspectWarning, setAspectWarning] = useState(false)
  const [pendingSubmit, setPendingSubmit] = useState<(() => void) | null>(null)
  const [slots, setSlots] = useState<MediaSlot[]>(() =>
    card
      ? mediaSlotsFromCard({
          frontImageUrl: card.pendingContent?.frontImageUrl ?? card.frontImageUrl,
          middleImageUrls:
            card.pendingContent?.middleImageUrls ?? card.middleImageUrls,
          backImageUrl: card.pendingContent?.backImageUrl ?? card.backImageUrl,
        })
      : []
  )
  const [mediaDirty, setMediaDirty] = useState(false)

  useEffect(
    () => () => {
      for (const slot of slots) releaseMediaSlot(slot)
    },
    // Object URLs only have to be released when the editor unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  function updateSlots(next: MediaSlot[]) {
    setSlots(next)
    setMediaDirty(true)
  }

  function mutationFailure(error: unknown, fallback: string) {
    if (isCardConflict(error)) {
      setFeedback({
        kind: "conflict",
        message:
          "名片已在其他窗口更新。当前输入仍保留，请载入最新版本后再继续。",
      })
      return
    }
    if (isFeatureClosed(error)) {
      onWriteClosed()
      setFeedback({ kind: "error", message: "名片编辑当前未开放。" })
      return
    }
    setFeedback({ kind: "error", message: apiMessage(error, fallback) })
  }

  function seedSlots(next: FudabaOwnerCard) {
    for (const slot of slots) releaseMediaSlot(slot)
    setSlots(
      mediaSlotsFromCard({
        frontImageUrl: next.pendingContent?.frontImageUrl ?? next.frontImageUrl,
        middleImageUrls:
          next.pendingContent?.middleImageUrls ?? next.middleImageUrls,
        backImageUrl: next.pendingContent?.backImageUrl ?? next.backImageUrl,
      })
    )
    setMediaDirty(false)
  }

  function missingFields(): readonly string[] {
    const missing: string[] = []
    if (!draft.producerName.trim()) missing.push("producerName")
    if (draft.seriesCodes.length === 0) missing.push("seriesCodes")
    if (draft.favoriteCharacterIds.length === 0)
      missing.push("favoriteCharacterIds")
    if (slots.length === 0) missing.push("media")
    return missing
  }

  const FIELD_MESSAGES: Record<string, string> = {
    producerName: "请填写制作人名称。",
    seriesCodes: "请至少选择一个所属企划。",
    favoriteCharacterIds: "请至少选择一个担当角色。",
    media: "请至少添加一张名片图片。",
  }

  function reportMissing(fields: readonly string[]) {
    setInvalidFields(fields)
    setFeedback({
      kind: "error",
      message: fields.map((field) => FIELD_MESSAGES[field]).join(" "),
    })
    const target = document.querySelector(
      `[data-card-field="${fields[0]}"]`
    )
    target?.scrollIntoView({ behavior: "smooth", block: "center" })
    const focusable = target?.querySelector<HTMLElement>(
      "input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])"
    )
    focusable?.focus({ preventScroll: true })
  }

  /** 空着的署名行是编辑器给的默认行，提交前要丢掉。 */
  function submitFields(): FudabaCardFields {
    return {
      ...draft,
      credits: draft.credits.filter((credit) => credit.displayName.trim()),
    }
  }

  async function submitCard() {
    setSaving(true)
    setFeedback(null)
    setInvalidFields([])
    try {
      if (creating) {
        const files = slots.flatMap((slot) =>
          slot.kind === "new" ? [slot.file] : []
        )
        const front: File | undefined = files.at(0)
        if (!front) {
          reportMissing(["media"])
          return
        }
        const back = files.length > 1 ? files[files.length - 1] : undefined
        const images = files.length > 2 ? files.slice(1, files.length - 1) : []
        const result = await createFudabaCard({
          ...submitFields(),
          front,
          ...(back ? { back } : {}),
          images,
        }).send()
        setDraft(cardFields(result.card))
        onCreated(result.card)
        seedSlots(result.card)
        setFeedback({ kind: "success", message: "名片草稿已创建。" })
        toast.success("名片草稿已创建")
        return
      }
      if (!card) return
      let latest = card
      if (mediaDirty) {
        const media = await replaceFudabaCardMedia(
          card.id,
          buildMediaSubmit(slots),
          card.revision
        ).send()
        latest = media.card
        setDraft(cardFields(media.card))
        seedSlots(media.card)
        onSaved(media.card)
      }
      const result = await updateFudabaCard(card.id, {
        ...submitFields(),
        expectedRevision: latest.revision,
      }).send()
      setDraft(cardFields(result.card))
      onSaved(result.card)
      setFeedback({ kind: "success", message: "名片资料已保存。" })
      toast.success("名片资料已保存")
    } catch (error) {
      mutationFailure(error, "名片保存失败，请重试。")
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (readOnly) return
    const missing = missingFields()
    if (missing.length > 0) {
      reportMissing(missing)
      return
    }
    if (mediaDirty && (await artworkSidesMismatch(slots))) {
      setPendingSubmit(() => () => {
        setAspectWarning(false)
        void submitCard()
      })
      setAspectWarning(true)
      return
    }
    await submitCard()
  }

  async function removeCard() {
    if (!card) return
    setDeleting(true)
    setFeedback(null)
    try {
      await deleteFudabaCard(card.id, card.revision).send()
      setDeleteOpen(false)
      onDeleted(card.id)
      toast.success("名片已删除")
    } catch (error) {
      setDeleteOpen(false)
      mutationFailure(error, "名片删除失败，请重试。")
    } finally {
      setDeleting(false)
    }
  }

  async function reloadLatest() {
    if (!card) return
    try {
      const latest = await onReload(card.id)
      setDraft(cardFields(latest))
      setFeedback({ kind: "success", message: "已载入最新名片版本。" })
    } catch (error) {
      setFeedback({
        kind: "error",
        message: apiMessage(error, "最新名片载入失败，请重试。"),
      })
    }
  }

  const busy = saving || deleting
  const editDisabled = readOnly || busy

  if (creating && readOnly && !card) {
    return (
      <Empty className="min-h-80 border-y">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileImageIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>名片编辑暂未开放</EmptyTitle>
          <EmptyDescription>
            {readOnlyReason || "当前帐号只能查看已有内容。"}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <section className="min-w-0" aria-labelledby="owned-card-editor-title">
      <CardModule mode={modes?.header}>
      <div className="flex min-w-0 flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="owned-card-editor-title" className="text-base font-medium">
            {creating ? "新建名片" : "编辑名片"}
          </h2>
          <p className="mt-1 text-sm wrap-break-word text-muted-foreground">
            {creating
              ? "填写以下信息后提交审核，审核通过前只有你自己能看到这张名片。"
              : card
                ? `名片 #${card.cardNumber} · 版本 ${card.revision}`
                : "名片 #— · 版本 0"}
          </p>
        </div>
        <dl className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground sm:justify-end sm:text-right">
          {creating ? null : (
            <>
              <div>
                <dt className="inline">创建于 </dt>
                <dd className="inline">{formatCardTime(card?.createdAt)}</dd>
              </div>
              <div>
                <dt className="inline">更新于 </dt>
                <dd className="inline">{formatCardTime(card?.updatedAt)}</dd>
              </div>
            </>
          )}
        </dl>
      </div>
      </CardModule>

      <CardModule mode={modes?.notices}>
        <CardEditorNotices card={card} creating={creating} />
      </CardModule>

      {readOnlyReason ? (
        <Alert className="mt-4">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>名片暂时只读</AlertTitle>
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
                ? "名片版本冲突"
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
                载入最新名片
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <CardModule mode={modes?.media}>
        <div className="mt-5" data-card-field="media">
          <CardMediaGallery
            slots={slots}
            disabled={editDisabled || modes?.media === "view"}
            onChange={updateSlots}
            onError={(message) => setFeedback({ kind: "error", message })}
          />
        </div>
      </CardModule>

      {/* The editor renders its own required-field feedback, so the native
          bubbles must not pre-empt it. The server validates every field. */}
      <form
        className="mt-6"
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
      >
        <CardFields
          draft={draft}
          series={series}
          disabled={editDisabled}
          invalidFields={invalidFields}
          modes={modes}
          onChange={setDraft}
        />

        <CardModule mode={modes?.actions}>
        <div className="mt-6 flex min-w-0 flex-wrap items-center gap-2">
          <Button type="submit" disabled={editDisabled}>
            {saving ? (
              <LoaderCircleIcon
                data-icon="inline-start"
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : creating ? (
              <PlusIcon data-icon="inline-start" aria-hidden="true" />
            ) : (
              <SaveIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {saving ? "正在保存" : creating ? "创建名片草稿" : "保存并提交"}
          </Button>
          {!creating && card ? (
            <Button
              type="button"
              variant="destructive"
              disabled={editDisabled}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2Icon data-icon="inline-start" aria-hidden="true" />
              删除名片
            </Button>
          ) : null}
        </div>
        </CardModule>
      </form>

      <ConfirmActionDialog
        open={aspectWarning}
        submitting={false}
        variant="default"
        title="正反面尺寸不一致"
        description="正面与背面的宽高比例不同，打印或裁切时可能无法对齐。确认继续提交吗？"
        confirmLabel="仍然提交"
        onOpenChange={(open) => {
          if (!open) {
            setAspectWarning(false)
            setPendingSubmit(null)
          }
        }}
        onConfirm={() => pendingSubmit?.()}
      />

      <CardDeleteDialog
        open={deleteOpen}
        deleting={deleting}
        displayName={card?.producerName ?? "当前名片"}
        onOpenChange={setDeleteOpen}
        onConfirm={() => void removeCard()}
      />
    </section>
  )
}

function formatCardTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString("zh-CN") : "—"
}

/**
 * 消息提示区：告诉拥有者这张名片为什么处于审核、复核或锁定状态。
 * 每种情况单独一条，互不覆盖。
 */
function CardEditorNotices({
  card,
  creating,
}: {
  card: FudabaOwnerCard | null
  creating: boolean
}) {
  if (creating || !card) return null
  const notices: { title: string; body: string; destructive?: boolean }[] = []
  if (card.publicationStatus === "locked") {
    notices.push({
      title: "名片已锁定",
      body: `${card.reviewReason ? `${card.reviewReason}。` : ""}锁定期间无法修改或提交，请联系管理员解锁。`,
      destructive: true,
    })
  } else if (card.publicationStatus === "rejected") {
    notices.push({
      title: "名片未通过审核",
      body: `${card.reviewReason ? `驳回理由：${card.reviewReason}。` : ""}按提示修改后可以重新提交。`,
      destructive: true,
    })
  } else if (card.publicationStatus === "pending") {
    notices.push({
      title: "名片正在审核中",
      body: "审核通过前不会展示在名片墙上，期间仍可继续修改并重新提交。",
    })
  }
  if (card.reviewStatus === "pending") {
    notices.push({
      title: "新版本正在复核",
      body: "复核期间名片墙继续展示此前的版本，通过后才会替换。",
    })
  } else if (card.reviewStatus === "rejected") {
    notices.push({
      title: "新版本未通过复核",
      body: `${card.reviewReason ? `理由：${card.reviewReason}。` : ""}此前已发布的版本仍然有效。`,
      destructive: true,
    })
  }
  if (notices.length === 0) return null
  return (
    <div className="mt-4 space-y-2">
      {notices.map((notice) => (
        <Alert key={notice.title} variant={notice.destructive ? "destructive" : "default"}>
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>{notice.body}</AlertDescription>
        </Alert>
      ))}
    </div>
  )
}
