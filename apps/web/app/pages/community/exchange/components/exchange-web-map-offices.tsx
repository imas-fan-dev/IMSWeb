import {
  Building2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  MapPinIcon,
} from "lucide-react"
import { useId, useLayoutEffect, useRef, useState } from "react"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { Button } from "~/components/ui/button"
import type { FudabaMapOffice, FudabaSeries } from "~/lib/api"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: readonly FudabaMapOffice[]
  series: readonly FudabaSeries[]
  hasResult: boolean
  truncated: boolean
  error: string | null
  onSelect: (office: FudabaMapOffice) => void
  onOpenDirectory: () => void
  onRetry: () => void
}

export function ExchangeWebMapOffices({
  open,
  onOpenChange,
  items,
  series,
  hasResult,
  truncated,
  error,
  onSelect,
  onOpenDirectory,
  onRetry,
}: Props) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const title = useRef<HTMLSpanElement>(null)
  const [collapsedWidth, setCollapsedWidth] = useState<number>()
  useLayoutEffect(() => {
    const button = trigger.current
    const label = title.current
    if (!button || !label) return
    const measure = () => {
      const style = getComputedStyle(button)
      const icons = [...button.querySelectorAll("svg")]
      const width =
        label.getBoundingClientRect().width +
        icons.reduce(
          (sum, icon) => sum + icon.getBoundingClientRect().width,
          0
        ) +
        parseFloat(style.columnGap || "0") * 2 +
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight) +
        2
      if (width > 2) setCollapsedWidth(Math.ceil(width))
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(label)
    return () => observer.disconnect()
  }, [])
  return (
    <aside
      className="exchange-web-map-count"
      style={
        collapsedWidth
          ? { width: open ? undefined : collapsedWidth }
          : undefined
      }
      data-open={open}
      data-map-point-count
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault()
          event.stopPropagation()
          onOpenChange(false)
          trigger.current?.focus()
        }
      }}
    >
      <Button
        ref={trigger}
        type="button"
        variant="ghost"
        className="exchange-web-office-trigger"
        aria-label="范围内事务所列表"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          if (open) trigger.current?.focus({ preventScroll: true })
          onOpenChange(!open)
        }}
      >
        <Building2Icon className="size-4 text-primary" aria-hidden="true" />
        <span
          ref={title}
          className="shrink-0 whitespace-nowrap"
          aria-live="polite"
        >
          范围内{" "}
          <output aria-label="当前范围事务所数量" data-map-office-count>
            {hasResult ? items.length : "—"}
          </output>
          {truncated ? "+" : ""} 个事务所
        </span>
        <ChevronDownIcon
          className="size-3.5 transition-transform motion-reduce:transition-none"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
          aria-hidden="true"
        />
      </Button>
      <div
        className="exchange-web-office-reveal"
        data-open={open}
        inert={!open || undefined}
        aria-hidden={!open || undefined}
      >
        <div className="exchange-web-office-clip">
          <section
            id={id}
            aria-label="当前范围事务所列表"
            className="exchange-web-office-panel"
          >
            <h2 className="sr-only">范围内事务所</h2>
            <div className="exchange-web-office-scroll">
              {error ? (
                <div
                  role="status"
                  className="space-y-2 border-b p-4 text-sm text-muted-foreground"
                >
                  <p>地图数据更新失败，已保留上次成功结果。</p>
                  <Button size="sm" variant="outline" onClick={onRetry}>
                    重试
                  </Button>
                </div>
              ) : null}
              {items.length ? (
                <ul className="divide-y">
                  {items.map((office) => (
                    <li key={office.id}>
                      <NavigationLink
                        to={`/community/exchange/offices/${encodeURIComponent(office.slug)}`}
                        className="group flex min-w-0 items-start gap-3 p-4 outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                        onClick={(event) => {
                          if (
                            event.button !== 0 ||
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey
                          )
                            return
                          event.preventDefault()
                          onSelect(office)
                        }}
                      >
                        <span
                          className="mt-1 h-10 w-1 shrink-0 rounded-full"
                          style={{ backgroundColor: office.accent }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <strong className="line-clamp-2 text-sm/6 font-semibold wrap-break-word">
                            {office.name}
                          </strong>
                          <span className="mt-1 flex gap-1 text-xs/5 text-muted-foreground">
                            <MapPinIcon
                              className="mt-1 size-3 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="line-clamp-2 wrap-break-word">
                              {office.address || office.city}
                            </span>
                          </span>
                          <span className="mt-2 block truncate text-xs text-muted-foreground">
                            {office.seriesCodes
                              .map(
                                (code) =>
                                  series.find((item) => item.code === code)
                                    ?.displayName ?? code
                              )
                              .join(" / ") || "综合企划"}
                          </span>
                        </span>
                        <ChevronRightIcon
                          className="mt-2 size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </NavigationLink>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-6 text-sm/6 text-muted-foreground">
                  {hasResult
                    ? "当前范围内暂无事务所，可移动地图或调整筛选。"
                    : "正在获取当前范围事务所。"}
                </p>
              )}
              {truncated ? (
                <p className="px-4 pb-3 text-xs/5 text-muted-foreground">
                  结果较多，请放大地图或收窄筛选。
                </p>
              ) : null}
            </div>
            <div className="border-t p-2">
              <Button
                className="w-full"
                variant="ghost"
                onClick={onOpenDirectory}
              >
                查看完整名录
              </Button>
            </div>
          </section>
        </div>
      </div>
    </aside>
  )
}
