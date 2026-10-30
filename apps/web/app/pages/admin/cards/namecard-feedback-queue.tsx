import { FlagIcon, ImagesIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router"

import { AdminEmptyState, AdminPanel } from "~/components/admin/admin-ui"
import { AdminPagination } from "~/components/admin/admin-pagination"
import { Badge } from "~/components/ui/badge"
import { Skeleton } from "~/components/ui/skeleton"
import {
  getAdminNamecardFeedback,
  type AdminNamecardFeedback,
  type AdminNamecardFeedbackList,
} from "~/lib/api"
import { NamecardManageDialog } from "./namecard-manage-dialog"
import { NamecardMediaPreview } from "./namecard-media-preview"

function QueueSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-64 rounded-xl" />
      ))}
    </div>
  )
}

/**
 * The default face of the management entry: reports filed from the card wall.
 * Cards carry no actions — opening one shows the reported card in the editor.
 */
export function NamecardFeedbackQueue() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPage = Number(searchParams.get("page") ?? "1")
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const [items, setItems] = useState<AdminNamecardFeedback[]>([])
  const [pageInfo, setPageInfo] = useState<AdminNamecardFeedbackList["pageInfo"]>(
    { page: 1, pageSize: 12, total: 0, totalPages: 0, hasNextPage: false }
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [openItem, setOpenItem] = useState<AdminNamecardFeedback | null>(null)

  const applyPage = useCallback((next: AdminNamecardFeedbackList) => {
    setItems(next.data)
    setPageInfo(next.pageInfo)
  }, [])

  const refresh = useCallback(async () => {
    try {
      applyPage(await getAdminNamecardFeedback(page).send())
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [applyPage, page])

  useEffect(() => {
    let active = true
    void getAdminNamecardFeedback(page)
      .send()
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
    const next = new URLSearchParams(searchParams)
    next.set("page", String(Math.max(1, nextPage)))
    setSearchParams(next)
  }

  return (
    <>
      <AdminPanel
        title="反馈队列"
        description={`名片墙上提交的反馈 · 共 ${pageInfo.total} 条待处理`}
        icon={FlagIcon}
      >
        {loading ? (
          <QueueSkeleton />
        ) : error ? (
          <AdminEmptyState
            icon={FlagIcon}
            title="无法读取反馈队列"
            description="请确认管理会话有效，然后刷新页面重试。"
          />
        ) : items.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
            {items.map((item) => (
              <article
                key={item.id}
                data-feedback-id={item.id}
                className="relative overflow-hidden rounded-xl border"
              >
                <button
                  type="button"
                  className="relative block w-full cursor-zoom-in text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={`处理反馈 #${item.id}`}
                  onClick={() => setOpenItem(item)}
                >
                  {item.pageCount > 2 ? (
                    <Badge className="absolute top-2 right-2 z-10 gap-1 border-border bg-background/90 text-foreground shadow-sm">
                      <ImagesIcon aria-hidden="true" />
                      {item.pageCount}
                    </Badge>
                  ) : null}
                  <NamecardMediaPreview
                    frontImageUrl={item.image1_url}
                    backImageUrl={item.image2_url}
                    altBase={`名片 #${item.cardNumber}`}
                  />
                </button>
                <div className="flex flex-col gap-1 p-4">
                  <p className="font-medium">
                    {item.producerName ?? `名片 #${item.cardNumber}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    反馈人：{item.reporterName}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <AdminEmptyState
            icon={FlagIcon}
            title="没有待处理的反馈"
            description="名片墙上提交的反馈会显示在这里。"
          />
        )}
      </AdminPanel>

      <AdminPagination
        page={pageInfo.page}
        totalPages={pageInfo.totalPages}
        disabled={loading}
        onChange={changePage}
      />

      {openItem ? (
        <NamecardManageDialog
          cardNumber={openItem.cardNumber}
          feedback={{
            id: openItem.id,
            reason: openItem.reason,
            detail: openItem.detail,
            reporterName: openItem.reporterName,
          }}
          onClose={() => setOpenItem(null)}
          onSaved={() => {
            setOpenItem(null)
            setLoading(true)
            void refresh()
          }}
        />
      ) : null}
    </>
  )
}
