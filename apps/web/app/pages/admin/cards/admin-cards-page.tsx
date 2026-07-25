import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ContactRoundIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
} from "~/pages/admin/components/admin-ui"
import {
  approveAdminNamecard,
  deleteAdminNamecard,
  getAdminNamecards,
  type AdminNamecard,
} from "~/shared/api"

export function meta() {
  return [{ title: "名片审核 | IMSWeb" }]
}

async function loadCards(page: number) {
  return (await getAdminNamecards(page).send()).data
}

export default function AdminCardsPage() {
  const [page, setPage] = useState(1)
  const [cards, setCards] = useState<AdminNamecard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setCards(await loadCards(page))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    let active = true
    void loadCards(page)
      .then((next) => {
        if (active) setCards(next)
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
  }, [page])

  function changePage(nextPage: number) {
    setLoading(true)
    setError(false)
    setPage(nextPage)
  }

  async function mutate(card: AdminNamecard, action: "approve" | "delete") {
    setBusyId(card.id)
    try {
      if (action === "approve") {
        await approveAdminNamecard(card.id).send()
        toast.success(`名片 #${card.id} 已通过审核`)
      } else {
        await deleteAdminNamecard(card.id).send()
        toast.success(`名片 #${card.id} 已删除`)
      }
      await refresh()
    } catch {
      toast.error("操作失败，请刷新后重试")
    } finally {
      setBusyId(null)
    }
  }

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
        <Badge variant="outline">{cards.length} 条记录</Badge>
      </div>

      <AdminPanel
        title="名片队列"
        description="每条投稿包含正面和背面两张图片"
        icon={ContactRoundIcon}
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">正在读取名片队列……</p>
        ) : error ? (
          <AdminEmptyState
            icon={ContactRoundIcon}
            title="无法读取名片队列"
            description="请确认管理会话有效，然后刷新页面重试。"
          />
        ) : cards.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {cards.map((card) => (
              <article
                key={card.id}
                className="overflow-hidden rounded-xl border"
              >
                <div className="grid grid-cols-2 gap-px bg-border">
                  {[card.image1_url, card.image2_url].map((image, index) => (
                    <a
                      key={image}
                      href={image}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={image}
                        alt={`名片 #${card.id} ${index === 0 ? "正面" : "背面"}`}
                        className="aspect-[3/2] w-full bg-muted object-cover"
                        loading="lazy"
                      />
                    </a>
                  ))}
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
                      disabled={busyId === card.id}
                      onClick={() => void mutate(card, "approve")}
                    >
                      <CheckIcon data-icon="inline-start" />
                      通过
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busyId === card.id}
                    onClick={() => void mutate(card, "delete")}
                  >
                    <Trash2Icon data-icon="inline-start" />
                    删除
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <AdminEmptyState
            icon={CheckIcon}
            title="当前页没有名片"
            description="新的名片投稿会显示在这里。"
          />
        )}
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
        <Button
          type="button"
          variant="outline"
          disabled={cards.length < 10 || loading}
          onClick={() => changePage(page + 1)}
        >
          下一页
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </div>
  )
}
