import { useLayoutEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog"
import { useMapGuideLayout } from "../hooks/use-map-guide-layout"
import "./exchange-map-onboarding.css"

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
    text: "选择城市和喜欢的作品，也可以只看正在开放交换的事务所。",
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
  const content = useRef<HTMLDivElement>(null)
  const actions = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const layout = useMapGuideLayout(step, current?.target, content, actions)
  useLayoutEffect(() => {
    if (body.current) {
      body.current.scrollTop = 0
      if (body.current.parentElement?.dataset.scrollWhole === "true") {
        body.current.parentElement.scrollTop = 0
      }
    }
  }, [step])
  const frame = layout?.spotlight
  return (
    <>
      {current && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-hidden="true"
              className="exchange-map-guide-spotlight pointer-events-none fixed z-51 rounded-lg"
              data-guide-spotlight
              data-target-visible={Boolean(frame)}
              data-guide-motion={layout?.animate ?? false}
              data-guide-compact={layout?.compact ?? true}
              style={
                frame
                  ? {
                      transform: `translate3d(${frame.x}px, ${frame.y}px, 0)`,
                      width: frame.width,
                      height: frame.height,
                      boxShadow: "0 0 0 100vmax rgb(0 0 0 / 0.55)",
                    }
                  : {
                      transform: "translate3d(0, 0, 0)",
                      width: 0,
                      height: 0,
                      boxShadow: "0 0 0 100vmax rgb(0 0 0 / 0.55)",
                    }
              }
            />,
            document.body
          )
        : null}
      <Dialog
        open={Boolean(current)}
        onOpenChange={(open, details) => {
          if (!open) details.cancel()
        }}
      >
        <DialogContent
          showCloseButton={false}
          safeArea="custom"
          overlayClassName="bg-transparent backdrop-blur-none supports-backdrop-filter:backdrop-blur-none"
          className="exchange-map-guide-card z-52 flex max-w-none flex-col gap-0 overflow-hidden border bg-popover p-0 shadow-xl"
          data-guide-card
          data-guide-step={layout?.step}
          data-ready={Boolean(layout)}
          data-guide-motion={layout?.animate ?? false}
          data-guide-compact={layout?.compact ?? true}
          data-placement={layout?.placement ?? "center"}
          data-scroll-whole={layout?.scrollWholeCard ?? false}
          style={
            layout
              ? {
                  transform: `translate3d(${layout.card.x}px, ${layout.card.y}px, 0)`,
                  width: layout.card.width,
                  height: layout.card.height,
                }
              : { width: "min(24rem, calc(100vw - 2rem))" }
          }
        >
          <div
            ref={body}
            className="exchange-map-guide-body"
            role="region"
            tabIndex={layout?.scrollContent ? 0 : undefined}
            aria-label="引导说明"
          >
            <div ref={content} className="flex flex-col gap-3 p-4">
              <p className="text-xs text-muted-foreground">
                地图使用帮助 · {(step ?? 0) + 1} / {mapGuideSteps.length}
              </p>
              <DialogTitle>{current?.title}</DialogTitle>
              <DialogDescription>{current?.text}</DialogDescription>
            </div>
          </div>
          <div
            ref={actions}
            className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 pb-4"
          >
            <Button className="min-h-11" variant="ghost" onClick={onFinish}>
              跳过
            </Button>
            <div className="flex min-w-0 flex-wrap justify-end gap-2">
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
