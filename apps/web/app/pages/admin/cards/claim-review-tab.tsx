import {
  CheckIcon,
  IdCardIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { AdminEmptyState, AdminPanel } from "~/components/admin/admin-ui"
import { AdminPagination } from "~/components/admin/admin-pagination"
import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { ReviewRowAction } from "./review-row-action"
import { Badge } from "~/components/ui/badge"

import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { Skeleton } from "~/components/ui/skeleton"
import {
  getAdminFudabaReviewQueue,
  reviewAdminFudabaCardClaim,
  reviewAdminFudabaCardSupplement,
  type AdminCardSupplement,
  type FudabaAdminCardClaim,
  type ReviewQueueRow,
} from "~/lib/api"
import { useConfirmAction } from "~/pages/admin/hooks/use-confirm-action"
import { useDebouncedValue } from "~/lib/use-debounced-value"
import { ClaimReviewDialog } from "./claim-review-dialog"
import { NamecardMediaPreview } from "./namecard-media-preview"
import { REJECT_REASON_PRESETS } from "./reason-presets"
import { SupplementReviewDialog } from "./supplement-review-dialog"

type ClaimRow = Extract<ReviewQueueRow, { type: "claim" }>
type SupplementRow = Extract<ReviewQueueRow, { type: "supplement" }>
/** The tab only ever shows these two kinds. */
type ReviewKind = "claim" | "supplement"

const KIND_ITEMS: { value: ReviewKind; label: string }[] = [
  { value: "claim", label: "名片认领" },
  { value: "supplement", label: "信息补充" },
]

/**
 * 旧名片认领：与投稿审核同一套结构（图墙 + 搜索 + 分页 + 逐条裁决），
 * 只是筛选换成【审核类型】，卡片上的状态徽标换成审核类型。
 */
export function ClaimReviewTab({ reloadToken = 0 }: { reloadToken?: number }) {
  // 两个都勾选等于「全部」：与投稿来源的勾选语义一致。
  const [kinds, setKinds] = useState<ReviewKind[]>(["claim", "supplement"])
  const [draftQuery, setDraftQuery] = useState("")
  const query = useDebouncedValue(draftQuery.trim(), 300)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<(ClaimRow | SupplementRow)[]>([])
  const [claimRow, setClaimRow] = useState<ClaimRow | null>(null)
  const [supplementRow, setSupplementRow] = useState<SupplementRow | null>(null)
  // 队列刷新后窗口要拿最新行：用打开时的快照提交会一直撞 409。
  const activeClaim = claimRow
    ? ((rows.find(
        (row) => row.type === "claim" && row.claim.id === claimRow.claim.id
      ) as ClaimRow | undefined) ?? null)
    : null
  const activeSupplement = supplementRow
    ? ((rows.find(
        (row) =>
          row.type === "supplement" &&
          row.supplement.id === supplementRow.supplement.id
      ) as SupplementRow | undefined) ?? null)
    : null
  const [pageInfo, setPageInfo] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
  })
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const [rejectReason, setRejectReason] = useState("")

  const type = kinds.length === KIND_ITEMS.length ? "all" : (kinds[0] ?? "all")
  const loadKey = `${type}:${query}:${page}:${reloadToken}`
  const loading = loadedKey !== loadKey

  const apply = useCallback((next: Awaited<ReturnType<typeof load>>) => {
    // The endpoint also serves submissions; this tab only shows the two
    // ownerless-card kinds.
    setRows(
      next.data.filter(
        (row): row is ClaimRow | SupplementRow => row.type !== "submission"
      )
    )
    setPageInfo(next.pageInfo)
  }, [])

  const refresh = useCallback(async () => {
    setError(false)
    try {
      const next = await load(type, query, page)
      apply(next)
      setLoadedKey(loadKey)
      return next.data
    } catch {
      setError(true)
      return null
    }
  }, [apply, loadKey, page, query, type])

  /** 版本竞争后把对话框里的那条换成最新 revision，避免拿着旧值再提交一次。 */
  const reloadClaim = useCallback(
    async (claimId: string) => {
      const fresh = await refresh()
      const row = fresh?.find(
        (item): item is ClaimRow =>
          item.type === "claim" && item.claim.id === claimId
      )
      if (row) setClaimRow(row)
      return row?.claim ?? null
    },
    [refresh]
  )

  const reloadSupplement = useCallback(
    async (supplementId: string) => {
      const fresh = await refresh()
      const row = fresh?.find(
        (item): item is SupplementRow =>
          item.type === "supplement" && item.supplement.id === supplementId
      )
      if (row) setSupplementRow(row)
      return row?.supplement ?? null
    },
    [refresh]
  )

  useEffect(() => {
    let active = true
    void load(type, query, page)
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
  }, [apply, loadKey, page, query, type])

  function toggleKind(kind: ReviewKind, checked: boolean) {
    setKinds((current) =>
      checked
        ? Array.from(new Set([...current, kind]))
        : current.filter((item) => item !== kind)
    )
    setPage(1)
  }

  const claimApprove = useConfirmAction<FudabaAdminCardClaim>({
    onConfirm: async (claim) => {
      await reviewAdminFudabaCardClaim(claim.id, {
        decision: "approve",
        expectedRevision: claim.revision,
        note: "已核对历史名片与申请资料",
      }).send()
      setClaimRow(null)
      await refresh()
    },
    reloadTarget: (claim) => reloadClaim(claim.id),
    getTitle: () => "通过名片认领",
    getDescription: (claim) =>
      `名片 #${claim.legacyCardId} 将绑定给 ${claim.claimant.displayName}，并成为可管理的注册名片。`,
    successMessage: (claim) => `名片 #${claim.legacyCardId} 已完成认领`,
  })

  const claimReject = useConfirmAction<FudabaAdminCardClaim>({
    onConfirm: async (claim) => {
      await reviewAdminFudabaCardClaim(claim.id, {
        decision: "reject",
        expectedRevision: claim.revision,
        note: rejectReason.trim() || "无法确认名片归属",
      }).send()
      setRejectReason("")
      setClaimRow(null)
      await refresh()
    },
    reloadTarget: (claim) => reloadClaim(claim.id),
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

  const supplementApprove = useConfirmAction<AdminCardSupplement>({
    onConfirm: async (supplement) => {
      await reviewAdminFudabaCardSupplement(supplement.id, {
        decision: "approve",
        expectedRevision: supplement.revision,
        note: "已核对名片墙上的资料",
      }).send()
      await refresh()
    },
    reloadTarget: (supplement) => reloadSupplement(supplement.id),
    getTitle: () => "通过信息补充",
    getDescription: (supplement) =>
      `名片 #${supplement.cardId} 上的补充资料将写回名片，补充人获得贡献值。`,
    successMessage: () => "补充已通过",
  })

  const supplementReject = useConfirmAction<AdminCardSupplement>({
    onConfirm: async (supplement) => {
      await reviewAdminFudabaCardSupplement(supplement.id, {
        decision: "reject",
        expectedRevision: supplement.revision,
        note: rejectReason.trim() || "资料与名片不符",
      }).send()
      setRejectReason("")
      await refresh()
    },
    reloadTarget: (supplement) => reloadSupplement(supplement.id),
    getTitle: () => "驳回信息补充",
    getDescription: (supplement) => (
      <div className="space-y-2">
        <p>名片 #{supplement.cardId} 保持原样，补充分支不会写回名片。</p>
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
          placeholder="驳回理由（必填），会随通知发送给补充人"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onChange={(event) => setRejectReason(event.currentTarget.value)}
        />
      </div>
    ),
    successMessage: () => "补充已驳回",
  })

  const submitting =
    claimApprove.submitting ||
    claimReject.submitting ||
    supplementApprove.submitting ||
    supplementReject.submitting

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
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
        <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <span>审核类型</span>
          <div className="flex h-9 items-center gap-4">
            {KIND_ITEMS.map((item) => (
              <label
                key={item.value}
                className="flex items-center gap-1.5 text-sm text-foreground"
              >
                <Checkbox
                  checked={kinds.includes(item.value)}
                  onCheckedChange={(checked) =>
                    toggleKind(item.value, checked === true)
                  }
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>
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
              {rows.map((row) => {
                const key =
                  row.type === "claim"
                    ? `claim:${row.claim.id}`
                    : `supplement:${row.supplement.id}`
                const label =
                  row.type === "claim"
                    ? `名片 #${row.claim.legacyCardId}`
                    : row.supplement.payload.producerName ||
                      row.card.producerName ||
                      `名片 #${row.card.cardNumber}`
                return (
                  <article
                    key={key}
                    className="relative overflow-hidden rounded-xl border"
                  >
                    <button
                      type="button"
                      className="relative block w-full cursor-zoom-in text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      aria-label={`查看${row.type === "claim" ? "名片认领" : "信息补充"} ${label} 的审核详情`}
                      onClick={() => {
                        if (row.type === "claim") setClaimRow(row)
                        else setSupplementRow(row)
                      }}
                    >
                      {row.type === "claim" ? (
                        <NamecardMediaPreview
                          pages={row.claim.legacyCard.pages}
                          rotations={
                            row.claim.targetCardId === null
                              ? row.claim.payload.rotations
                              : undefined
                          }
                          altBase={label}
                        />
                      ) : (
                        <NamecardMediaPreview
                          pages={row.card.pages}
                          rotations={row.supplement.payload.rotations}
                          altBase={label}
                        />
                      )}
                    </button>
                    <div className="flex flex-wrap items-center gap-3 p-4">
                      <div className="mr-auto">
                        <p className="font-medium">{label}</p>
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
                      <ReviewRowAction
                        label="通过"
                        icon={<CheckIcon />}
                        pending={
                          row.type === "claim"
                            ? claimApprove.submitting &&
                              claimApprove.target?.id === row.claim.id
                            : supplementApprove.submitting &&
                              supplementApprove.target?.id === row.supplement.id
                        }
                        disabled={submitting}
                        onRequest={(trigger) =>
                          row.type === "claim"
                            ? claimApprove.requestAction(row.claim, trigger)
                            : supplementApprove.requestAction(
                                row.supplement,
                                trigger
                              )
                        }
                      />
                      <ReviewRowAction
                        label="驳回"
                        icon={<XIcon />}
                        variant="outline"
                        pending={
                          row.type === "claim"
                            ? claimReject.submitting &&
                              claimReject.target?.id === row.claim.id
                            : supplementReject.submitting &&
                              supplementReject.target?.id === row.supplement.id
                        }
                        disabled={submitting}
                        onRequest={(trigger) =>
                          row.type === "claim"
                            ? claimReject.requestAction(row.claim, trigger)
                            : supplementReject.requestAction(
                                row.supplement,
                                trigger
                              )
                        }
                      />
                    </div>
                  </article>
                )
              })}
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

      <ClaimReviewDialog
        claim={activeClaim?.claim ?? null}
        onOpenChange={(open) => {
          if (!open) setClaimRow(null)
        }}
        dismissible={!claimApprove.open && !claimReject.open}
        onApprove={(claim) => claimApprove.requestAction(claim)}
        onReject={(claim) => claimReject.requestAction(claim)}
      />

      <SupplementReviewDialog
        supplement={activeSupplement?.supplement ?? null}
        cardNumber={activeSupplement?.card.cardNumber ?? 0}
        cardLabel={
          activeSupplement ? `名片 #${activeSupplement.card.cardNumber}` : ""
        }
        onOpenChange={(open) => {
          if (!open) setSupplementRow(null)
        }}
        dismissible={!supplementApprove.open && !supplementReject.open}
        onApprove={(supplement) => supplementApprove.requestAction(supplement)}
        onReject={(supplement) => supplementReject.requestAction(supplement)}
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

      <ConfirmActionDialog
        open={supplementApprove.open}
        onOpenChange={supplementApprove.onOpenChange}
        title={supplementApprove.title}
        description={supplementApprove.description}
        submitting={supplementApprove.submitting}
        onConfirm={() => void supplementApprove.confirmAction()}
        confirmLabel="确认通过"
      />

      <ConfirmActionDialog
        open={supplementReject.open}
        onOpenChange={supplementReject.onOpenChange}
        title={supplementReject.title}
        description={supplementReject.description}
        submitting={supplementReject.submitting}
        onConfirm={() => void supplementReject.confirmAction()}
        confirmLabel="确认驳回"
      />
    </div>
  )
}

function load(type: string, query: string, page: number) {
  return getAdminFudabaReviewQueue({
    type: type as "all" | "claim" | "supplement",
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
