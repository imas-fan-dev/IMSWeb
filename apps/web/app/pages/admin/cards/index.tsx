import {
  CheckIcon,
  ContactRoundIcon,
  LoaderCircleIcon,
  LockIcon,
  LockOpenIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"

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
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
} from "~/components/admin/admin-ui"
import { AdminPagination } from "~/components/admin/admin-pagination"
import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { Badge } from "~/components/ui/badge"
import { useConfirmAction } from "~/pages/admin/hooks/use-confirm-action"
import { CardClaimReviewPanel } from "~/pages/admin/cards/fudaba-card-moderation-panels"
import { useDebouncedValue } from "~/lib/use-debounced-value"
import {
  approveAdminNamecard,
  flagAdminNamecard,
  getAdminNamecards,
  isApiError,
  lockAdminNamecard,
  rejectAdminNamecard,
  unlockAdminNamecard,
  type AdminNamecard,
  type AdminNamecardList,
} from "~/lib/api"
import { NamecardMediaPreview } from "./namecard-media-preview"
import { NamecardStatusBadge } from "./namecard-status-badge"

export function meta() {
  return [{ title: "名片审核 | IMSWeb" }]
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

export default function AdminCardsPage() {
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
        const response = await approveAdminNamecard(
          card.id,
          card.revision
        ).send()
        void response
        // Reload instead of patching locally: the queue is filtered and sorted on
        // the server, so a published card may belong on another page.
        await refresh()
      } catch (error) {
        if (isStaleSubmission(error)) await refresh()
        throw error
      }
    },
    getTitle: () => "通过审核",
    getDescription: (card) =>
      `名片 #${card.id} 将通过审核并公开在名片墙上展示，之后仍可删除。`,
    successMessage: (card) => `名片 #${card.id} 已通过审核`,
    getFallbackFocus,
  })

  const [lockReason, setLockReason] = useState("")

  const LOCK_REASON_PRESETS = [
    "用户主动删除",
    "非企划内容",
    "NSFW内容",
    "涉及对现实人物的侮辱",
  ] as const

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
        if (isStaleSubmission(error)) await refresh()
        throw error
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
        if (isStaleSubmission(error)) await refresh()
        throw error
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

  const REJECT_REASON_PRESETS = [
    "信息缺失",
    "信息不符",
    "图片模糊",
    "内容不当",
    "重复提交",
  ] as const

  // A flagged submission is rejected for breaking the rules, not for being
  // incomplete, so it gets its own preset set.
  const VIOLATION_REASON_PRESETS = [
    "非企划内容",
    "NSFW内容",
    "涉及对现实人物的侮辱",
    "侵权内容",
  ] as const

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
        if (isStaleSubmission(error)) await refresh()
        throw error
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
  })

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

      <Tabs defaultValue="guest">
        <TabsList aria-label="名片审核类型">
          <TabsTrigger value="guest">投稿审核</TabsTrigger>
          <TabsTrigger value="claims">旧名片认领</TabsTrigger>
        </TabsList>

        <TabsContent value="guest" className="flex flex-col gap-7 pt-5">
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
                        <NamecardMediaPreview
                          frontImageUrl={card.image1_url}
                          backImageUrl={card.image2_url}
                          altBase={`名片 #${card.id}`}
                        />
                        <div className="flex flex-wrap items-center gap-3 p-4">
                          <div className="mr-auto">
                            <p className="font-medium">
                              {card.producerName ?? `名片 #${card.id}`}
                            </p>
                            <NamecardStatusBadge status={card.status} />
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
                          {card.status === "locked" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={submitting}
                              aria-label={`解除锁定名片 #${card.id}`}
                              onClick={(event) =>
                                unlockConfirm.requestAction(
                                  card,
                                  event.currentTarget
                                )
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
                                lockConfirm.requestAction(
                                  card,
                                  event.currentTarget
                                )
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

        <TabsContent value="claims" className="pt-5">
          <CardClaimReviewPanel />
        </TabsContent>
      </Tabs>

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
        open={unlockConfirm.open}
        onOpenChange={unlockConfirm.onOpenChange}
        title={unlockConfirm.title}
        description={unlockConfirm.description}
        submitting={unlockConfirm.submitting}
        onConfirm={() => void unlockConfirm.confirmAction()}
        confirmLabel="确认解锁"
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
