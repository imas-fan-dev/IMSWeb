import {
  CheckIcon,
  ContactRoundIcon,
  IdCardIcon,
  ImagesIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router"

import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
} from "~/components/admin/admin-ui"
import { AdminPagination } from "~/components/admin/admin-pagination"
import { NamecardStatusBadge } from "~/components/community/namecard-status-badge"
import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Skeleton } from "~/components/ui/skeleton"
import {
  approveAdminNamecard,
  flagAdminNamecard,
  getAdminFudabaReviewQueue,
  isApiError,
  lockAdminNamecard,
  rejectAdminNamecard,
  reviewAdminFudabaCardClaim,
  type FudabaAdminCardClaim,
  type ReviewQueueRow,
  type ReviewQueueType,
  type ReviewQueueListResponse,
} from "~/lib/api"
import { useConfirmAction } from "~/pages/admin/hooks/use-confirm-action"
import { useDebouncedValue } from "~/lib/use-debounced-value"
import { NamecardMediaPreview } from "./namecard-media-preview"
import { NamecardReviewDialog, type NamecardReviewTarget } from "./namecard-review-dialog"
import { SupplementReviewDialog } from "./supplement-review-dialog"
import { LOCK_REASON_PRESETS, REJECT_REASON_PRESETS, VIOLATION_REASON_PRESETS } from "./reason-presets"

export function meta() {
  return [{ title: "名片审核 | IMSWeb" }]
}

const TYPE_ITEMS: { value: ReviewQueueType; label: string }[] = [
  { value: "submission", label: "投稿审核" },
  { value: "claim", label: "名片认领" },
  { value: "supplement", label: "信息补充" },
]

const TYPE_LABELS: Record<ReviewQueueType, string> = {
  submission: "投稿审核",
  claim: "名片认领",
  supplement: "信息补充",
}

function typeFromParam(value: string | null): ReviewQueueType {
  return value === "claim" || value === "supplement" ? value : "submission"
}

function isStaleSubmission(error: unknown) {
  return isApiError(error) && (error.status === 409 || error.status === 410)
}

/** 投稿行只需要够渲染标题与按钮可用状态，差异由详情窗按 id 现取。 */
function toReviewTarget(row: Extract<ReviewQueueRow, { type: "submission" }>): NamecardReviewTarget {
  const card = row.review.card
  const status =
    card.publicationStatus === "published"
      ? "approved"
      : card.publicationStatus === "locked"
        ? "locked"
        : card.publicationStatus === "hidden"
          ? "hidden"
          : card.publicationStatus === "rejected"
            ? "rejected"
            : "pending"
  return {
    // 审核接口与差异窗都按名片编号取卡，内部 UUID 不参与。
    id: card.cardNumber,
    producerName: card.producerName,
    revision: card.revision,
    status,
    reviewStatus: card.reviewStatus,
  }
}

function rowKey(row: ReviewQueueRow) {
  return row.type === "submission"
    ? `submission:${row.review.card.id}`
    : row.type === "claim"
      ? `claim:${row.claim.id}`
      : `supplement:${row.supplement.id}`
}

function rowLabel(row: ReviewQueueRow) {
  if (row.type === "submission")
    return row.review.card.producerName || `名片 #${row.review.card.cardNumber}`
  if (row.type === "claim") return `名片 #${row.claim.legacyCardId}`
  return row.card.producerName || `名片 #${row.card.cardNumber}`
}

export default function AdminCardsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPage = Number(searchParams.get("page") ?? "1")
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const type = typeFromParam(searchParams.get("type"))
  const queryParam = searchParams.get("query") ?? ""
  const [rows, setRows] = useState<ReviewQueueRow[]>([])
  const [pageInfo, setPageInfo] = useState<
    ReviewQueueListResponse["pageInfo"]
  >({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const listFocusRef = useRef<HTMLDivElement>(null)
  const [draftQuery, setDraftQuery] = useState(queryParam)
  const debouncedQuery = useDebouncedValue(draftQuery, 300)

  useEffect(() => {
    const trimmed = debouncedQuery.trim()
    if (trimmed === queryParam) return
    const next = new URLSearchParams(searchParams)
    if (trimmed) next.set("query", trimmed)
    else next.delete("query")
    next.delete("page")
    setSearchParams(next, { replace: true })
  }, [debouncedQuery, queryParam, searchParams, setSearchParams])

  function setTypeFilter(value: ReviewQueueType) {
    const next = new URLSearchParams(searchParams)
    if (value === "submission") next.delete("type")
    else next.set("type", value)
    next.delete("page")
    setSearchParams(next)
  }

  const apply = useCallback((next: ReviewQueueListResponse) => {
    setRows(next.data)
    setPageInfo(next.pageInfo)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      apply(await getAdminFudabaReviewQueue({ type, query: queryParam, page }).send())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [apply, page, queryParam, type])

  useEffect(() => {
    let active = true
    void getAdminFudabaReviewQueue({ type, query: queryParam, page })
      .send()
      .then((next) => {
        if (active) apply(next)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [apply, page, queryParam, type])

  function changePage(nextPage: number) {
    setLoading(true)
    setError(false)
    const next = new URLSearchParams(searchParams)
    next.set("page", String(Math.max(1, nextPage)))
    setSearchParams(next)
  }

  const getFallbackFocus = useCallback(
    (target: NamecardReviewTarget) => {
      const index = rows.findIndex(
        (row) =>
          row.type === "submission" &&
          row.review.card.cardNumber === target.id
      )
      const neighbour = rows[index + 1] ?? rows[index - 1]
      if (neighbour) {
        return document.querySelector<HTMLElement>(
          `[data-queue-key="${CSS.escape(rowKey(neighbour))}"] button`
        )
      }
      return listFocusRef.current
    },
    [rows]
  )

  const [reviewTarget, setReviewTarget] = useState<NamecardReviewTarget | null>(
    null
  )
  const [supplementRow, setSupplementRow] = useState<
    Extract<ReviewQueueRow, { type: "supplement" }> | null
  >(null)

  const approveConfirm = useConfirmAction<NamecardReviewTarget>({
    onConfirm: async (target) => {
      try {
        await approveAdminNamecard(target.id, target.revision).send()
        await refresh()
      } catch (error) {
        if (isStaleSubmission(error)) await refresh()
        throw error
      }
    },
    getTitle: () => "通过审核",
    getDescription: (target) =>
      `名片 #${target.id} 将通过审核并公开在名片墙上展示，之后仍可锁定。`,
    successMessage: (target) => `名片 #${target.id} 已通过审核`,
    getFallbackFocus,
  })

  const [lockReason, setLockReason] = useState("")

  const lockConfirm = useConfirmAction<NamecardReviewTarget>({
    onConfirm: async (target) => {
      try {
        await lockAdminNamecard(
          target.id,
          target.revision,
          lockReason.trim()
        ).send()
        setLockReason("")
        await refresh()
        if (rows.length === 1 && page > 1) changePage(page - 1)
      } catch (error) {
        if (isStaleSubmission(error)) await refresh()
        throw error
      }
    },
    getTitle: () => "锁定名片",
    getDescription: (target) => (
      <div className="space-y-2">
        <p>
          名片 #{target.id} 将被锁定并从名片墙移除；投稿人会收到带理由的通知。
        </p>
        {target.reviewStatus === "pending" ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
            该名片当前已有一个版本公开中。锁定会同时下架线上版本，并丢弃本次待审提交。
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {LOCK_REASON_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setLockReason(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
        <textarea
          aria-label="锁定理由"
          value={lockReason}
          maxLength={400}
          rows={3}
          placeholder="锁定理由（必填），会随通知发送给投稿人"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onChange={(event) => setLockReason(event.currentTarget.value)}
        />
      </div>
    ),
    successMessage: (target) => `名片 #${target.id} 已锁定`,
    getFallbackFocus,
  })

  const [rejectReason, setRejectReason] = useState("")
  const [rejectFlagged, setRejectFlagged] = useState(false)

  const rejectConfirm = useConfirmAction<NamecardReviewTarget>({
    onConfirm: async (target) => {
      try {
        const reason = rejectReason.trim()
        if (rejectFlagged) {
          await flagAdminNamecard(
            target.id,
            target.revision,
            reason || "违规内容"
          ).send()
        } else {
          await rejectAdminNamecard(
            target.id,
            target.revision,
            reason || undefined
          ).send()
        }
        setRejectReason("")
        setRejectFlagged(false)
        await refresh()
        if (rows.length === 1 && page > 1) changePage(page - 1)
      } catch (error) {
        if (isStaleSubmission(error)) await refresh()
        throw error
      }
    },
    getTitle: (target) =>
      rejectFlagged
        ? "标记违规并驳回"
        : target.reviewStatus === "pending"
          ? "驳回新版本"
          : "驳回名片",
    getDescription: (target) => (
      <div className="space-y-2">
        <p>名片 #{target.id} 将被驳回，不会显示在名片墙上；投稿人可重新提交。</p>
        <div className="flex flex-wrap gap-1.5">
          {(rejectFlagged
            ? VIOLATION_REASON_PRESETS
            : REJECT_REASON_PRESETS
          ).map((preset) => (
            <button
              key={preset}
              type="button"
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setRejectReason(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
        <textarea
          aria-label="驳回理由"
          value={rejectReason}
          maxLength={400}
          rows={3}
          placeholder={
            rejectFlagged
              ? "违规理由（留空将记为「违规内容」），会随通知发送给投稿人"
              : "可填写驳回理由，用户会收到通知并据此修改后重新提交"
          }
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onChange={(event) => setRejectReason(event.currentTarget.value)}
        />
        {target.reviewStatus === "pending" ? (
          <label className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
            <input
              type="checkbox"
              aria-label="标记为违规"
              className="mt-0.5 size-4 accent-destructive"
              checked={rejectFlagged}
              onChange={(event) =>
                setRejectFlagged(event.currentTarget.checked)
              }
            />
            <span className="text-xs/relaxed">
              标记为违规：本次提交会记入违规记录用于后续审计，已公开的版本不受影响。
            </span>
          </label>
        ) : null}
      </div>
    ),
    successMessage: (target) => `名片 #${target.id} 已驳回`,
    getFallbackFocus,
  })

  const claimApprove = useConfirmAction<FudabaAdminCardClaim>({
    onConfirm: async (claim) => {
      try {
        await reviewAdminFudabaCardClaim(claim.id, {
          decision: "approve",
          expectedRevision: claim.revision,
          note: "已核对历史名片与申请资料",
        }).send()
        await refresh()
      } catch (error) {
        if (isStaleSubmission(error)) await refresh()
        throw error
      }
    },
    getTitle: () => "通过名片认领",
    getDescription: (claim) =>
      `名片 #${claim.legacyCardId} 将绑定给 ${claim.claimant.displayName}，并成为可管理的注册名片。`,
    successMessage: (claim) => `名片 #${claim.legacyCardId} 已完成认领`,
  })

  const claimReject = useConfirmAction<FudabaAdminCardClaim>({
    onConfirm: async (claim) => {
      try {
        await reviewAdminFudabaCardClaim(claim.id, {
          decision: "reject",
          expectedRevision: claim.revision,
          note: rejectReason.trim() || "无法确认名片归属",
        }).send()
        setRejectReason("")
        await refresh()
      } catch (error) {
        if (isStaleSubmission(error)) await refresh()
        throw error
      }
    },
    getTitle: () => "驳回名片认领",
    getDescription: (claim) => (
      <div className="space-y-2">
        <p>
          名片 #${claim.legacyCardId} 将保持无主，不会绑定到
          {" "}{claim.claimant.displayName}。
        </p>
        <div className="flex flex-wrap gap-1.5">
          {REJECT_REASON_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setRejectReason(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
        <textarea
          aria-label="驳回理由"
          value={rejectReason}
          maxLength={400}
          rows={3}
          placeholder="驳回理由（必填），会随通知发送给申请人"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onChange={(event) => setRejectReason(event.currentTarget.value)}
        />
      </div>
    ),
    successMessage: (claim) => `名片 #${claim.legacyCardId} 的认领已驳回`,
  })

  const activeReviewTarget =
    reviewTarget &&
    rows.some(
      (row) =>
        row.type === "submission" &&
        row.review.card.cardNumber === reviewTarget.id
    )
      ? reviewTarget
      : null

  const submitting =
    approveConfirm.submitting ||
    rejectConfirm.submitting ||
    lockConfirm.submitting ||
    claimApprove.submitting ||
    claimReject.submitting

  return (
    <div className="flex flex-col gap-7">
      <AdminPageHeader
        eyebrow="NAMECARD REVIEW"
        title="制作人名片审核"
        description="投稿审核、名片认领与信息补充共用一条队列，用审核类型切换。"
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          审核类型
          <Select
            value={type}
            items={TYPE_ITEMS}
            onValueChange={(value) => setTypeFilter(value as ReviewQueueType)}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          制作人名称
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={draftQuery}
              placeholder="搜索制作人名称"
              className="w-56 pl-8"
              onChange={(event) => setDraftQuery(event.currentTarget.value)}
            />
          </div>
        </label>
      </div>

      <AdminPanel
        title="名片队列"
        description={`共 ${pageInfo.total} 条${TYPE_LABELS[type]}记录`}
        icon={ContactRoundIcon}
      >
        <div ref={listFocusRef} tabIndex={-1} aria-label="名片队列内容">
          {loading ? (
            <CardsSkeleton />
          ) : error ? (
            <AdminEmptyState
              icon={ContactRoundIcon}
              title="无法读取名片队列"
              description="请确认管理会话有效，然后刷新页面重试。"
            />
          ) : rows.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
              {rows.map((row) => (
                <article
                  key={rowKey(row)}
                  data-queue-key={rowKey(row)}
                  className="relative overflow-hidden rounded-xl border"
                >
                  {row.type === "submission" &&
                  row.review.card.reviewStatus === "pending" ? (
                    <Badge className="absolute top-2 left-2 z-10 border-warning-foreground/40 bg-warning text-warning-foreground shadow-sm">
                      新版本
                    </Badge>
                  ) : null}
                  <button
                    type="button"
                    className="relative block w-full cursor-zoom-in text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-label={`查看${TYPE_LABELS[row.type]} ${rowLabel(row)} 的审核详情`}
                    onClick={() => {
                      if (row.type === "submission") setReviewTarget(toReviewTarget(row))
                      else if (row.type === "supplement") setSupplementRow(row)
                    }}
                  >
                    {row.type === "submission" &&
                    row.review.card.middleImageUrls.length > 0 ? (
                      <Badge className="absolute top-2 right-2 z-10 gap-1 border-border bg-background/90 text-foreground shadow-sm">
                        <ImagesIcon aria-hidden="true" />
                        {row.review.card.middleImageUrls.length +
                          (row.review.card.backImageUrl ? 2 : 1)}
                      </Badge>
                    ) : null}
                    {row.type === "claim" ? (
                      <NamecardMediaPreview
                        frontImageUrl={row.claim.legacyCard.frontImageUrl}
                        backImageUrl={row.claim.legacyCard.backImageUrl}
                        altBase={`名片 #${row.claim.legacyCardId}`}
                      />
                    ) : (
                      <NamecardMediaPreview
                        frontImageUrl={
                          row.type === "submission"
                            ? row.review.card.frontImageUrl
                            : row.card.frontImageUrl
                        }
                        backImageUrl={
                          row.type === "submission" ? row.review.card.backImageUrl : null
                        }
                        altBase={rowLabel(row)}
                      />
                    )}
                  </button>
                  <div className="flex flex-wrap items-center gap-3 p-4">
                    <div className="mr-auto">
                      <p className="font-medium">{rowLabel(row)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">
                          {row.type === "claim" ? (
                            <IdCardIcon aria-hidden="true" />
                          ) : row.type === "supplement" ? (
                            <PlusIcon aria-hidden="true" />
                          ) : null}
                          {TYPE_LABELS[row.type]}
                        </Badge>
                        {row.type === "submission" ? (
                          <NamecardStatusBadge
                            status={toReviewTarget(row).status}
                            reviewStatus={row.review.card.reviewStatus}
                          />
                        ) : null}
                        {row.type === "claim" ? (
                          <span className="text-xs text-muted-foreground">
                            {row.claim.claimant.displayName}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {row.type === "submission" ? (
                      <>
                        <Button
                          type="button"
                          size="icon-sm"
                          aria-label="通过"
                          title="通过"
                          disabled={submitting}
                          onClick={(event) =>
                            approveConfirm.requestAction(
                              toReviewTarget(row),
                              event.currentTarget
                            )
                          }
                        >
                          {approveConfirm.submitting &&
                          approveConfirm.target?.id ===
                          row.review.card.cardNumber ? (
                            <LoaderCircleIcon className="animate-spin" />
                          ) : (
                            <CheckIcon />
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          aria-label="驳回"
                          title="驳回"
                          disabled={submitting}
                          onClick={(event) =>
                            rejectConfirm.requestAction(
                              toReviewTarget(row),
                              event.currentTarget
                            )
                          }
                        >
                          {rejectConfirm.submitting &&
                          rejectConfirm.target?.id ===
                          row.review.card.cardNumber ? (
                            <LoaderCircleIcon className="animate-spin" />
                          ) : (
                            <XIcon />
                          )}
                        </Button>
                      </>
                    ) : row.type === "claim" ? (
                      <>
                        <Button
                          type="button"
                          size="icon-sm"
                          aria-label="通过"
                          title="通过"
                          disabled={submitting}
                          onClick={() =>
                            claimApprove.requestAction(row.claim)
                          }
                        >
                          {claimApprove.submitting &&
                          claimApprove.target?.id === row.claim.id ? (
                            <LoaderCircleIcon className="animate-spin" />
                          ) : (
                            <CheckIcon />
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          aria-label="驳回"
                          title="驳回"
                          disabled={submitting}
                          onClick={() =>
                            claimReject.requestAction(row.claim)
                          }
                        >
                          {claimReject.submitting &&
                          claimReject.target?.id === row.claim.id ? (
                            <LoaderCircleIcon className="animate-spin" />
                          ) : (
                            <XIcon />
                          )}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={submitting}
                        onClick={() => setSupplementRow(row)}
                      >
                        审核
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <AdminEmptyState
              icon={CheckIcon}
              title="当前没有待审核记录"
              description={`新的${TYPE_LABELS[type]}会显示在这里。`}
            />
          )}
        </div>
      </AdminPanel>

      <AdminPagination
        page={page}
        totalPages={pageInfo.totalPages}
        disabled={loading}
        onChange={changePage}
      />

      <NamecardReviewDialog
        key={activeReviewTarget?.id ?? "none"}
        card={activeReviewTarget}
        onOpenChange={(open) => {
          if (!open) setReviewTarget(null)
        }}
        onApprove={(target) => approveConfirm.requestAction(target)}
        onReject={(target) => rejectConfirm.requestAction(target)}
        onLock={(target) => lockConfirm.requestAction(target)}
      />

      <SupplementReviewDialog
        key={supplementRow?.supplement?.id ?? "none"}
        supplement={supplementRow?.supplement ?? null}
        cardLabel={
          supplementRow
            ? `名片 #${supplementRow.card.cardNumber}`
            : ""
        }
        onOpenChange={(open) => {
          if (!open) setSupplementRow(null)
        }}
        onReviewed={() => void refresh()}
      />

      <ConfirmActionDialog
        open={approveConfirm.open}
        onOpenChange={approveConfirm.onOpenChange}
        title={approveConfirm.title}
        description={approveConfirm.description}
        submitting={approveConfirm.submitting}
        onConfirm={() => void approveConfirm.confirmAction()}
        confirmLabel="确认通过"
        variant="default"
      />

      <ConfirmActionDialog
        open={rejectConfirm.open}
        onOpenChange={(open) => {
          rejectConfirm.onOpenChange(open)
          if (!open) setRejectFlagged(false)
        }}
        title={rejectConfirm.title}
        description={rejectConfirm.description}
        submitting={rejectConfirm.submitting}
        onConfirm={() => void rejectConfirm.confirmAction()}
        confirmLabel={rejectFlagged ? "确认标记并驳回" : "确认驳回"}
        variant="default"
      />

      <ConfirmActionDialog
        open={lockConfirm.open}
        onOpenChange={lockConfirm.onOpenChange}
        title={lockConfirm.title}
        description={lockConfirm.description}
        submitting={lockConfirm.submitting}
        onConfirm={() => void lockConfirm.confirmAction()}
        confirmLabel="确认锁定"
        variant="destructive"
      />

      <ConfirmActionDialog
        open={claimApprove.open}
        onOpenChange={claimApprove.onOpenChange}
        title={claimApprove.title}
        description={claimApprove.description}
        submitting={claimApprove.submitting}
        onConfirm={() => void claimApprove.confirmAction()}
        confirmLabel="确认通过"
        variant="default"
      />

      <ConfirmActionDialog
        open={claimReject.open}
        onOpenChange={claimReject.onOpenChange}
        title={claimReject.title}
        description={claimReject.description}
        submitting={claimReject.submitting}
        onConfirm={() => void claimReject.confirmAction()}
        confirmLabel="确认驳回"
        variant="default"
      />
    </div>
  )
}

function CardsSkeleton() {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4"
      aria-label="正在加载名片队列"
    >
      <Skeleton className="aspect-3/1 w-full rounded-xl" />
      <Skeleton className="aspect-3/1 w-full rounded-xl" />
      <Skeleton className="aspect-3/1 w-full rounded-xl" />
    </div>
  )
}
