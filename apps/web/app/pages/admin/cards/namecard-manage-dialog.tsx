import {
  CheckIcon,
  LoaderCircleIcon,
  SaveIcon,
  SearchIcon,
  Trash2Icon,
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

/** Lifecycle values the management window may set; drafts never reach a card. */
const STATUS_OPTIONS = [
  { value: "pending", label: "待审核" },
  { value: "published", label: "已通过" },
  // The owner deleted it themselves; hiding is not a management verdict.
  { value: "hidden", label: "已隐藏（用户删除态）" },
  { value: "rejected", label: "已驳回" },
  { value: "locked", label: "已锁定" },
] as const

const REVIEW_OPTIONS = [
  { value: "none", label: "无（丢弃待审版本）" },
  { value: "pending", label: "待审核" },
  { value: "rejected", label: "已驳回" },
  { value: "locked", label: "违规锁定" },
] as const

const REASON_LIMIT = 400

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
    isOriginal: side.isOriginal,
    madeWithAi: side.madeWithAi,
    visible: side.visible,
    credits: side.credits.length ? side.credits : [emptyCredit()],
  }
}

/** Front, middle pages, then back — the same order the server stores. */
export function slotsFromSide(side: NamecardDiffSide): MediaSlot[] {
  const urls = [
    side.frontImageUrl,
    ...side.middleImageUrls,
    ...(side.backImageUrl ? [side.backImageUrl] : []),
  ]
  return urls.map((url, index) => ({ kind: "existing" as const, index, url }))
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
type SchemaIssues = { name?: string; issues?: readonly { path: readonly (string | number)[] }[] }

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
}): boolean {
  if (!input.draft || !input.original) return false
  return (
    JSON.stringify(input.draft) !== JSON.stringify(input.original) ||
    input.status !== input.publicationStatus ||
    input.reviewStatus !== (input.storedReviewStatus ?? "none") ||
    input.ownerTouched
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
        const fields = fieldsFromSide(card.live)
        setDiff(card)
        setSeries(catalog.items)
        setDraft(fields)
        setOriginal(fields)
        setSlots(slotsFromSide(card.live))
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
      }),
    [diff, draft, original, ownerTouched, reviewStatus, status]
  )

  function applyCard(card: AdminNamecardDiff) {
    const fields = fieldsFromSide(card.live)
    setDiff(card)
    setDraft(fields)
    setOriginal(fields)
    setSlots(slotsFromSide(card.live))
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
      const next = await updateAdminNamecard(cardNumber, {
        ...draft,
        credits: draft.credits.filter((credit) => credit.displayName.trim()),
        expected_revision: diff.revision,
        reason: reason.trim() ? reason.trim() : null,
        ...(ownerTouched ? { ownerAccountId: ownerAccountId || null } : {}),
        status,
        review_status: reviewStatus === "none" ? null : reviewStatus,
        media_order: adminMediaOrder(slots),
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
                    名片状态不能直接改为已通过，通过请回到名片审核。把版本状态设为「无」，保存会丢弃这个版本。
                  </AlertDescription>
                </Alert>
              ) : null}

              <CardMediaGallery
                slots={slots}
                disabled={busy}
                allowUpload={false}
                onChange={setSlots}
                onError={setMessage}
              />

              <Separator />

              <div className="flex flex-col gap-4">
                <div className="grid gap-1.5">
                  <FieldLabel htmlFor="manage-owner">账号归属</FieldLabel>
                  <div className="relative">
                    <SearchIcon
                      className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="manage-owner"
                      className="pl-8"
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
                          const usable = account.status === "active" && !current
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
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      当前：{ownerName ?? ownerAccountId ?? "无主名片"}
                    </span>
                    {ownerAccountId ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                        disabled={busy}
                        onClick={() => {
                          setOwnerAccountId("")
                          setOwnerName(null)
                          setOwnerTouched(true)
                        }}
                      >
                        移除
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-disabled={busy || undefined}>
                    <FieldLabel htmlFor="manage-status">名片状态</FieldLabel>
                    <Select
                      value={status}
                      items={STATUS_OPTIONS}
                      disabled={busy}
                      onValueChange={(value) => setStatus(String(value))}
                    >
                      <SelectTrigger
                        id="manage-status"
                        className="w-full"
                        aria-label="名片状态"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start">
                        {STATUS_OPTIONS.map((option) => (
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
                    {queued ? (
                      <FieldDescription>
                        有待审版本时不能直接改为已通过，请先在名片审核里通过。
                      </FieldDescription>
                    ) : null}
                  </Field>
                  <Field data-disabled={busy || !queued || undefined}>
                    <FieldLabel htmlFor="manage-review">版本状态</FieldLabel>
                    <Select
                      value={reviewStatus}
                      items={REVIEW_OPTIONS}
                      disabled={busy || !queued}
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
                        {REVIEW_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {queued ? null : (
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
                disabled={busy}
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
              {needsReason
                ? " 这里尚未保存的资料改动会一并丢弃。"
                : null}
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
