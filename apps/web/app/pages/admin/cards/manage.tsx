import {
  CheckIcon,
  ContactRoundIcon,
  ImagesIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"

import { AdminEmptyState, AdminPageHeader, AdminPanel } from "~/components/admin/admin-ui"
import { AdminPagination } from "~/components/admin/admin-pagination"
import { NamecardStatusBadge } from "~/components/community/namecard-status-badge"
import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Skeleton } from "~/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  approveAdminNamecard,
  deleteAdminNamecard,
  flagAdminNamecard,
  getAdminNamecards,
  isApiError,
  rejectAdminNamecard,
  type AdminNamecard,
  type AdminNamecardList,
} from "~/lib/api"
import { useDebouncedValue } from "~/lib/use-debounced-value"
import { useConfirmAction } from "~/pages/admin/hooks/use-confirm-action"
import { NamecardFeedbackQueue } from "./namecard-feedback-queue"
import { NamecardManageDialog } from "./namecard-manage-dialog"
import { NamecardMediaPreview } from "./namecard-media-preview"
import { REJECT_REASON_PRESETS, VIOLATION_REASON_PRESETS } from "./reason-presets"

export function meta() {
  return [{ title: "名片管理 | IMSWeb" }]
}

const STATUS_ITEMS = [
  { value: "all", label: "全部状态" },
  { value: "pending", label: "待审核" },
  { value: "published", label: "已通过" },
  { value: "rejected", label: "已驳回" },
  { value: "locked", label: "已锁定" },
  { value: "hidden", label: "已隐藏" },
]

interface NamecardListFilters {
  query: string
  status: string
  origins: string[]
}

async function loadCards(page: number, filters: NamecardListFilters) {
  return getAdminNamecards(page, filters).send()
}

function isStaleSubmission(error: unknown) {
  return isApiError(error) && (error.status === 409 || error.status === 410)
}

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-64 rounded-xl" />
      ))}
    </div>
  )
}

export default function AdminNamecardManagePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPage = Number(searchParams.get("page") ?? "1")
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const [cards, setCards] = useState<AdminNamecard[]>([])
  const [pageInfo, setPageInfo] = useState<AdminNamecardList["pageInfo"]>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const listFocusRef = useRef<HTMLDivElement>(null)
  const queryParam = searchParams.get("query") ?? ""
  const statusParam = searchParams.get("status") ?? ""
  const originParam = searchParams.get("origin") ?? ""
  const origins = useMemo(
    () => (originParam ? originParam.split(",").filter(Boolean) : []),
    [originParam]
  )
  const [draftQuery, setDraftQuery] = useState(queryParam)
  const debouncedQuery = useDebouncedValue(draftQuery, 300)
  const filters = useMemo<NamecardListFilters>(
    () => ({ query: queryParam, status: statusParam, origins }),
    [origins, queryParam, statusParam]
  )
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

  const applyPage = useCallback((next: AdminNamecardList) => {
    setCards(next.data)
    setPageInfo(next.pageInfo)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      applyPage(await loadCards(page, filters))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [applyPage, filters, page])

  useEffect(() => {
    let active = true
    void loadCards(page, filters)
      .then((next) => {
        if (active) applyPage(next)
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
  }, [applyPage, filters, page])

  function changePage(nextPage: number) {
    setLoading(true)
    setError(false)
    const next = new URLSearchParams(searchParams)
    next.set("page", String(Math.max(1, nextPage)))
    setSearchParams(next)
  }

  const getFallbackFocus = useCallback(
    (card: AdminNamecard) => {
      const index = cards.findIndex((item) => item.id === card.id)
      const neighbour = cards[index + 1] ?? cards[index - 1]
      if (neighbour) {
        return document.querySelector<HTMLElement>(
          `[data-namecard-id="${neighbour.id}"] button`
        )
      }
      return listFocusRef.current
    },
    [cards]
  )

  const approveConfirm = useConfirmAction<AdminNamecard>({
    onConfirm: async (card) => {
      try {
        await approveAdminNamecard(card.id, card.revision).send()
        await refresh()
      } catch (cause) {
        if (isStaleSubmission(cause)) await refresh()
        throw cause
      }
    },
    getTitle: () => "通过审核",
    getDescription: (card) =>
      `名片 #${card.id} 将通过审核并公开在名片墙上展示，之后仍可锁定。`,
    successMessage: (card) => `名片 #${card.id} 已通过审核`,
    getFallbackFocus,
  })

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
        if (isStaleSubmission(cause)) await refresh()
        throw cause
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
          {(rejectFlagged ? VIOLATION_REASON_PRESETS : REJECT_REASON_PRESETS).map(
            (preset) => (
              <button
                key={preset}
                type="button"
                className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => setRejectReason(preset)}
              >
                {preset}
              </button>
            )
          )}
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
              onChange={(event) => setRejectFlagged(event.currentTarget.checked)}
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
  })

  const deleteConfirm = useConfirmAction<AdminNamecard>({
    onConfirm: async (card) => {
      try {
        await deleteAdminNamecard(card.id, card.revision).send()
        await refresh()
        if (cards.length === 1 && page > 1) changePage(page - 1)
      } catch (cause) {
        if (isStaleSubmission(cause)) await refresh()
        throw cause
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
          <TabsTrigger value="advanced">高级管理</TabsTrigger>
        </TabsList>

        <TabsContent value="feedback" className="flex flex-col gap-7 pt-5">
          <NamecardFeedbackQueue />
        </TabsContent>

        <TabsContent value="advanced" className="flex flex-col gap-7 pt-5">
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
                  onChange={(event) => setDraftQuery(event.currentTarget.value)}
                />
              </div>
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              审核状态
              <Select
                value={statusParam || "all"}
                items={STATUS_ITEMS}
                onValueChange={(value) =>
                  setStatusFilter(value === "all" ? "" : String(value))
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="pending">待审核</SelectItem>
                  <SelectItem value="published">已通过</SelectItem>
                  <SelectItem value="rejected">已驳回</SelectItem>
                  <SelectItem value="locked">已锁定</SelectItem>
                  <SelectItem value="hidden">已隐藏</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              <span>投稿来源</span>
              <div className="flex h-9 items-center gap-4">
                <label className="flex items-center gap-1.5 text-sm text-foreground">
                  <Checkbox
                    checked={origins.includes("legacy")}
                    onCheckedChange={(checked) =>
                      toggleOrigin("legacy", checked === true)
                    }
                  />
                  游客投稿
                </label>
                <label className="flex items-center gap-1.5 text-sm text-foreground">
                  <Checkbox
                    checked={origins.includes("exchange")}
                    onCheckedChange={(checked) =>
                      toggleOrigin("exchange", checked === true)
                    }
                  />
                  注册用户投稿
                </label>
              </div>
            </div>
          </div>

          <AdminPanel
            title="名片队列"
            description={`每条投稿包含正面和背面两张图片 · 共 ${pageInfo.total} 条记录`}
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
              ) : cards.length ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
                  {cards.map((card) => {
                    return (
                      <article
                        key={card.id}
                        data-namecard-id={card.id}
                        className="relative overflow-hidden rounded-xl border"
                      >
                        {card.reviewStatus === "pending" ? (
                          <Badge className="absolute top-2 left-2 z-10 border-warning-foreground/40 bg-warning text-warning-foreground shadow-sm">
                            新版本
                          </Badge>
                        ) : null}
                        <button
                          type="button"
                          className="relative block w-full cursor-zoom-in text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          aria-label={`修改名片 #${card.id}`}
                          onClick={() => setOpenCard(card.id)}
                        >
                          {card.pageCount > 2 ? (
                            <Badge className="absolute top-2 right-2 z-10 gap-1 border-border bg-background/90 text-foreground shadow-sm">
                              <ImagesIcon aria-hidden="true" />
                              {card.pageCount}
                            </Badge>
                          ) : null}
                          <NamecardMediaPreview
                            frontImageUrl={card.image1_url}
                            backImageUrl={card.image2_url}
                            altBase={`名片 #${card.id}`}
                          />
                        </button>
                        <div className="flex flex-wrap items-center gap-3 p-4">
                          <div className="mr-auto">
                            <p className="font-medium">
                              {card.producerName ?? `名片 #${card.id}`}
                            </p>
                            <NamecardStatusBadge
                              status={card.status}
                              reviewStatus={card.reviewStatus}
                            />
                          </div>
                          {card.status === "pending" ? (
                            <Button
                              type="button"
                              size="icon-sm"
                              aria-label="通过"
                              title="通过"
                              disabled={submitting}
                              onClick={(event) =>
                                approveConfirm.requestAction(
                                  card,
                                  event.currentTarget
                                )
                              }
                            >
                              {approveConfirm.submitting &&
                              approveConfirm.target?.id === card.id ? (
                                <LoaderCircleIcon className="animate-spin" />
                              ) : (
                                <CheckIcon />
                              )}
                            </Button>
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
                                rejectConfirm.requestAction(
                                  card,
                                  event.currentTarget
                                )
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
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={submitting}
                            aria-label={`删除名片 #${card.id}`}
                            onClick={(event) =>
                              deleteConfirm.requestAction(
                                card,
                                event.currentTarget
                              )
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
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <AdminEmptyState
                  icon={CheckIcon}
                  title="当前页没有名片"
                  description="新的名片投稿会显示在这里。"
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
        </TabsContent>
      </Tabs>

      {activeManageCard !== null ? (
        <NamecardManageDialog
          cardNumber={activeManageCard}
          onClose={() => setOpenCard(null)}
          onSaved={() => void refresh()}
        />
      ) : null}

      <ConfirmActionDialog
        open={approveConfirm.open}
        onOpenChange={approveConfirm.onOpenChange}
        title={approveConfirm.title}
        description={approveConfirm.description}
        submitting={approveConfirm.submitting}
        onConfirm={() => void approveConfirm.confirmAction()}
      />
      <ConfirmActionDialog
        open={rejectConfirm.open}
        onOpenChange={rejectConfirm.onOpenChange}
        title={rejectConfirm.title}
        description={rejectConfirm.description}
        submitting={rejectConfirm.submitting}
        onConfirm={() => void rejectConfirm.confirmAction()}
      />
      <ConfirmActionDialog
        open={deleteConfirm.open}
        onOpenChange={deleteConfirm.onOpenChange}
        title={deleteConfirm.title}
        description={deleteConfirm.description}
        submitting={deleteConfirm.submitting}
        confirmLabel="确认删除"
        onConfirm={() => void deleteConfirm.confirmAction()}
      />
    </div>
  )
}
