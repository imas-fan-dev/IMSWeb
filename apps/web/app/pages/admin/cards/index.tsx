import { MessagesPanel } from "~/pages/community/exchange/messages-panel"
import {
  CheckIcon,
  LoaderCircleIcon,
  LockIcon,
  LockOpenIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"

import { Button } from "~/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { AdminPageHeader } from "~/components/admin/admin-ui"
import { useConfirmAction } from "~/pages/admin/hooks/use-confirm-action"
import { ActionConfirmDialog } from "./action-confirm-dialog"
import { ClaimReviewTab } from "./claim-review-tab"
import { GuestSubmissionToggle } from "./guest-submission-toggle"
import { useDebouncedValue } from "~/lib/use-debounced-value"
import {
  approveAdminNamecard,
  flagAdminNamecard,
  lockAdminNamecard,
  rejectAdminNamecard,
  unlockAdminNamecard,
  type AdminNamecard,
  type AdminNamecardListFilters,
} from "~/lib/api"
import { NamecardQueuePanel } from "./namecard-queue-panel"
import {
  NamecardAdminFilters,
  type NamecardOwnerSelection,
} from "./namecard-admin-filters"
import { NamecardReviewDialog } from "./namecard-review-dialog"
import { ReviewRowAction } from "./review-row-action"
import { useNamecardQueue } from "./use-namecard-queue"
import {
  LOCK_REASON_PRESETS,
  REJECT_REASON_PRESETS,
  VIOLATION_REASON_PRESETS,
} from "./reason-presets"

export function meta() {
  return [{ title: "名片与留言管理 | IMSWeb" }]
}

export default function AdminCardsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryParam = searchParams.get("query") ?? ""
  const statusParam = searchParams.get("status") ?? ""
  const originParam = searchParams.get("origin") ?? ""
  const origins = useMemo(
    () => (originParam ? originParam.split(",").filter(Boolean) : []),
    [originParam]
  )
  // 归属筛选把昵称一起放进 URL：刷新后筛选条仍显示选中的是谁。
  const ownerParam = searchParams.get("owner") ?? ""
  const ownerNameParam = searchParams.get("owner_name") ?? ""
  const owner = useMemo<NamecardOwnerSelection | null>(
    () =>
      ownerParam
        ? { id: ownerParam, displayName: ownerNameParam || ownerParam }
        : null,
    [ownerNameParam, ownerParam]
  )
  const [draftQuery, setDraftQuery] = useState(queryParam)
  const debouncedQuery = useDebouncedValue(draftQuery, 300)
  const filters = useMemo<AdminNamecardListFilters>(
    () => ({
      query: queryParam,
      status: statusParam,
      origins,
      ownerAccountId: ownerParam,
    }),
    [origins, ownerParam, queryParam, statusParam]
  )
  const queue = useNamecardQueue(filters)
  const {
    cards,
    page,
    loading,
    reloadToken,
    refresh,
    changePage,
    getFallbackFocus,
    refreshOnStaleError,
  } = queue

  useEffect(() => {
    const trimmed = debouncedQuery.trim()
    if (trimmed === queryParam) return
    const next = new URLSearchParams(searchParams)
    if (trimmed) next.set("query", trimmed)
    else next.delete("query")
    next.delete("page")
    setSearchParams(next, { replace: true })
  }, [debouncedQuery, queryParam, searchParams, setSearchParams])

  function setStatusFilter(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set("status", value)
    else next.delete("status")
    next.delete("page")
    setSearchParams(next)
  }

  function toggleOrigin(value: string, checked: boolean) {
    const current = new Set(origins)
    if (checked) current.add(value)
    else current.delete(value)
    const next = new URLSearchParams(searchParams)
    if (current.size > 0) next.set("origin", [...current].join(","))
    else next.delete("origin")
    next.delete("page")
    setSearchParams(next)
  }

  function setOwnerFilter(next: NamecardOwnerSelection | null) {
    const params = new URLSearchParams(searchParams)
    if (next) {
      params.set("owner", next.id)
      params.set("owner_name", next.displayName)
    } else {
      params.delete("owner")
      params.delete("owner_name")
    }
    params.delete("page")
    setSearchParams(params)
  }

  const approveConfirm = useConfirmAction<AdminNamecard>({
    onConfirm: async (card) => {
      try {
        const response = await approveAdminNamecard(
          card.id,
          card.revision
        ).send()
        void response
        // Reload instead of patching locally: the queue is filtered and sorted on
        // the server, so a published card may belong on another page.
        await refresh()
      } catch (error) {
        await refreshOnStaleError(error)
      }
    },
    getTitle: () => "通过审核",
    getDescription: (card) =>
      `名片 #${card.id} 将通过审核并公开在名片墙上展示，之后仍可锁定。`,
    successMessage: (card) => `名片 #${card.id} 已通过审核`,
    getFallbackFocus,
  })

  const [lockReason, setLockReason] = useState("")
  const [reviewCard, setReviewCard] = useState<AdminNamecard | null>(null)

  const lockConfirm = useConfirmAction<AdminNamecard>({
    onConfirm: async (card) => {
      try {
        await lockAdminNamecard(
          card.id,
          card.revision,
          lockReason.trim()
        ).send()
        setLockReason("")
        await refresh()
        if (cards.length === 1 && page > 1) changePage(page - 1)
      } catch (error) {
        await refreshOnStaleError(error)
      }
    },
    getTitle: () => "锁定名片",
    getDescription: (card) => (
      <div className="space-y-2">
        <p>
          名片 #{card.id} 将被锁定并从名片墙移除；投稿人会收到带理由的通知。
        </p>
        {card.reviewStatus === "pending" ? (
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
    successMessage: (card) => `名片 #${card.id} 已锁定`,
    getFallbackFocus,
  })

  const unlockConfirm = useConfirmAction<AdminNamecard>({
    onConfirm: async (card) => {
      try {
        await unlockAdminNamecard(card.id, card.revision).send()
        await refresh()
      } catch (error) {
        await refreshOnStaleError(error)
      }
    },
    getTitle: () => "解除锁定",
    getDescription: (card) =>
      `名片 #${card.id} 将回到待审核队列，并通知投稿人。审核通过后会重新展示在名片墙上。`,
    successMessage: (card) => `名片 #${card.id} 已解除锁定`,
    getFallbackFocus,
  })

  const [rejectReason, setRejectReason] = useState("")
  const [rejectFlagged, setRejectFlagged] = useState(false)

  // 取消/关闭驳回弹窗时把勾选与理由一起清掉：下次打开是干净的草稿。
  const clearRejectDraft = useCallback(() => {
    setRejectReason("")
    setRejectFlagged(false)
  }, [])

  const rejectConfirm = useConfirmAction<AdminNamecard>({
    onConfirm: async (card) => {
      try {
        const reason = rejectReason.trim()
        if (rejectFlagged) {
          await flagAdminNamecard(
            card.id,
            card.revision,
            reason || "违规内容"
          ).send()
        } else {
          await rejectAdminNamecard(
            card.id,
            card.revision,
            reason || undefined
          ).send()
        }
        setRejectReason("")
        setRejectFlagged(false)
        await refresh()
        if (cards.length === 1 && page > 1) changePage(page - 1)
      } catch (error) {
        await refreshOnStaleError(error)
      }
    },
    getTitle: (card) =>
      rejectFlagged
        ? "标记违规并驳回"
        : card.reviewStatus === "pending"
          ? "驳回新版本"
          : "驳回名片",
    getDescription: (card) => (
      <div className="space-y-2">
        <p>名片 #{card.id} 将被驳回，不会显示在名片墙上；投稿人可重新提交。</p>
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
        {/* A first submission is locked, not flagged: the lock button already
            covers that case, and two controls for one outcome invite mistakes. */}
        {card.reviewStatus === "pending" ? (
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
    successMessage: (card) => `名片 #${card.id} 已驳回`,
    getFallbackFocus,
    onClose: clearRejectDraft,
  })

  // 窗口必须跟着列表的最新行：属主保存、旋转都会把 revision 顶上去，用窗口
  // 打开时那一次的快照去提交只会一直撞 409（刷新后仍然失败）。
  // Approving or locking drops the row from the queue, so the review window
  // closes with it instead of showing a revision that no longer exists.
  const activeReviewCard = reviewCard
    ? (cards.find((card) => card.id === reviewCard.id) ?? null)
    : null

  const submitting =
    approveConfirm.submitting ||
    rejectConfirm.submitting ||
    lockConfirm.submitting ||
    unlockConfirm.submitting

  return (
    <div className="flex flex-col gap-7">
      <AdminPageHeader
        eyebrow="NAMECARD REVIEW"
        title="制作人名片审核"
        description="统一处理投稿审核与旧名片认领，投稿来源在下方筛选。"
        actions={
          <>
            <GuestSubmissionToggle />
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void refresh()}
            >
              <RefreshCwIcon data-icon="inline-start" />
              刷新
            </Button>
          </>
        }
      />

      <Tabs defaultValue="guest">
        <TabsList aria-label="名片审核类型">
          <TabsTrigger value="guest">投稿审核</TabsTrigger>
          <TabsTrigger value="messages">留言管理</TabsTrigger>
          <TabsTrigger value="claims">旧名片认领</TabsTrigger>
        </TabsList>

        <TabsContent value="guest" className="flex flex-col gap-7 pt-5">
          <NamecardAdminFilters
            query={draftQuery}
            onQueryChange={setDraftQuery}
            status={statusParam}
            onStatusChange={setStatusFilter}
            origins={origins}
            onOriginToggle={toggleOrigin}
            owner={owner}
            onOwnerChange={setOwnerFilter}
          />

          <NamecardQueuePanel
            queue={queue}
            openCardLabel={(card) => `查看名片 #${card.id} 的审核详情`}
            onOpenCard={(card) => setReviewCard(card)}
            renderRowActions={(card) => (
              <>
                {card.status === "pending" ? (
                  <ReviewRowAction
                    label="通过"
                    icon={<CheckIcon />}
                    pending={
                      approveConfirm.submitting &&
                      approveConfirm.target?.id === card.id
                    }
                    disabled={submitting}
                    onRequest={(trigger) =>
                      approveConfirm.requestAction(card, trigger)
                    }
                  />
                ) : null}
                {card.status === "pending" ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label="驳回"
                    title="驳回"
                    disabled={submitting}
                    onClick={(event) =>
                      rejectConfirm.requestAction(card, event.currentTarget)
                    }
                  >
                    {rejectConfirm.submitting &&
                    rejectConfirm.target?.id === card.id ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : (
                      <XIcon />
                    )}
                  </Button>
                ) : null}
                {card.status === "locked" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={submitting}
                    aria-label={`解除锁定名片 #${card.id}`}
                    onClick={(event) =>
                      unlockConfirm.requestAction(card, event.currentTarget)
                    }
                  >
                    {unlockConfirm.submitting &&
                    unlockConfirm.target?.id === card.id ? (
                      <LoaderCircleIcon
                        data-icon="inline-start"
                        className="animate-spin"
                      />
                    ) : (
                      <LockOpenIcon data-icon="inline-start" />
                    )}
                    解锁
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={submitting}
                    aria-label={`锁定名片 #${card.id}`}
                    onClick={(event) =>
                      lockConfirm.requestAction(card, event.currentTarget)
                    }
                  >
                    {lockConfirm.submitting &&
                    lockConfirm.target?.id === card.id ? (
                      <LoaderCircleIcon
                        data-icon="inline-start"
                        className="animate-spin"
                      />
                    ) : (
                      <LockIcon data-icon="inline-start" />
                    )}
                    锁定
                  </Button>
                )}
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="messages" className="pt-5">
          <MessagesPanel mode="admin" />
        </TabsContent>
        <TabsContent value="claims" className="flex flex-col gap-7 pt-5">
          <ClaimReviewTab reloadToken={reloadToken} />
        </TabsContent>
      </Tabs>

      <NamecardReviewDialog
        key={reviewCard?.id ?? "none"}
        card={activeReviewCard}
        onOpenChange={(open) => {
          if (!open) setReviewCard(null)
        }}
        onApprove={(card) => approveConfirm.requestAction(card)}
        onReject={(card) => rejectConfirm.requestAction(card)}
        onLock={(card) => lockConfirm.requestAction(card)}
      />

      <ActionConfirmDialog
        action={approveConfirm}
        confirmLabel="确认通过"
        variant="default"
      />

      <ActionConfirmDialog
        action={rejectConfirm}
        confirmLabel={rejectFlagged ? "确认标记并驳回" : "确认驳回"}
        variant="default"
      />

      <ActionConfirmDialog
        action={lockConfirm}
        confirmLabel="确认锁定"
        variant="destructive"
      />

      <ActionConfirmDialog
        action={unlockConfirm}
        confirmLabel="确认解锁"
        variant="destructive"
      />
    </div>
  )
}
