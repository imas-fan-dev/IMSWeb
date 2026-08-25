import { BookmarkIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import {
  getFudabaFavoriteCardPage,
  type FudabaCard,
  type FudabaCardInteractions,
  type FudabaCardPage,
  type FudabaSeries,
} from "~/lib/api"
import { ExchangeCard } from "../exchange-components"
import { apiMessage } from "./exchange-me-model"

type CollectionPhase = "loading" | "ready" | "error"

const PAGE_SIZE = 12

const emptyPageInfo: FudabaCardPage["pageInfo"] = {
  hasNextPage: false,
  nextCursor: null,
}

export function FavoriteCollection({ series }: { series: FudabaSeries[] }) {
  const [phase, setPhase] = useState<CollectionPhase>("loading")
  const [cards, setCards] = useState<FudabaCard[]>([])
  const [pageInfo, setPageInfo] =
    useState<FudabaCardPage["pageInfo"]>(emptyPageInfo)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const generation = useRef(0)
  const seriesMap = new Map(series.map((entry) => [entry.code, entry]))

  const accept = useCallback((page: FudabaCardPage, requested: number) => {
    if (generation.current !== requested) return
    setCards(page.items)
    setPageInfo(page.pageInfo)
    setPhase("ready")
  }, [])

  const reject = useCallback((caught: unknown, requested: number) => {
    if (generation.current !== requested) return
    setError(apiMessage(caught, "收藏列表加载失败。"))
    setPhase("error")
  }, [])

  useEffect(() => {
    const requested = ++generation.current
    void getFudabaFavoriteCardPage({ limit: PAGE_SIZE })
      .send()
      .then((page) => accept(page, requested))
      .catch((caught: unknown) => reject(caught, requested))
    return () => {
      generation.current += 1
    }
  }, [accept, reject])

  function reload() {
    const requested = ++generation.current
    setPhase("loading")
    setError(null)
    void getFudabaFavoriteCardPage({ limit: PAGE_SIZE })
      .send()
      .then((page) => accept(page, requested))
      .catch((caught: unknown) => reject(caught, requested))
  }

  async function loadMore() {
    if (!pageInfo.nextCursor || loadingMore) return
    const current = generation.current
    setLoadingMore(true)
    try {
      const page = await getFudabaFavoriteCardPage({
        limit: PAGE_SIZE,
        cursor: pageInfo.nextCursor,
      }).send()
      if (generation.current !== current) return
      setCards((existing) => [...existing, ...page.items])
      setPageInfo(page.pageInfo)
    } catch (caught) {
      if (generation.current !== current) return
      setError(apiMessage(caught, "收藏列表加载失败。"))
    } finally {
      setLoadingMore(false)
    }
  }

  function syncInteractions(
    cardId: string,
    interactions: FudabaCardInteractions
  ) {
    setCards((existing) =>
      interactions.viewerFavorited
        ? existing.map((card) =>
            card.id === cardId ? { ...card, interactions } : card
          )
        : existing.filter((card) => card.id !== cardId)
    )
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-3 border-b pb-5">
        <div className="min-w-0">
          <h2
            id="profile-workspace-favorites-title"
            className="text-xl font-semibold"
          >
            收藏夹
          </h2>
          <p className="mt-2 text-sm/6 text-muted-foreground">
            收藏的名片会集中在这里，取消收藏后会立即移出列表。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="刷新收藏夹"
          title="刷新"
          onClick={reload}
        >
          <RefreshCwIcon aria-hidden="true" />
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>收藏夹加载失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {phase === "loading" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-72 w-full" />
          ))}
        </div>
      ) : null}

      {phase === "ready" && cards.length === 0 ? (
        <Empty className="mt-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookmarkIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>还没有收藏名片</EmptyTitle>
            <EmptyDescription>
              在交换广场浏览名片时点收藏，之后就能在这里回顾。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {cards.length > 0 ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <ExchangeCard
                key={card.id}
                card={card}
                series={seriesMap}
                onInteractionsChange={(interactions) =>
                  syncInteractions(card.id, interactions)
                }
              />
            ))}
          </div>
          {pageInfo.hasNextPage ? (
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? (
                  <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
                ) : null}
                加载更多
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
