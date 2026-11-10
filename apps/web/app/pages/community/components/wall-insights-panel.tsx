import {
  ChevronRightIcon,
  DicesIcon,
  LoaderCircleIcon,
  TrophyIcon,
  IdCardIcon,
  FilePenLineIcon,
} from "lucide-react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import type { WallInsights } from "@imsweb/contracts/namecards"

import { Button } from "~/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import { cn } from "~/lib/utils"
import {
  WallContributorList,
  WallContributorsDialog,
} from "./wall-contributors-dialog"
import { getRandomOwnerlessCard, getWallInsights, isApiError } from "~/lib/api"

const STORAGE_KEY = "imsweb.wall-insights.collapsed"
const subscribeToHydration = () => () => undefined

function ratio(part: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (part / total) * 100))
}

function ProgressRow({
  label,
  done,
  total,
  pending,
}: {
  label: string
  done: number
  total: number
  pending: number
}) {
  const percent = ratio(done, total)
  const percentage =
    percent > 0 && percent < 0.1
      ? "<0.1"
      : percent.toLocaleString("zh-CN", { maximumFractionDigits: 1 })
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          {label === "认领进度" ? (
            <IdCardIcon
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <FilePenLineIcon
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          {label}
        </p>
        <span className="text-xs text-muted-foreground tabular-nums">
          待审 {pending.toLocaleString()}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 tabular-nums">
        <p>
          <span className="text-3xl font-semibold">
            {done.toLocaleString()}
          </span>
          <span className="ml-1.5 text-sm text-muted-foreground">
            / {total.toLocaleString()} 张
          </span>
        </p>
        <span className="text-sm font-medium text-primary">{percentage}%</span>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`已完成 ${done} 张，共 ${total} 张，${percentage}%`}
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${percent}%`, minWidth: done > 0 ? "3px" : 0 }}
        />
      </div>
    </div>
  )
}

/**
 * 名片墙顶部的维护面板：认领/补充进度、贡献榜前三、完整榜单与当前用户的贡献，
 * 以及一个「随机找一张缺企划的无主名片」的入口。可以折叠，选择记在本地。
 */
export function WallInsightsPanel({
  onPickCard,
}: {
  onPickCard: (cardNumber: number) => void
}) {
  const [insights, setInsights] = useState<WallInsights | null>(null)
  const [failed, setFailed] = useState(false)
  const [picking, setPicking] = useState(false)
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  )
  const [collapsedPreference, setCollapsedPreference] = useState(() => {
    if (typeof window === "undefined") return false
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored !== null) return stored === "1"
    // 手机上首屏留给名片墙本身。
    if (typeof window.matchMedia !== "function") return false
    return window.matchMedia("(max-width: 640px)").matches
  })
  // Match the server markup before applying the browser's saved or mobile preference.
  const collapsed = hydrated && collapsedPreference

  useEffect(() => {
    let active = true
    void getWallInsights()
      .send()
      .then((next) => {
        if (active) setInsights(next)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [])

  function changeOpen(open: boolean) {
    setCollapsedPreference(!open)
    window.localStorage.setItem(STORAGE_KEY, open ? "0" : "1")
  }

  async function pickRandom() {
    if (picking) return
    setPicking(true)
    try {
      const result = await getRandomOwnerlessCard().send()
      onPickCard(result.cardNumber)
    } catch (error) {
      toast.error(
        isApiError(error)
          ? "暂时没有缺少企划的无主名片了"
          : "抽取名片失败，请重试"
      )
    } finally {
      setPicking(false)
    }
  }

  if (failed) return null

  // 两条进度共用同一个分母：已通过的游客投稿总数。
  const guestTotal = insights?.guestTotal ?? 0

  return (
    <section
      aria-labelledby="wall-insights-title"
      className="mb-6 overflow-hidden rounded-xl border bg-card/90 sm:mb-8"
    >
      <Collapsible open={!collapsed} onOpenChange={changeOpen}>
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <IdCardIcon className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 id="wall-insights-title" className="text-sm font-semibold">
              名片墙维护进度
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              一起让每张名片的信息更完整
            </p>
          </div>
          <CollapsibleTrigger
            render={<Button variant="ghost" size="sm" className="ml-auto" />}
          >
            <ChevronRightIcon
              data-icon="inline-start"
              aria-hidden="true"
              className={cn(
                "transition-transform duration-(--duration-ui) ease-(--ease-ui) motion-reduce:transition-none",
                !collapsed && "rotate-90"
              )}
            />
            {collapsed ? "展开" : "收起"}
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent
          id="wall-insights-content"
          className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-(--duration-ui) ease-(--ease-ui) data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"
        >
          <div className="grid border-t lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col px-4 py-5 sm:px-6">
              {!insights ? (
                <p role="status" className="py-6 text-sm text-muted-foreground">
                  正在加载维护进度…
                </p>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-1 lg:gap-5">
                  <ProgressRow
                    label="认领进度"
                    done={insights?.claimed ?? 0}
                    total={guestTotal}
                    pending={insights?.claimsPending ?? 0}
                  />
                  <ProgressRow
                    label="信息补充进度"
                    done={insights?.supplemented ?? 0}
                    total={guestTotal}
                    pending={insights?.supplementsPending ?? 0}
                  />
                </div>
              )}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4 lg:mt-auto lg:pt-4">
                <p className="text-xs text-muted-foreground">
                  认领你的名片，或帮忙补充缺失的信息。
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={picking || !insights}
                  onClick={() => void pickRandom()}
                >
                  {picking ? (
                    <LoaderCircleIcon
                      data-icon="inline-start"
                      className="animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : (
                    <DicesIcon data-icon="inline-start" aria-hidden="true" />
                  )}
                  随机补充一张
                </Button>
              </div>
            </div>

            <div className="min-w-0 border-t bg-muted/20 p-4 sm:px-6 lg:border-t-0 lg:border-l">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <TrophyIcon
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                  贡献榜{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    前 3 名
                  </span>
                </h3>
                <WallContributorsDialog
                  viewerAccountId={insights?.viewer?.accountId}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                贡献值对比，以榜首为基准
              </p>
              {!insights ? (
                <p role="status" className="py-5 text-sm text-muted-foreground">
                  正在加载贡献榜…
                </p>
              ) : insights.contributors.length ? (
                <WallContributorList
                  contributors={insights.contributors.slice(0, 3)}
                  viewerAccountId={insights.viewer?.accountId}
                  showComparison
                />
              ) : (
                <p className="py-5 text-sm text-muted-foreground">
                  暂无贡献记录，期待你的第一份贡献。
                </p>
              )}
              <p className="mt-1 border-t pt-3 text-xs text-muted-foreground tabular-nums">
                {insights?.viewer
                  ? `我的贡献：${insights.viewer.points.toLocaleString()} 点${
                      insights.viewer.rank
                        ? ` · 第 ${insights.viewer.rank} 名`
                        : " · 暂未上榜"
                    }`
                  : "登录后可以查看自己的贡献值。"}
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
