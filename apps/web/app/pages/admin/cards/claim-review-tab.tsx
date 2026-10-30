import {
  CheckIcon,
  IdCardIcon,
  LoaderCircleIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import {
  AdminEmptyState,
  AdminPanel,
} from "~/components/admin/admin-ui"
import { AdminPagination } from "~/components/admin/admin-pagination"
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
  getAdminFudabaReviewQueue,
  isApiError,
  reviewAdminFudabaCardClaim,
  type FudabaAdminCardClaim,
  type ReviewQueueRow,
} from "~/lib/api"
import { useConfirmAction } from "~/pages/admin/hooks/use-confirm-action"
import { useDebouncedValue } from "~/lib/use-debounced-value"
import { NamecardMediaPreview } from "./namecard-media-preview"
import { REJECT_REASON_PRESETS } from "./reason-presets"
import { SupplementReviewDialog } from "./supplement-review-dialog"

type ClaimRow = Extract<ReviewQueueRow, { type: "claim" }>
type SupplementRow = Extract<ReviewQueueRow, { type: "supplement" }>
/** The tab only ever shows these two kinds; 全部 is the server's `all`. */
type ClaimFilter = "all" | "claim" | "supplement"

const FILTER_ITEMS: { value: ClaimFilter; label: string }[] = [
  { value: "all", label: "全部类型" },
  { value: "claim", label: "名片认领" },
  { value: "supplement", label: "信息补充" },
]

function staleReview(error: unknown) {
  return isApiError(error) && (error.status === 409 || error.status === 410)
}

/**
 * 旧名片认领：与投稿审核同一套结构（图墙 + 分页 + 逐条裁决），
 * 只是筛选换成【审核类型】，卡片上的状态徽标换成审核类型。
 */
export function ClaimReviewTab() {
  const [filter, setFilter] = useState<ClaimFilter>("all")
  const [draftQuery, setDraftQuery] = useState("")
  const query = useDebouncedValue(draftQuery.trim(), 300)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<(ClaimRow | SupplementRow)[]>([])
  const [pageInfo, setPageInfo] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
  })
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState(false)
  // 用「已加载的 key」推导 loading，避免在 effect 里同步 setState。
  const loadKey = `${filter}:${query}:${page}`
  const loading = loadedKey !== loadKey
  const [supplementRow, setSupplementRow] = useState<SupplementRow | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const apply = useCallback(
    (next: Awaited<ReturnType<typeof load>>) => {
      // The endpoint also serves submissions; this tab only ever shows the
      // two ownerless-card kinds.
      setRows(
        next.data.filter(
          (row): row is ClaimRow | SupplementRow => row.type !== "submission"
        )
      )
      setPageInfo(next.pageInfo)
    },
    []
  )

  const refresh = useCallback(async () => {
    setError(false)
    try {
      apply(await load(filter, query, page))
      setLoadedKey(loadKey)
    } catch {
      setError(true)
    }
  }, [apply, filter, loadKey, page, query])

  useEffect(() => {
    let active = true
    void load(filter, query, page)
      .then((next) => {
        if (!active) return
        apply(next)
        setLoadedKey(loadKey)
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [apply, filter, loadKey, page, query])

  function changeFilter(value: ClaimFilter) {
    setFilter(value)
    setPage(1)
  }

  const claimApprove = useConfirmAction<FudabaAdminCardClaim>({
    onConfirm: async (claim) => {
      try {
        await reviewAdminFudabaCardClaim(claim.id, {
          decision: "approve",
          expectedRevision: claim.revision,
          note: "已核对历史名片与申请资料",
        }).send()
        await refresh()
      } catch (reviewError) {
        if (staleReview(reviewError)) await refresh()
        throw reviewError
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
      } catch (reviewError) {
        if (staleReview(reviewError)) await refresh()
        throw reviewError
      }
    },
    getTitle: () => "驳回名片认领",
    getDescription: (claim) => (
      <div className="space-y-2">
        <p>
          名片 #{claim.legacyCardId} 将保持无主，不会绑定到{" "}
          {claim.claimant.displayName}。
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

  const submitting = claimApprove.submitting || claimReject.submitting

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          审核类型
          <Select
            value={filter}
            items={FILTER_ITEMS}
            onValueChange={(value) => changeFilter(String(value) as ClaimFilter)}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_ITEMS.map((item) => (
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
              onChange={(event) => {
                setDraftQuery(event.currentTarget.value)
                setPage(1)
              }}
            />
          </div>
        </label>
      </div>

      <AdminPanel
        title="旧名片认领"
        description={`名片认领与信息补充共用这一页 · 共 ${pageInfo.total} 条待审核记录`}
        icon={IdCardIcon}
      >
        <div aria-label="名片认领队列内容">
          {loading ? (
            <QueueSkeleton />
          ) : error ? (
            <AdminEmptyState
              icon={IdCardIcon}
              title="无法读取认领队列"
              description="请确认管理会话有效，然后重试。"
            />
          ) : rows.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
              {rows.map((row) => (
                <article
                  key={row.type === "claim" ? `claim:${row.claim.id}` : `supplement:${row.supplement.id}`}
                  className="relative overflow-hidden rounded-xl border"
                >
                  <div className="relative">
                    {row.type === "claim" ? (
                      <NamecardMediaPreview
                        frontImageUrl={row.claim.legacyCard.frontImageUrl}
                        backImageUrl={row.claim.legacyCard.backImageUrl}
                        altBase={`名片 #${row.claim.legacyCardId}`}
                      />
                    ) : (
                      <NamecardMediaPreview
                        frontImageUrl={row.card.frontImageUrl}
                        backImageUrl={null}
                        altBase={`名片 #${row.card.cardNumber}`}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 p-4">
                    <div className="mr-auto">
                      <p className="font-medium">
                        {row.type === "claim"
                          ? `名片 #${row.claim.legacyCardId}`
                          : row.card.producerName || `名片 #${row.card.cardNumber}`}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">
                          {row.type === "claim" ? (
                            <IdCardIcon aria-hidden="true" />
                          ) : (
                            <PlusIcon aria-hidden="true" />
                          )}
                          {row.type === "claim" ? "名片认领" : "信息补充"}
                        </Badge>
                        {row.type === "claim" ? (
                          <span className="text-xs text-muted-foreground">
                            {row.claim.claimant.displayName}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {row.type === "claim" ? (
                      <>
                        <Button
                          type="button"
                          size="icon-sm"
                          aria-label="通过"
                          title="通过"
                          disabled={submitting}
                          onClick={(event) =>
                            claimApprove.requestAction(
                              row.claim,
                              event.currentTarget
                            )
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
                          onClick={(event) =>
                            claimReject.requestAction(
                              row.claim,
                              event.currentTarget
                            )
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
              title="没有待审核的认领或补充"
              description="名片墙上的认领与补充提交后会显示在这里。"
            />
          )}
        </div>
      </AdminPanel>

      <AdminPagination
        page={page}
        totalPages={pageInfo.totalPages}
        disabled={loading}
        onChange={(nextPage) => setPage(Math.max(1, nextPage))}
      />

      <SupplementReviewDialog
        supplement={supplementRow?.supplement ?? null}
        cardLabel={
          supplementRow ? `名片 #${supplementRow.card.cardNumber}` : ""
        }
        onOpenChange={(open) => {
          if (!open) setSupplementRow(null)
        }}
        onReviewed={() => void refresh()}
      />

      <ConfirmActionDialog
        open={claimApprove.open}
        onOpenChange={claimApprove.onOpenChange}
        title={claimApprove.title}
        description={claimApprove.description}
        submitting={claimApprove.submitting}
        onConfirm={() => void claimApprove.confirmAction()}
        confirmLabel="确认通过"
      />

      <ConfirmActionDialog
        open={claimReject.open}
        onOpenChange={claimReject.onOpenChange}
        title={claimReject.title}
        description={claimReject.description}
        submitting={claimReject.submitting}
        onConfirm={() => void claimReject.confirmAction()}
        confirmLabel="确认驳回"
      />
    </div>
  )
}

function load(filter: ClaimFilter, query: string, page: number) {
  return getAdminFudabaReviewQueue({
    type: filter,
    query: query || undefined,
    page,
  }).send()
}

function QueueSkeleton() {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4"
      aria-label="正在加载认领队列"
    >
      <Skeleton className="aspect-3/1 w-full rounded-xl" />
      <Skeleton className="aspect-3/1 w-full rounded-xl" />
      <Skeleton className="aspect-3/1 w-full rounded-xl" />
    </div>
  )
}
