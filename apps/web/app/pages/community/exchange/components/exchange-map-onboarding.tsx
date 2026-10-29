import { useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog"

export const mapGuideSteps = [
  {
    target: "map",
    title: "在地图上找事务所",
    text: "地图标记代表已公开的事务所。点击查看详情；数字聚合点可以放大，同一位置也可能有多个事务所。",
  },
  {
    target: "search",
    title: "搜索地点或事务所",
    text: "切换地点与事务所页签，输入名称、城市或地址，再选择结果定位。",
  },
  {
    target: "offices",
    title: "事务所也能从名录查看",
    text: "打开事务所名录，可以用列表浏览事务所并进入详情，不必逐个寻找地图标记。",
  },
  {
    target: "filters",
    title: "筛选想看的事务所",
    text: "按城市、作品标签和是否开放交换缩小范围，地图与名录使用同一套筛选。",
  },
  {
    target: "create",
    title: "在选定位置创建事务所",
    text: "电脑上右键，手机和 App 中长按地图空白处，即可在此创建。也可以使用这里的“选择位置创建事务所”。",
  },
  {
    target: "account",
    title: "管理自己的事务所",
    text: "从我的交换账号进入“事务所与位置”，查看和编辑自己的事务所。新建或修改后须审核，通过后才会公开。",
  },
] as const

export function ExchangeMapOnboarding({
  step,
  onStep,
  onFinish,
}: {
  step: number | null
  onStep(step: number): void
  onFinish(): void
}) {
  const current = step === null ? null : mapGuideSteps[step]
  const [frame, setFrame] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  useLayoutEffect(() => {
    if (!current) return
    const measure = () => {
      const target = document.querySelector(
        `[data-map-guide="${current.target}"]`
      )
      const rect = target?.getBoundingClientRect()
      setFrame(
        rect && rect.width && rect.height
          ? {
              left: rect.left - 5,
              top: rect.top - 5,
              width: rect.width + 10,
              height: rect.height + 10,
            }
          : null
      )
    }
    const timer = requestAnimationFrame(measure)
    const mutations = new MutationObserver(measure)
    mutations.observe(document.body, { childList: true, subtree: true })
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)
    const observer = new ResizeObserver(measure)
    const target = document.querySelector(
      `[data-map-guide="${current.target}"]`
    )
    if (target) observer.observe(target)
    return () => {
      cancelAnimationFrame(timer)
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
      observer.disconnect()
      mutations.disconnect()
    }
  }, [current])
  return (
    <>
      {current && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-hidden="true"
              className="pointer-events-none fixed z-51 rounded-lg ring-2 ring-primary"
              style={
                frame
                  ? { ...frame, boxShadow: "0 0 0 100vmax rgb(0 0 0 / 0.55)" }
                  : { inset: 0, background: "rgb(0 0 0 / 0.55)" }
              }
            />,
            document.body
          )
        : null}
      <Dialog
        open={Boolean(current)}
        onOpenChange={(open) => {
          if (!open) onFinish()
        }}
      >
        <DialogContent
          showCloseButton={false}
          safeArea="custom"
          overlayClassName="bg-transparent backdrop-blur-none supports-backdrop-filter:backdrop-blur-none"
          className="inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-52 mx-auto max-h-[calc(100dvh-2rem)] max-w-sm overflow-y-auto border bg-popover shadow-xl"
          style={
            frame && frame.top < window.innerHeight / 2
              ? {
                  top: "auto",
                  bottom: "max(1rem, calc(env(safe-area-inset-bottom) + 1rem))",
                }
              : undefined
          }
        >
          <p className="text-xs text-muted-foreground">
            地图使用帮助 · {(step ?? 0) + 1} / {mapGuideSteps.length}
          </p>
          <DialogTitle>{current?.title}</DialogTitle>
          <DialogDescription>{current?.text}</DialogDescription>
          <div className="flex items-center justify-between gap-2">
            <Button className="min-h-11" variant="ghost" onClick={onFinish}>
              跳过
            </Button>
            <div className="flex gap-2">
              <Button
                className="min-h-11"
                variant="outline"
                disabled={step === 0}
                onClick={() => onStep((step ?? 1) - 1)}
              >
                上一步
              </Button>
              <Button
                className="min-h-11"
                onClick={() =>
                  step === mapGuideSteps.length - 1
                    ? onFinish()
                    : onStep((step ?? 0) + 1)
                }
              >
                {step === mapGuideSteps.length - 1 ? "开始使用" : "下一步"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
