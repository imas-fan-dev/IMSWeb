import {
  ChevronDownIcon,
  ChevronRightIcon,
  DicesIcon,
  LoaderCircleIcon,
  TrophyIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import {
  getRandomOwnerlessCard,
  getWallInsights,
  isApiError,
  type WallInsights,
} from "~/lib/api"

const STORAGE_KEY = "imsweb.wall-insights.collapsed"

function ratio(part: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.round((part / total) * 100))
}

function ProgressRow({
  label,
  done,
  total,
  pending,
  hint,
}: {
  label: string
  done: number
  total: number
  pending: number
  hint: string
}) {
  const percent = ratio(done, total)
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {done} / {total}（{percent}%）· 待审 {pending}
        </p>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

/**
 * 名片墙顶部的临时面板：认领/补充进度、贡献榜前五、当前用户的贡献，
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
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored !== null) return stored === "1"
    // 手机上首屏留给名片墙本身。
    if (typeof window.matchMedia !== "function") return false
    return window.matchMedia("(max-width: 640px)").matches
  })

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

  function toggle() {
    setCollapsed((current) => {
      const next = !current
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
      }
      return next
    })
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

  const claimTotal = (insights?.claimed ?? 0) + (insights?.ownerless ?? 0)
  const supplementTotal =
    (insights?.supplemented ?? 0) + (insights?.ownerlessMissingSeries ?? 0)

  return (
    <section
      aria-labelledby="wall-insights-title"
      className="rounded-xl border bg-card/60 p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <TrophyIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        <h2 id="wall-insights-title" className="text-sm font-semibold">
          名片墙维护进度
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-expanded={!collapsed}
          onClick={toggle}
        >
          {collapsed ? (
            <ChevronRightIcon data-icon="inline-start" aria-hidden="true" />
          ) : (
            <ChevronDownIcon data-icon="inline-start" aria-hidden="true" />
          )}
          {collapsed ? "展开" : "收起"}
        </Button>
      </div>

      {collapsed ? null : (
        <>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <ProgressRow
              label="认领进度"
              done={insights?.claimed ?? 0}
              total={claimTotal}
              pending={insights?.claimsPending ?? 0}
              hint="无主名片被制作人认领后，其余资料就能在名片编辑器里补全。"
            />
            <ProgressRow
              label="信息补充进度"
              done={insights?.supplemented ?? 0}
              total={supplementTotal}
              pending={insights?.supplementsPending ?? 0}
              hint="企划是唯一通用的判断标准，缺企划的无主名片最需要帮忙。"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">贡献榜</p>
              {insights?.contributors.length ? (
                <ol className="mt-1 space-y-1 text-sm">
                  {insights.contributors.map((contributor, index) => (
                    <li
                      key={contributor.accountId}
                      className="flex items-baseline gap-2"
                    >
                      <span className="w-4 text-right text-xs text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="truncate">{contributor.displayName}</span>
                      <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                        {contributor.points} 点 · {contributor.cards} 张
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  还没有人拿到贡献值，补充通过的第一张名片就是第一条记录。
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {insights?.viewer
                  ? `你：${insights.viewer.points} 点${
                      insights.viewer.rank
                        ? ` · 第 ${insights.viewer.rank} 名`
                        : ""
                    }`
                  : "登录后可以查看自己的贡献值。"}
              </p>
            </div>

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
        </>
      )}
    </section>
  )
}
