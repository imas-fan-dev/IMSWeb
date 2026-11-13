import {
  CheckIcon,
  LoaderCircleIcon,
  SaveIcon,
  SearchIcon,
  Trash2Icon,
  UserRoundIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Separator } from "~/components/ui/separator"
import { Textarea } from "~/components/ui/textarea"
import { emptyCredit } from "~/pages/account/me/namecards/card-credits-editor"
import { CardFields } from "~/pages/account/me/namecards/card-editor-fields"
import {
  CardMediaGallery,
  type MediaSlot,
} from "~/pages/account/me/namecards/card-media-gallery"
import {
  deleteAdminNamecard,
  approveAdminNamecard,
  getAdminNamecardDiff,
  getAdminPlatformUsers,
  getPublicFudabaSeries,
  isApiError,
  resolveAdminNamecardFeedback,
  updateAdminNamecard,
  type AdminNamecardDiff,
  type AdminPlatformUser,
  type FudabaCardFields,
  type FudabaSeries,
  type NamecardDiffSide,
  type NamecardFeedbackReason,
} from "~/lib/api"
import { feedbackReasonLabel } from "~/pages/community/exchange/components/namecard-feedback-model"
import { NAMECARD_STATUS_OPTIONS } from "./namecard-status-options"

const REVIEW_OPTIONS = [
  { value: "approved", label: "已通过（提升待审版本）" },
  { value: "none", label: "无（丢弃待审版本）" },
  { value: "pending", label: "待审核" },
  { value: "rejected", label: "已驳回" },
  { value: "locked", label: "违规锁定" },
] as const

const REASON_LIMIT = 400

function manageDisplaySide(card: AdminNamecardDiff): NamecardDiffSide {
  return card.reviewStatus !== null && card.pending ? card.pending : card.live
}

function manageDisplaySlots(card: AdminNamecardDiff): MediaSlot[] {
  const display = manageDisplaySide(card)
  // Pending artwork is authoritative whenever a revision exists. A partial
  // pending page-row set is still a deletion (e.g. #799 removed its middle
  // page); falling back to live here showed the deleted page again. The
  // legacy pending columns are the complete fallback inside slotsFromSide.
  return slotsFromSide(display)
}

export function fieldsFromSide(side: NamecardDiffSide): FudabaCardFields {
  return {
    producerName: side.producerName ?? "",
    producerReading: side.producerReading,
    seriesCodes: side.seriesCodes,
    favoriteCharacterIds: side.favoriteCharacters.map(
      (character) => character.id
    ),
    bio: side.bio ?? "",
    tradeNote: side.tradeNote ?? "",
    exchangeMode: side.exchangeMode,
    madeOn: side.madeOn,
    groupName: side.groupName,
    isGroupCard: side.isGroupCard === true,
    isOriginal: side.isOriginal,
    madeWithAi: side.madeWithAi,
    visible: side.visible,
    credits: side.credits.length ? side.credits : [emptyCredit()],
  }
}

/** Front, middle pages, then back — the same order the server stores. */
export function slotsFromSide(side: NamecardDiffSide): MediaSlot[] {
  // 页面行是唯一来源；index 用页面顺序，保证 media_order 的 `#i` 语义不变。
  return (side.pages ?? []).map((page) => ({
    kind: "existing" as const,
    index: page.order - 1,
    url: page.previewUrl,
  }))
}

/** The management window may only reorder or drop pages, never add one. */
export function adminMediaOrder(slots: readonly MediaSlot[]): string[] {
  return slots.map((slot) =>
    slot.kind === "existing" ? `#${slot.index}` : "#0"
  )
}

const FIELD_LABELS: Record<string, string> = {
  producerName: "制作人名称",
  producerReading: "制作人名读音",
  groupName: "团体名称",
  madeOn: "制作时间",
  bio: "简介",
  tradeNote: "交换说明",
  seriesCodes: "企划",
  favoriteCharacterIds: "担当角色",
  credits: "创作人员",
  exchangeMode: "交换方式",
}

/** `zod` is not a direct dependency here, so the issues are read structurally. */
type SchemaIssues = {
  name?: string
  issues?: readonly { path: readonly (string | number)[] }[]
}

function schemaIssues(error: unknown): SchemaIssues | null {
  if (typeof error !== "object" || error === null) return null
  const candidate = error as SchemaIssues
  return candidate.name === "ZodError" && Array.isArray(candidate.issues)
    ? candidate
    : null
}

/** Names the fields the schema rejected, so the operator knows what to fill. */
export function incompleteFields(error: SchemaIssues): string {
  const names = (error.issues ?? []).map((issue) => {
    const key = String(issue.path[0] ?? "")
    return FIELD_LABELS[key] ?? key
  })
  return Array.from(new Set(names)).join("、") || "必填项"
}

/**
 * A change needs a written reason, because the owner is told about it. Equal
 * content and untouched selectors mean the save is a no-op.
 */
export function manageChangeNeedsReason(input: {
  draft: FudabaCardFields | null
  original: FudabaCardFields | null
  status: string
  publicationStatus: string
  reviewStatus: string
  storedReviewStatus: string | null
  ownerTouched: boolean
  artworkChanged?: boolean
  rotationChanged?: boolean
}): boolean {
  if (!input.draft || !input.original) return false
  const contentChanged =
    JSON.stringify(input.draft) !== JSON.stringify(input.original)
  const otherChange =
    contentChanged ||
    input.ownerTouched ||
    Boolean(input.artworkChanged) ||
    Boolean(input.rotationChanged)
  const publicationChanged = input.status !== input.publicationStatus
  const storedReview = input.storedReviewStatus ?? "none"
  const reviewChanged = input.reviewStatus !== storedReview
  const onlyHiddenToLocked =
    publicationChanged &&
    !reviewChanged &&
    input.publicationStatus === "hidden" &&
    input.status === "locked"
  const onlyPendingToApproved =
    (publicationChanged &&
      !reviewChanged &&
      input.publicationStatus === "pending" &&
      input.status === "published") ||
    (reviewChanged &&
      input.storedReviewStatus === "pending" &&
      input.reviewStatus === "approved")
  return (
    otherChange ||
    ((publicationChanged || reviewChanged) &&
      !onlyHiddenToLocked &&
      !onlyPendingToApproved)
  )
}

function flash(element: HTMLElement | null) {
  if (!element) return
  element.scrollIntoView({ behavior: "smooth", block: "center" })
  element.classList.remove("card-field-flash")
  void element.offsetWidth
  element.classList.add("card-field-flash")
  element.addEventListener(
    "animationend",
    () => element.classList.remove("card-field-flash"),
    { once: true }
  )
}

export interface ManageDialogFeedback {
  id: number
  reason: NamecardFeedbackReason
  detail: string | null
  reporterName: string
}

/**
 * 管理窗按「槽位顺序」记录旋转：0 是正面、最后一个是背面，其余是中间页。
 * `middles` 与页面顺序对齐；末尾的空转保留，避免后面的下标错位。
 */
export function adminRotationPayload(
  slotCount: number,
  rotations: Readonly<Record<number, number>>
): { front?: number; back?: number; middles?: number[] } | undefined {
  const turns = (position: number) => (((rotations[position] ?? 0) % 4) + 4) % 4
  const last = Math.max(slotCount - 1, 0)
  const middles = Array.from({ length: Math.max(last - 1, 0) }, (_, index) =>
    turns(index + 1)
  )
  while (middles.length > 0 && middles[middles.length - 1] === 0) middles.pop()
  const payload = {
    ...(turns(0) ? { front: turns(0) } : {}),
    ...(last > 0 && turns(last) ? { back: turns(last) } : {}),
    ...(middles.length > 0 ? { middles } : {}),
  }
  return Object.keys(payload).length ? payload : undefined
}

export function NamecardManageDialog({
  cardNumber,
  feedback = null,
  onClose,
  onSaved,
}: {
  cardNumber: number
  /** Set when the window was opened from the report queue. */
  feedback?: ManageDialogFeedback | null
  onClose: () => void
  onSaved: () => void
}) {
  const [diff, setDiff] = useState<AdminNamecardDiff | null>(null)
  const [series, setSeries] = useState<FudabaSeries[]>([])
  const [draft, setDraft] = useState<FudabaCardFields | null>(null)
  const [original, setOriginal] = useState<FudabaCardFields | null>(null)
  const [slots, setSlots] = useState<MediaSlot[]>([])
  /** 待保存的旋转：位置 → 圈数；保存时随 media_order 一起提交。 */
  const [rotations, setRotations] = useState<Record<number, number>>({})
  const [status, setStatus] = useState<string>("pending")
  const [reviewStatus, setReviewStatus] = useState<string>("none")
  const [ownerAccountId, setOwnerAccountId] = useState("")
  const [ownerName, setOwnerName] = useState<string | null>(null)
  const [ownerTouched, setOwnerTouched] = useState(false)
  const [ownerQuery, setOwnerQuery] = useState("")
  const [ownerResults, setOwnerResults] = useState<AdminPlatformUser[]>([])
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectError, setRejectError] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [reasonRequired, setReasonRequired] = useState(false)
  const reasonRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    void Promise.all([
      getAdminNamecardDiff(cardNumber),
      getPublicFudabaSeries(),
    ])
      .then(([card, catalog]) => {
        if (!active) return
        const display = manageDisplaySide(card)
        const fields = fieldsFromSide(display)
        setDiff(card)
        setSeries(catalog.items)
        setDraft(fields)
        setOriginal(fields)
        setSlots(manageDisplaySlots(card))
        setRotations({})
        setStatus(card.publicationStatus)
        setReviewStatus(card.reviewStatus ?? "none")
        setOwnerAccountId(card.ownerAccountId ?? "")
        setOwnerName(card.ownerDisplayName)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setLoadFailed(true)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [cardNumber])

  useEffect(() => {
    const query = ownerQuery.trim()
    if (!query) return
    let active = true
    void getAdminPlatformUsers({ query, field: "display_name", pageSize: 6 })
      .send()
      .then((page) => {
        if (active) setOwnerResults(page.users)
      })
      .catch(() => {
        if (active) setOwnerResults([])
      })
    return () => {
      active = false
    }
  }, [ownerQuery])

  // A cleared query hides the previous hits without writing state in an effect.
  const visibleOwnerResults = ownerQuery.trim() ? ownerResults : []

  const draftChanged =
    draft !== null &&
    original !== null &&
    JSON.stringify(draft) !== JSON.stringify(original)
  const reviewOverride =
    diff?.reviewStatus === "rejected" || diff?.reviewStatus === "locked"
  const publicationOverride =
    diff?.publicationStatus === "rejected" ||
    diff?.publicationStatus === "locked"
  const artworkChanged = useMemo(() => {
    if (!diff) return false
    const baseline = manageDisplaySlots(diff)
    return (
      slots.length !== baseline.length ||
      slots.some(
        (slot, index) =>
          slot.kind !== "existing" || slot.url !== baseline[index]?.url
      )
    )
  }, [diff, slots])
  const rotationChanged = Object.values(rotations).some(
    (turns) => ((turns % 4) + 4) % 4 !== 0
  )
  const needsReason = useMemo(
    () =>
      manageChangeNeedsReason({
        draft,
        original,
        status,
        publicationStatus: diff?.publicationStatus ?? "",
        reviewStatus,
        storedReviewStatus: diff?.reviewStatus ?? null,
        ownerTouched,
        artworkChanged,
        rotationChanged,
      }),
    [
      artworkChanged,
      diff,
      draft,
      original,
      ownerTouched,
      reviewStatus,
      rotationChanged,
      status,
    ]
  )

  function applyCard(card: AdminNamecardDiff) {
    const display = manageDisplaySide(card)
    const fields = fieldsFromSide(display)
    setDiff(card)
    setDraft(fields)
    setOriginal(fields)
    setSlots(manageDisplaySlots(card))
    // The saved card already contains the rotation; keeping the old preview
    // turns would rotate the new object a second time.
    setRotations({})
    setStatus(card.publicationStatus)
    setReviewStatus(card.reviewStatus ?? "none")
    setOwnerAccountId(card.ownerAccountId ?? "")
    setOwnerName(card.ownerDisplayName)
    setOwnerTouched(false)
    setReason("")
    setReasonRequired(false)
  }

  function conflicted(cause: unknown) {
    return isApiError(cause) && cause.status === 409
  }

  async function reload() {
    try {
      const card = await getAdminNamecardDiff(cardNumber)
      applyCard(card)
    } catch {
      setLoadFailed(true)
    }
  }

  const rotationPayload = adminRotationPayload(slots.length, rotations)

  async function persist(): Promise<boolean> {
    if (!diff || !draft) return false
    if (needsReason && !reason.trim()) {
      setReasonRequired(true)
      setMessage(
        "本次修改需要填写理由：名片资料、状态或归属账号发生了变动。请补充理由后再保存。"
      )
      flash(reasonRef.current)
      return false
    }
    setSaving(true)
    setMessage(null)
    setReasonRequired(false)
    try {
      const approving = effectiveReviewStatus === "approved"
      const contentChanged =
        draft !== null &&
        original !== null &&
        JSON.stringify(draft) !== JSON.stringify(original)
      const versionOnly =
        diff.reviewStatus !== null &&
        !approving &&
        status === diff.publicationStatus &&
        !contentChanged &&
        !artworkChanged &&
        !rotationChanged &&
        !ownerTouched &&
        (reviewStatus === "none" ||
          reviewStatus === "pending" ||
          reviewStatus === "rejected" ||
          reviewStatus === "locked")
      if (
        approving &&
        diff.reviewStatus === "pending" &&
        !contentChanged &&
        !artworkChanged &&
        !rotationChanged &&
        !ownerTouched
      ) {
        await approveAdminNamecard(cardNumber, diff.revision).send()
        onSaved()
        onClose()
        return true
      }
      const next = await updateAdminNamecard(cardNumber, {
        ...draft,
        credits: draft.credits.filter((credit) => credit.displayName.trim()),
        expected_revision: diff.revision,
        reason: reason.trim() ? reason.trim() : null,
        ...(ownerTouched ? { ownerAccountId: ownerAccountId || null } : {}),
        status: approving ? "published" : status,
        review_status:
          approving || effectiveReviewStatus === "none"
            ? null
            : effectiveReviewStatus,
        media_order: adminMediaOrder(slots),
        ...(rotationPayload ? { rotations: rotationPayload } : {}),
        ...(versionOnly ? { version_only: true } : {}),
      }).send()
      applyCard(next)
      return true
    } catch (cause) {
      const field =
        isApiError(cause) &&
        typeof cause.payload === "object" &&
        cause.payload !== null &&
        "field" in cause.payload
          ? (cause.payload as { field?: string }).field
          : undefined
      if (field === "reason") {
        setReasonRequired(true)
        setMessage("服务端要求填写修改理由，已停在理由输入框。")
        flash(reasonRef.current)
      } else if (schemaIssues(cause)) {
        setMessage(
          `资料不完整：${incompleteFields(schemaIssues(cause)!)} 需要补全后才能保存。`
        )
      } else {
        setMessage(isApiError(cause) ? cause.message : "保存失败，请稍后重试。")
        if (conflicted(cause)) {
          // Another operator saved first: reload so the next save fences the
          // revision that is actually live now.
          await reload()
        }
      }
      return false
    } finally {
      setSaving(false)
    }
  }

  async function save() {
    if (await persist()) onSaved()
  }

  async function settleFeedback(
    outcome: "accepted" | "rejected",
    note: string | null = null
  ) {
    if (!feedback) return
    setResolving(true)
    setMessage(null)
    try {
      // The reporter reads a rejection reason verbatim, so it is required.
      await resolveAdminNamecardFeedback(feedback.id, { outcome, note }).send()
      onSaved()
      onClose()
    } catch (cause) {
      setMessage(isApiError(cause) ? cause.message : "处理失败，请稍后重试。")
    } finally {
      setResolving(false)
    }
  }

  async function acceptFeedback() {
    if (!feedback) return
    // Accepting without touching the card only closes the report; there is
    // nothing to write, which also keeps legacy cards with missing fields
    // accepted instead of blocked by the editor's validation.
    if (!needsReason) {
      await settleFeedback("accepted")
      return
    }
    if (await persist()) await settleFeedback("accepted")
  }

  function rejectFeedback() {
    if (!feedback) return
    setRejectReason("")
    setRejectError(false)
    setRejectOpen(true)
  }

  async function confirmRejectFeedback() {
    if (!rejectReason.trim()) {
      setRejectError(true)
      return
    }
    await settleFeedback("rejected", rejectReason.trim())
    setRejectOpen(false)
  }

  async function remove() {
    if (!diff) return
    setDeleting(true)
    setMessage(null)
    try {
      await deleteAdminNamecard(cardNumber, diff.revision).send()
      onSaved()
      onClose()
    } catch (cause) {
      setMessage(isApiError(cause) ? cause.message : "删除失败，请稍后重试。")
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const busy = saving || deleting || resolving
  const queued = diff?.reviewStatus === "pending"
  const statusEdited =
    draftChanged || artworkChanged || rotationChanged || ownerTouched
  const statusLocked = (reviewOverride || publicationOverride) && statusEdited
  const autoReviewLocked = reviewOverride && statusEdited
  const effectiveReviewStatus = autoReviewLocked ? "approved" : reviewStatus
  const canChangeReview = (queued || reviewOverride) && !autoReviewLocked
  const reviewOptions =
    diff?.reviewStatus === "rejected" || diff?.reviewStatus === "locked"
      ? [
          { value: "approved", label: "已通过（提升待审版本）" },
          { value: "rejected", label: "已驳回" },
          { value: "locked", label: "违规锁定" },
        ]
      : REVIEW_OPTIONS

  // A pending version owns the artwork set, so stale local rotations must not
  // leak into the preview or the next save.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (queued) setRotations({})
  }, [queued])

  // Editing an overridden card always lands as published; the select follows.
  useEffect(() => {
    if (!reviewOverride && !publicationOverride) return
    if (statusEdited) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus((current) => (current === "published" ? current : "published"))
    }
  }, [publicationOverride, reviewOverride, statusEdited])

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent layout="pinned" className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>名片 #{cardNumber}</DialogTitle>
          <DialogDescription>
            修改名片资料、生命周期状态与归属账号；保存与删除都会留下审计记录。
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {loading ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              正在读取名片…
            </p>
          ) : loadFailed || !diff || !draft ? (
            <p className="py-16 text-center text-sm text-destructive">
              读取失败，请关闭后重试。
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {feedback ? (
                <Alert>
                  <AlertTitle>
                    反馈：{feedbackReasonLabel(feedback.reason)}
                  </AlertTitle>
                  <AlertDescription>
                    <p>由 {feedback.reporterName} 提交。</p>
                    {feedback.detail ? (
                      <p className="mt-1 whitespace-pre-wrap">
                        {feedback.detail}
                      </p>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}
              {message ? (
                <Alert variant="destructive">
                  <AlertTitle>无法保存</AlertTitle>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              ) : null}
              {queued ? (
                <Alert>
                  <AlertTitle>这张名片有 1 个待审版本</AlertTitle>
                  <AlertDescription>
                    待审期间资料、图片和归属不可编辑。可直接把版本状态设为「已通过」提升待审版本，或设为「无」丢弃这个版本。
                  </AlertDescription>
                </Alert>
              ) : null}

              <CardMediaGallery
                key={diff?.revision ?? "initial"}
                slots={slots}
                disabled={busy || queued}
                allowUpload={false}
                rotations={queued ? {} : rotations}
                onRotate={
                  queued
                    ? undefined
                    : (position, direction) =>
                        setRotations((current) => ({
                          ...current,
                          [position]:
                            ((((current[position] ?? 0) +
                              (direction === "right" ? 1 : 3)) %
                              4) +
                              4) %
                            4,
                        }))
                }
                onChange={setSlots}
                onError={setMessage}
              />

              <Separator />

              <div className="flex flex-col gap-4">
                <div className="grid gap-1.5">
                  <FieldLabel htmlFor="manage-owner">账号归属</FieldLabel>
                  {ownerAccountId ? (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-input bg-muted/40 px-2.5 py-1.5">
                      <span className="flex min-w-0 items-center gap-1.5 text-sm">
                        <UserRoundIcon
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          {ownerName ?? ownerAccountId}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="取消归属账号"
                        disabled={busy || queued}
                        onClick={() => {
                          setOwnerAccountId("")
                          setOwnerName(null)
                          setOwnerTouched(true)
                        }}
                      >
                        <XIcon aria-hidden="true" />
                      </Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <SearchIcon
                        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        id="manage-owner"
                        className="pl-8"
                        disabled={busy || queued}
                        value={ownerQuery}
                        placeholder={
                          ownerAccountId
                            ? (ownerName ?? ownerAccountId)
                            : "无主名片 · 输入昵称检索账号"
                        }
                        onChange={(event) => setOwnerQuery(event.target.value)}
                      />
                      {visibleOwnerResults.length ? (
                        <ul
                          role="listbox"
                          aria-label="账号检索结果"
                          className="absolute top-full left-0 z-20 mt-1 flex w-full flex-col divide-y overflow-hidden rounded-md border bg-popover text-sm shadow-md"
                        >
                          {visibleOwnerResults.map((account) => {
                            const current = account.id === ownerAccountId
                            const usable =
                              account.status === "active" && !current
                            return (
                              <li
                                key={account.id}
                                role="option"
                                aria-selected={false}
                                aria-disabled={!usable}
                              >
                                <button
                                  type="button"
                                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                                  disabled={!usable}
                                  onClick={() => {
                                    setOwnerAccountId(account.id)
                                    setOwnerName(account.displayName)
                                    setOwnerTouched(true)
                                    setOwnerQuery("")
                                    setOwnerResults([])
                                  }}
                                >
                                  <span className="min-w-0">
                                    <span className="truncate">
                                      {account.displayName}
                                    </span>
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      {account.id}
                                    </span>
                                  </span>
                                  <span className="shrink-0 text-xs text-muted-foreground">
                                    {current
                                      ? "当前"
                                      : account.status === "active"
                                        ? "可选"
                                        : "禁用"}
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      ) : null}
                    </div>
                  )}
                  {ownerAccountId ? null : (
                    <p className="text-xs text-muted-foreground">
                      当前无主。输入昵称检索账号，选中后这张名片会归该账号所有。
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-disabled={busy || statusLocked || undefined}>
                    <FieldLabel htmlFor="manage-status">名片状态</FieldLabel>
                    <Select
                      value={status}
                      items={NAMECARD_STATUS_OPTIONS}
                      onValueChange={(value) => setStatus(String(value))}
                      disabled={busy || queued || statusLocked}
                    >
                      <SelectTrigger
                        id="manage-status"
                        className="w-full"
                        aria-label="名片状态"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start">
                        {NAMECARD_STATUS_OPTIONS.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            disabled={option.value === "published" && queued}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field data-disabled={busy || !canChangeReview || undefined}>
                    <FieldLabel htmlFor="manage-review">版本状态</FieldLabel>
                    <Select
                      value={effectiveReviewStatus}
                      items={reviewOptions}
                      disabled={busy || !canChangeReview}
                      onValueChange={(value) => setReviewStatus(String(value))}
                    >
                      <SelectTrigger
                        id="manage-review"
                        className="w-full"
                        aria-label="版本状态"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start">
                        {reviewOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {reviewOverride ? (
                      <FieldDescription>
                        编辑被驳回或锁定的版本后只能通过审核。
                      </FieldDescription>
                    ) : queued ? (
                      <FieldDescription>
                        可直接选择“已通过”提升待审版本，或选择“无”丢弃。
                      </FieldDescription>
                    ) : (
                      <FieldDescription>
                        没有待审版本时不能修改版本状态。
                      </FieldDescription>
                    )}
                  </Field>
                </div>

                <div
                  ref={reasonRef}
                  data-card-field="reason"
                  className="grid gap-1.5"
                >
                  <FieldLabel htmlFor="manage-reason">
                    理由
                    {needsReason ? (
                      <span className="ml-1 text-destructive">*</span>
                    ) : null}
                  </FieldLabel>
                  <Textarea
                    id="manage-reason"
                    rows={3}
                    maxLength={REASON_LIMIT}
                    value={reason}
                    disabled={busy}
                    aria-invalid={reasonRequired || undefined}
                    placeholder="修改资料、状态或归属时会连同改动一起发送给名片所有者。"
                    onChange={(event) => {
                      setReason(event.target.value)
                      if (event.target.value.trim()) setReasonRequired(false)
                    }}
                  />
                  {needsReason || !feedback ? (
                    <FieldDescription>
                      {needsReason
                        ? "本次修改需要理由，保存后会以站内信通知所有者。"
                        : "没有任何改动时不需要理由。"}
                    </FieldDescription>
                  ) : null}
                </div>
              </div>

              <Separator />

              <CardFields
                required={false}
                draft={draft}
                series={series}
                disabled={busy || queued}
                onChange={setDraft}
              />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {feedback ? (
            <>
              <Button
                type="button"
                disabled={busy || loading || !draft}
                onClick={() => void acceptFeedback()}
              >
                {resolving ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <CheckIcon data-icon="inline-start" aria-hidden="true" />
                )}
                受理
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || resolving}
                onClick={() => rejectFeedback()}
              >
                <XIcon data-icon="inline-start" aria-hidden="true" />
                驳回
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                disabled={busy || loading || !draft}
                onClick={() => void save()}
              >
                {saving ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <SaveIcon data-icon="inline-start" aria-hidden="true" />
                )}
                保存
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy || loading || !diff}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2Icon data-icon="inline-start" aria-hidden="true" />
                删除
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>

      <ConfirmActionDialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open)
          if (!open) setRejectError(false)
        }}
        title="驳回反馈"
        description={
          <div className="space-y-2">
            <p>
              这条反馈会被标记为未受理，理由会原样写进发给反馈人的通知。
              {needsReason ? " 这里尚未保存的资料改动会一并丢弃。" : null}
            </p>
            <textarea
              aria-label="驳回理由"
              value={rejectReason}
              maxLength={REASON_LIMIT}
              rows={3}
              aria-invalid={rejectError || undefined}
              placeholder="请填写驳回理由"
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onChange={(event) => {
                setRejectReason(event.currentTarget.value)
                if (event.currentTarget.value.trim()) setRejectError(false)
              }}
            />
            {rejectError ? (
              <p className="text-xs text-destructive">驳回需要填写理由。</p>
            ) : null}
          </div>
        }
        submitting={resolving}
        confirmLabel="确认驳回"
        onConfirm={() => void confirmRejectFeedback()}
      />
      <ConfirmActionDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`删除名片 #${cardNumber}？`}
        description="删除后这张名片在任何前端都不再出现，只能由数据库层面恢复。"
        submitting={deleting}
        confirmLabel="确认删除"
        onConfirm={() => void remove()}
      />
    </Dialog>
  )
}
