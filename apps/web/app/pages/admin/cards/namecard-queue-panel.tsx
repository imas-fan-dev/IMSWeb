import { CheckIcon, ContactRoundIcon } from "lucide-react"
import type { ReactNode } from "react"

import { AdminEmptyState, AdminPanel } from "~/components/admin/admin-ui"
import { AdminPagination } from "~/components/admin/admin-pagination"
import { NamecardStatusBadge } from "~/components/community/namecard-status-badge"
import { Badge } from "~/components/ui/badge"
import type { AdminNamecard } from "~/lib/api"
import { NamecardMediaPreview } from "./namecard-media-preview"
import { NamecardQueueSkeleton } from "./namecard-queue-skeleton"
import type { NamecardQueue } from "./use-namecard-queue"

/**
 * 后台两个名片页共用的队列面板：标题与记录数、加载/错误/空态、卡片网格与分页。
 *
 * 行内的裁决按钮由页面通过 `renderRowActions` 注入，卡片打开后的去向也由页面
 * 决定，因为两处的用途不同（看审核详情 / 直接改资料）。
 */
export function NamecardQueuePanel({
  queue,
  openCardLabel,
  onOpenCard,
  renderRowActions,
}: {
  queue: NamecardQueue
  /** 打开卡片那个按钮的无障碍名称。 */
  openCardLabel: (card: AdminNamecard) => string
  onOpenCard: (card: AdminNamecard) => void
  renderRowActions: (card: AdminNamecard) => ReactNode
}) {
  const { cards, pageInfo, loading, error, listFocusRef, page, changePage } =
    queue

  return (
    <>
      <AdminPanel
        title="名片队列"
        description={`每条投稿包含正面和背面两张图片 · 共 ${pageInfo.total} 条记录`}
        icon={ContactRoundIcon}
      >
        <div ref={listFocusRef} tabIndex={-1} aria-label="名片队列内容">
          {loading ? (
            <NamecardQueueSkeleton />
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
                      aria-label={openCardLabel(card)}
                      onClick={() => onOpenCard(card)}
                    >
                      <NamecardMediaPreview
                        pages={card.pages}
                        altBase={`名片 #${card.id}`}
                        pageCount={card.pageCount}
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
                      {renderRowActions(card)}
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
    </>
  )
}
