import { useMemo, useState, useSyncExternalStore } from "react"
import type { FudabaWallLayoutItem } from "@imsweb/contracts/fudaba/messages"
import { Button } from "~/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"

function subscribe(callback: () => void) {
  const query = window.matchMedia("(max-width: 767px)")
  query.addEventListener("change", callback)
  return () => query.removeEventListener("change", callback)
}
const mobileSnapshot = () => window.matchMedia("(max-width: 767px)").matches

type CardLayout = Extract<FudabaWallLayoutItem, { kind: "card" }>
export function LocateMyCards({
  items,
  ready,
  onLocate,
}: {
  items: FudabaWallLayoutItem[]
  ready: boolean
  onLocate: (item: CardLayout) => void
}) {
  const mobile = useSyncExternalStore(subscribe, mobileSnapshot, () => false)
  const cards = useMemo(
    () =>
      items
        .filter(
          (item): item is CardLayout => item.kind === "card" && item.viewerOwned
        )
        .sort(
          (a, b) =>
            a.placement.pinnedAt.localeCompare(b.placement.pinnedAt) ||
            a.id.localeCompare(b.id)
        ),
    [items]
  )
  const [last, setLast] = useState<{ id: string; pinnedAt: string } | null>(
    null
  )
  const [open, setOpen] = useState(false)
  const [empty, setEmpty] = useState(false)
  const current = cards.findIndex((card) => card.id === last?.id)
  function locate(card: CardLayout) {
    onLocate(card)
    setLast({ id: card.id, pinnedAt: card.placement.pinnedAt })
    setOpen(false)
    setEmpty(false)
  }
  function cycle() {
    if (!cards.length) {
      setEmpty(true)
      return
    }
    const next = !last
      ? 0
      : current >= 0
        ? (current + 1) % cards.length
        : cards.findIndex(
            (card) =>
              card.placement.pinnedAt > last.pinnedAt ||
              (card.placement.pinnedAt === last.pinnedAt && card.id > last.id)
          )
    locate(cards[next < 0 ? 0 : next])
  }
  const label = !ready
    ? "正在准备定位…"
    : mobile && current >= 0
      ? `定位我的名片 · ${current + 1}/${cards.length}`
      : "定位我的名片"
  return (
    <div className="flex flex-col gap-1">
      {mobile ? (
        <Button variant="outline" disabled={!ready} onClick={cycle}>
          {label}
        </Button>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button variant="outline" disabled={!ready}>
                {label}
              </Button>
            }
          />
          <PopoverContent
            align="start"
            className="max-h-80 w-72 overflow-y-auto p-1"
            aria-label="选择要定位的名片"
          >
            {cards.length ? (
              cards.map((card) => (
                <button
                  type="button"
                  key={card.id}
                  className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => locate(card)}
                >
                  <span className="h-9 w-14 shrink-0 overflow-hidden rounded bg-muted">
                    {card.preview ? (
                      <img
                        src={card.preview}
                        alt=""
                        className="size-full object-contain"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {card.displayName}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {new Date(card.placement.pinnedAt).toLocaleDateString(
                        "zh-CN"
                      )}{" "}
                      · 贴到墙上
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <p className="p-3 text-sm text-muted-foreground">
                当前墙上还没有我的名片。
              </p>
            )}
          </PopoverContent>
        </Popover>
      )}
      {empty ? (
        <span role="status" className="text-xs text-muted-foreground">
          当前墙上还没有我的名片。
        </span>
      ) : null}
    </div>
  )
}
