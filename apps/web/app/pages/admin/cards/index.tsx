import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ContactRoundIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
} from "~/components/admin/admin-ui"
import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { useConfirmAction } from "~/pages/admin/hooks/use-confirm-action"
import {
  approveAdminNamecard,
  deleteAdminNamecard,
  getAdminNamecards,
  type AdminNamecard,
  type AdminNamecardList,
} from "~/lib/api"

export function meta() {
  return [{ title: "名片审核 | IMSWeb" }]
}

async function loadCards(page: number) {
  return getAdminNamecards(page).send()
}

export default function AdminCardsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPage = Number(searchParams.get("page") ?? "1")
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1
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

  const applyPage = useCallback((next: AdminNamecardList) => {
    setCards(next.data)
    setPageInfo(next.pageInfo)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      applyPage(await loadCards(page))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [applyPage, page])

  useEffect(() => {
    let active = true
    void loadCards(page)
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
  }, [applyPage, page])

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
      const response = await approveAdminNamecard(card.id, card.revision).send()
      setCards((current) =>
        current.map((item) =>
          item.id === card.id
            ? { ...item, status: "approved", revision: response.revision }
            : item
        )
      )
    },
    getTitle: () => "通过审核",
    getDescription: (card) =>
      `名片 #${card.id} 将公开可见。通过后无法撤回审核状态。`,
    successMessage: (card) => `名片 #${card.id} 已通过审核`,
    getFallbackFocus,
  })

  const deleteConfirm = useConfirmAction<AdminNamecard>({
    onConfirm: async (card) => {
      await deleteAdminNamecard(card.id, card.revision).send()
      setCards((current) => current.filter((item) => item.id !== card.id))
      setPageInfo((current) => ({
        ...current,
        total: Math.max(0, current.total - 1),
        totalPages: Math.ceil(
          Math.max(0, current.total - 1) / current.pageSize
        ),
      }))
      if (cards.length === 1 && page > 1) changePage(page - 1)
    },
    getTitle: () => "删除名片",
    getDescription: (card) =>
      `名片 #${card.id} 将永久删除，已发布的图片也会清理。此操作不可撤销。`,
    successMessage: (card) => `名片 #${card.id} 已删除`,
    getFallbackFocus,
  })

  const submitting = approveConfirm.submitting || deleteConfirm.submitting

  return (
    <div className="flex flex-col gap-7">
      <AdminPageHeader
        eyebrow="NAMECARD REVIEW"
        title="制作人名片审核"
        description="审核公开投稿的双面制作人名片，并清理不再适合展示的内容。"
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

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">第 {page} 页</Badge>
        <Badge variant="outline">共 {pageInfo.total} 条记录</Badge>
      </div>

      <AdminPanel
        title="名片队列"
        description="每条投稿包含正面和背面两张图片"
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
            <div className="grid gap-4 md:grid-cols-2">
              {cards.map((card) => {
                return (
                  <article
                    key={card.id}
                    data-namecard-id={card.id}
                    className="overflow-hidden rounded-xl border"
                  >
                    <div className="grid grid-cols-2 gap-px bg-border">
                      {[card.image1_url, card.image2_url].map(
                        (image, index) => (
                          <a
                            key={`${card.id}-${index}`}
                            href={image}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img
                              src={image}
                              alt={`名片 #${card.id} ${index === 0 ? "正面" : "背面"}`}
                              className="aspect-3/2 w-full bg-muted object-cover"
                              loading="lazy"
                            />
                          </a>
                        )
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 p-4">
                      <div className="mr-auto">
                        <p className="font-medium">名片 #{card.id}</p>
                        <p className="text-xs text-muted-foreground">
                          状态：{card.status}
                        </p>
                      </div>
                      {card.status !== "approved" ? (
                        <Button
                          type="button"
                          size="sm"
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
                            <LoaderCircleIcon
                              data-icon="inline-start"
                              className="animate-spin"
                            />
                          ) : (
                            <CheckIcon data-icon="inline-start" />
                          )}
                          通过
                        </Button>
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

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1 || loading}
          onClick={() => changePage(page - 1)}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          上一页
        </Button>
        <span className="text-xs text-muted-foreground">
          {pageInfo.totalPages
            ? `第 ${page} / ${pageInfo.totalPages} 页`
            : "暂无记录"}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={!pageInfo.hasNextPage || loading}
          onClick={() => changePage(page + 1)}
        >
          下一页
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </div>

      <ConfirmActionDialog
        open={approveConfirm.open}
        onOpenChange={approveConfirm.onOpenChange}
        title={approveConfirm.title}
        description={approveConfirm.description}
        submitting={approveConfirm.submitting}
        onConfirm={() => void approveConfirm.confirmAction()}
        confirmLabel="确认通过"
        variant="default"
        icon={CheckIcon}
      />

      <ConfirmActionDialog
        open={deleteConfirm.open}
        onOpenChange={deleteConfirm.onOpenChange}
        title={deleteConfirm.title}
        description={deleteConfirm.description}
        submitting={deleteConfirm.submitting}
        onConfirm={() => void deleteConfirm.confirmAction()}
      />
    </div>
  )
}

function CardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-label="正在加载名片队列">
      <Skeleton className="aspect-3/1 w-full rounded-xl" />
      <Skeleton className="aspect-3/1 w-full rounded-xl" />
      <Skeleton className="aspect-3/1 w-full rounded-xl" />
    </div>
  )
}
