import {
  CheckIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"

import { AdminPageHeader } from "~/components/admin/admin-ui"
import { Button } from "~/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  approveAdminNamecard,
  deleteAdminNamecard,
  flagAdminNamecard,
  rejectAdminNamecard,
  type AdminNamecard,
  type AdminNamecardListFilters,
} from "~/lib/api"
import { useDebouncedValue } from "~/lib/use-debounced-value"
import { useConfirmAction } from "~/pages/admin/hooks/use-confirm-action"
import { ActionConfirmDialog } from "./action-confirm-dialog"
import { NamecardFeedbackQueue } from "./namecard-feedback-queue"
import { NamecardManageDialog } from "./namecard-manage-dialog"
import { NamecardQueuePanel } from "./namecard-queue-panel"
import {
  NamecardAdminFilters,
  type NamecardOwnerSelection,
} from "./namecard-admin-filters"
import { ReviewRowAction } from "./review-row-action"
import { useNamecardQueue } from "./use-namecard-queue"
import {
  REJECT_REASON_PRESETS,
  VIOLATION_REASON_PRESETS,
} from "./reason-presets"

export function meta() {
  return [{ title: "名片管理 | IMSWeb" }]
}

export default function AdminNamecardManagePage() {
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
  const [openCard, setOpenCard] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectFlagged, setRejectFlagged] = useState(false)

  useEffect(() => {
    const trimmed = debouncedQuery.trim()
    if (trimmed === queryParam) return
    const next = new URLSearchParams(searchParams)
    if (trimmed) next.set("query", trimmed)
    else next.delete("query")
    next.delete("page")
    setSearchParams(next, { replace: true })
  }, [debouncedQuery, queryParam, searchParams, setSearchParams])

  const tab = searchParams.get("tab") === "advanced" ? "advanced" : "feedback"

  function changeTab(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value === "advanced") next.set("tab", "advanced")
    else next.delete("tab")
    next.delete("page")
    setSearchParams(next)
  }

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
        await approveAdminNamecard(card.id, card.revision).send()
        await refresh()
      } catch (cause) {
        await refreshOnStaleError(cause)
      }
    },
    getTitle: () => "通过审核",
    getDescription: (card) =>
      `名片 #${card.id} 将通过审核并公开在名片墙上展示，之后仍可锁定。`,
    successMessage: (card) => `名片 #${card.id} 已通过审核`,
    getFallbackFocus,
  })

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
      } catch (cause) {
        await refreshOnStaleError(cause)
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

  const deleteConfirm = useConfirmAction<AdminNamecard>({
    onConfirm: async (card) => {
      try {
        await deleteAdminNamecard(card.id, card.revision).send()
        await refresh()
        if (cards.length === 1 && page > 1) changePage(page - 1)
      } catch (cause) {
        await refreshOnStaleError(cause)
      }
    },
    getTitle: (card) => `删除名片 #${card.id}？`,
    getDescription: (card) => (
      <div className="space-y-2">
        <p>名片 #{card.id} 将被删除，之后在任何前端都不再出现。</p>
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
          删除无法在后台撤销，只能由数据库层面恢复。
        </p>
      </div>
    ),
    successMessage: (card) => `名片 #${card.id} 已删除`,
    getFallbackFocus,
  })

  const activeManageCard =
    openCard !== null && cards.some((card) => card.id === openCard)
      ? openCard
      : null

  const submitting =
    approveConfirm.submitting ||
    rejectConfirm.submitting ||
    deleteConfirm.submitting

  return (
    <div className="flex flex-col gap-7">
      <AdminPageHeader
        eyebrow="NAMECARD MANAGEMENT"
        title="名片管理"
        description="处理名片墙上提交的反馈，或直接修改任意名片的资料、状态与归属账号。"
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

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList aria-label="名片管理类型">
          <TabsTrigger value="feedback">反馈处理</TabsTrigger>
          <TabsTrigger value="advanced">信息修改</TabsTrigger>
        </TabsList>

        <TabsContent value="feedback" className="flex flex-col gap-7 pt-5">
          <NamecardFeedbackQueue reloadToken={reloadToken} />
        </TabsContent>

        <TabsContent value="advanced" className="flex flex-col gap-7 pt-5">
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
            openCardLabel={(card) => `修改名片 #${card.id}`}
            onOpenCard={(card) => setOpenCard(card.id)}
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
                  <ReviewRowAction
                    label="驳回"
                    icon={<XIcon />}
                    variant="outline"
                    pending={
                      rejectConfirm.submitting &&
                      rejectConfirm.target?.id === card.id
                    }
                    disabled={submitting}
                    onRequest={(trigger) =>
                      rejectConfirm.requestAction(card, trigger)
                    }
                  />
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={submitting}
                  aria-label={`删除名片 #${card.id}`}
                  onClick={(event) =>
                    deleteConfirm.requestAction(card, event.currentTarget)
                  }
                >
                  {deleteConfirm.submitting &&
                  deleteConfirm.target?.id === card.id ? (
                    <LoaderCircleIcon
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : (
                    <Trash2Icon data-icon="inline-start" />
                  )}
                  删除
                </Button>
              </>
            )}
          />
        </TabsContent>
      </Tabs>

      {activeManageCard !== null ? (
        <NamecardManageDialog
          cardNumber={activeManageCard}
          onClose={() => setOpenCard(null)}
          onSaved={() => void refresh()}
        />
      ) : null}

      <ActionConfirmDialog
        action={approveConfirm}
        confirmLabel="确认通过"
        variant="default"
      />
      <ActionConfirmDialog
        action={rejectConfirm}
        confirmLabel={rejectFlagged ? "确认标记违规" : "确认驳回"}
        variant="default"
      />
      <ActionConfirmDialog
        action={deleteConfirm}
        confirmLabel="确认删除"
        variant="destructive"
      />
    </div>
  )
}
