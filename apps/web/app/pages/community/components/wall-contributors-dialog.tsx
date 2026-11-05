import { ChevronLeftIcon, ChevronRightIcon, TrophyIcon } from "lucide-react"
import { useEffect, useState } from "react"
import type {
  NamecardContributors,
  WallInsightContributor,
} from "@imsweb/contracts/namecards"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog"
import { getNamecardContributors } from "~/lib/api"
import { cn } from "~/lib/utils"

export function WallContributorList({
  contributors,
  startRank = 1,
  viewerAccountId,
  showComparison = false,
}: {
  contributors: WallInsightContributor[]
  startRank?: number
  viewerAccountId?: string
  showComparison?: boolean
}) {
  const leaderPoints = contributors[0]?.points ?? 0
  return (
    <ol start={startRank} className="divide-y divide-border/60">
      {contributors.map((contributor, index) => {
        const rank = startRank + index
        const isViewer = contributor.accountId === viewerAccountId
        return (
          <li
            key={contributor.accountId}
            className={cn(
              "flex items-center gap-3 py-3",
              isViewer && "bg-primary/5"
            )}
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground tabular-nums",
                rank === 1 && "bg-primary/10 text-primary",
                rank > 1 && rank <= 3 && "text-foreground"
              )}
            >
              {rank}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className="min-w-0 truncate text-sm font-medium"
                  title={contributor.displayName}
                >
                  {contributor.displayName}
                  {isViewer && (
                    <span className="ml-1 text-xs text-primary">（你）</span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {contributor.points.toLocaleString()}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    点
                  </span>
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3">
                {showComparison && (
                  <div
                    className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full bg-primary/60"
                      style={{
                        width: `${leaderPoints > 0 ? (contributor.points / leaderPoints) * 100 : 0}%`,
                      }}
                    />
                  </div>
                )}
                <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                  参与 {contributor.cards.toLocaleString()} 张名片
                </span>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function WallContributorsDialog({
  viewerAccountId,
}: {
  viewerAccountId?: string
}) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{
    page: number
    data: NamecardContributors | null
  } | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    void getNamecardContributors(page)
      .send()
      .then(
        (data) => {
          if (active) setResult({ page, data })
        },
        () => {
          if (active) setResult({ page, data: null })
        }
      )
    return () => {
      active = false
    }
  }, [open, page, attempt])

  const loading = result?.page !== page
  const data = loading ? null : result?.data
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setPage(1)
          setResult(null)
        }
      }}
    >
      <DialogTrigger
        render={<Button variant="ghost" size="sm" className="shrink-0" />}
      >
        完整榜单
        <ChevronRightIcon data-icon="inline-end" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent layout="pinned" className="sm:max-w-lg">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center gap-2">
            <TrophyIcon className="size-4 text-primary" aria-hidden="true" />
            名片墙贡献榜
          </DialogTitle>
          <DialogDescription>
            感谢每一位参与名片维护的制作人，按累计贡献值排序。
          </DialogDescription>
        </DialogHeader>
        <DialogBody
          tabIndex={0}
          role="region"
          aria-label="贡献者列表"
          className="rounded-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          {loading ? (
            <p
              role="status"
              className="py-12 text-center text-muted-foreground"
            >
              正在加载贡献榜…
            </p>
          ) : !data ? (
            <div className="space-y-3 py-8 text-center">
              <p role="alert" className="text-muted-foreground">
                贡献榜加载失败，请重试。
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setResult(null)
                  setAttempt((value) => value + 1)
                }}
              >
                重试
              </Button>
            </div>
          ) : data.contributors.length ? (
            <WallContributorList
              contributors={data.contributors}
              startRank={(data.pageInfo.page - 1) * data.pageInfo.pageSize + 1}
              viewerAccountId={viewerAccountId}
            />
          ) : (
            <p className="py-12 text-center text-muted-foreground">
              {data.pageInfo.total === 0
                ? "暂无贡献记录，期待你的第一份贡献。"
                : "这一页暂无贡献记录，请返回上一页。"}
            </p>
          )}
        </DialogBody>
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <p
            className="text-xs text-muted-foreground tabular-nums"
            role="status"
          >
            {data
              ? `共 ${data.pageInfo.total.toLocaleString()} 位 · ${page > Math.max(1, data.pageInfo.totalPages) ? `第 ${page} 页` : `${page} / ${Math.max(1, data.pageInfo.totalPages)} 页`}`
              : `第 ${page} 页`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="上一页"
              disabled={loading || page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="下一页"
              disabled={loading || !data?.pageInfo.hasNextPage}
              onClick={() => setPage((value) => value + 1)}
            >
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
