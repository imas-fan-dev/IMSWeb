import {
  CircleAlertIcon,
  FileImageIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useEffect, useState, type FormEvent, type ReactNode } from "react"
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
import { PublicationBadge } from "./card-inventory"
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
  headerless = false,
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
  /** 对话框把标题区提出去渲染到 dialog-header 时，这里不再重复。 */
  headerless?: boolean
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

  const notices: EditorNotice[] = [
    ...cardNotices(card, creating).map((notice) => ({
      ...notice,
      key: notice.title,
    })),
    ...(readOnlyReason
      ? [{ key: "read-only", title: "名片暂时只读", body: readOnlyReason }]
      : []),
    ...(feedback ? [feedbackNotice(feedback, reloadLatest, () => setFeedback(null))] : []),
  ]

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
    if (slots.length === 0) missing.push("media")
    return missing
  }

  const FIELD_MESSAGES: Record<string, string> = {
    producerName: "请填写制作人名称。",
    seriesCodes: "请至少选择一个所属企划。",
    media: "请至少添加一张名片图片。",
  }

  /** 跳到第一个缺失的字段，闪两下黄光，并把焦点放进去。 */
  function reportMissing(fields: readonly string[]) {
    setFeedback({
      kind: "error",
      message: fields.map((field) => FIELD_MESSAGES[field]).join(" "),
    })
    const target = document.querySelector<HTMLElement>(
      `[data-card-field="${fields[0]}"]`
    )
    if (!target) return
    target.scrollIntoView({ behavior: "smooth", block: "center" })
    target.classList.remove("card-field-flash")
    // Force a reflow so the animation restarts on repeated submits.
    void target.offsetWidth
    target.classList.add("card-field-flash")
    target.addEventListener(
      "animationend",
      () => target.classList.remove("card-field-flash"),
      { once: true }
    )
    target
      .querySelector<HTMLElement>(
        "input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])"
      )
      ?.focus({ preventScroll: true })
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
      {headerless ? null : (
        <CardModule mode={modes?.header}>
          <CardEditorHeading card={card} creating={creating} />
        </CardModule>
      )}

      <CardModule mode={modes?.notices}>
        <CardEditorNotices
          // 换卡或版本变化时重建，关掉的提示自然重新出现。
          key={`${card?.id ?? "new"}-${card?.revision ?? 0}`}
          notices={notices}
        />
      </CardModule>

      <CardModule mode={modes?.media}>
        <div className="mt-5" data-card-field="media">
          <p className="mb-2 text-sm font-medium">
            名片图片{" "}
            <span aria-hidden="true" className="ml-1 text-destructive">
              *
            </span>
          </p>
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
          modes={modes}
          onChange={setDraft}
        />

        <CardModule mode={modes?.actions}>
        <div className="mt-6 flex min-w-0 flex-wrap items-center justify-end gap-2">
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
            {saving ? "正在保存" : "保存并提交"}
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
type CardNotice = { title: string; body: string; destructive?: boolean }

function feedbackNotice(
  feedback: EditorFeedback,
  reloadLatest: () => Promise<void>,
  onDismiss: () => void
): EditorNotice {
  return {
    key: `feedback-${feedback.kind}`,
    title:
      feedback.kind === "success"
        ? "操作成功"
        : feedback.kind === "conflict"
          ? "名片版本冲突"
          : "操作未完成",
    body: feedback.message,
    destructive: feedback.kind === "error",
    action:
      feedback.kind === "conflict" ? (
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
      ) : undefined,
    onDismiss,
  }
}

type EditorNotice = {
  key: string
  title: string
  body: ReactNode
  destructive?: boolean
  action?: ReactNode
  onDismiss?: () => void
}

function cardNotices(
  card: FudabaOwnerCard | null,
  creating: boolean
): CardNotice[] {
  if (creating || !card) return []
  const notices: CardNotice[] = []
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
  return notices
}

/**
 * 状态提示悬挂在 dialog-body 顶部：滚动时不跟着走，可逐条关闭，
 * 出现与消失都是渐变，避免贴边的告警忽然跳出来。
 */
function CardEditorNotices({ notices }: { notices: readonly EditorNotice[] }) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())
  const [closing, setClosing] = useState<string | null>(null)

  const visible = notices.filter((notice) => !hidden.has(notice.key))
  if (visible.length === 0) return null

  function dismiss(notice: EditorNotice) {
    setClosing(notice.key)
    window.setTimeout(() => {
      setHidden((previous) => new Set(previous).add(notice.key))
      setClosing((current) => (current === notice.key ? null : current))
      notice.onDismiss?.()
    }, 160)
  }

  return (
    <div className="sticky top-0 z-20 space-y-2 px-0.5 pt-1 pb-3">
      {visible.map((notice) => (
        <Alert
          key={notice.key}
          variant={notice.destructive ? "destructive" : "default"}
          className={`relative overflow-hidden pr-10 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 ${
            closing === notice.key
              ? "motion-safe:animate-out motion-safe:fade-out-0"
              : ""
          }`}
        >
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>
            {notice.body}
            {notice.action}
          </AlertDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1.5 right-1.5"
            aria-label={`关闭提示：${notice.title}`}
            onClick={() => dismiss(notice)}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </Alert>
      ))}
    </div>
  )
}

/**
 * 标题区：主标题随场景变化，副标题是名片编号与版本，状态徽标只在名片管理页
 * 与后台出现；右侧的时间数据在窄屏时换行到下一行。
 */
export function CardEditorHeading({
  card,
  creating,
}: {
  card: FudabaOwnerCard | null
  creating: boolean
}) {
  return (
    // 右上角有关闭按钮，标题区整体留出它的宽度与上边距。
    <div className="flex min-w-0 flex-col gap-3 border-b pt-1 pr-5 pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 id="owned-card-editor-title" className="text-base font-medium">
          {creating ? "新建名片" : "编辑名片"}
        </h2>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-sm wrap-break-word text-muted-foreground">
            {creating
              ? "填写以下信息后提交审核，审核通过前只有你自己能看到这张名片。"
              : card
                ? `名片 #${card.cardNumber} · 版本 ${card.revision}`
                : "名片 #— · 版本 0"}
          </p>
          {!creating && card ? <PublicationBadge card={card} /> : null}
        </div>
      </div>
      {creating ? null : (
        <dl className="card-time mt-auto flex min-w-0 shrink-0 flex-col items-start gap-0.5 text-xs text-muted-foreground sm:items-end sm:self-end sm:text-right">
          <div className="block whitespace-nowrap">
            <dt className="inline">创建于 </dt>
            <dd className="inline">{formatCardTime(card?.createdAt)}</dd>
          </div>
          <div className="block whitespace-nowrap">
            <dt className="inline">更新于 </dt>
            <dd className="inline">{formatCardTime(card?.updatedAt)}</dd>
          </div>
        </dl>
      )}
    </div>
  )
}
