import {
  BringToFrontIcon,
  GripIcon,
  RotateCcwIcon,
  RotateCwIcon,
} from "lucide-react"
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react"
import { Button } from "~/components/ui/button"
import type { FudabaCardPlacement, FudabaPublicMessage } from "~/lib/api"
import { cn } from "~/lib/utils"
import type { WallPlacement } from "./exchange-card-wall"

export const noteColors = [
  {
    value: "cream",
    name: "奶油黄",
    paper: "bg-[#fff0be] text-[#514322] dark:bg-[#4b422a] dark:text-[#f9edc8]",
    swatch: "bg-[#f0da96]",
  },
  {
    value: "rose",
    name: "樱花粉",
    paper: "bg-[#f8dddd] text-[#59373b] dark:bg-[#4c3337] dark:text-[#f4dedf]",
    swatch: "bg-[#e9bebe]",
  },
  {
    value: "mint",
    name: "鼠尾草绿",
    paper: "bg-[#deebd4] text-[#3d5133] dark:bg-[#344530] dark:text-[#e2efd8]",
    swatch: "bg-[#bfd2aa]",
  },
  {
    value: "blue",
    name: "雾蓝",
    paper: "bg-[#dae9ef] text-[#344e5a] dark:bg-[#30434b] dark:text-[#daecf2]",
    swatch: "bg-[#bad2df]",
  },
  {
    value: "lavender",
    name: "浅紫",
    paper: "bg-[#e8dff3] text-[#51405f] dark:bg-[#403449] dark:text-[#e9dff5]",
    swatch: "bg-[#d0bfe3]",
  },
] as const
const tornEdge =
  "polygon(0 0,100% 0,100% 97%,96% 99%,92% 96%,88% 100%,84% 97%,80% 99%,76% 96%,72% 100%,68% 97%,64% 99%,60% 96%,56% 100%,52% 97%,48% 99%,44% 96%,40% 100%,36% 97%,32% 99%,28% 96%,24% 100%,20% 97%,16% 99%,12% 96%,8% 100%,4% 97%,0 99%)"
export function MessagePaper({
  message,
}: {
  message: Pick<
    FudabaPublicMessage,
    "content" | "color" | "authorName" | "createdAt"
  >
}) {
  const copy = useRef<HTMLParagraphElement>(null)
  const [overflow, setOverflow] = useState(false)
  useEffect(() => {
    const measure = () => {
      if (copy.current)
        setOverflow(copy.current.scrollHeight > copy.current.clientHeight + 1)
    }
    measure()
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    if (copy.current) observer?.observe(copy.current)
    window.addEventListener("resize", measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [message.content])
  return (
    <>
      <div
        className={cn(
          "absolute inset-0 flex flex-col rounded-xs px-5.5 pt-7.75 pb-7.5",
          noteColors.find((color) => color.value === message.color)?.paper
        )}
        style={{
          clipPath: tornEdge,
          backgroundImage:
            "repeating-linear-gradient(17deg,transparent 0 5px,#806d4420 5px 6px)",
        }}
      >
        <p
          ref={copy}
          className="line-clamp-5 text-[15px] leading-[1.75] wrap-break-word whitespace-pre-wrap"
        >
          {message.content}
        </p>
        {overflow ? <span className="mt-1 text-xs">查看全文</span> : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px]">
          <span className="truncate">{message.authorName}</span>
          <time className="shrink-0" dateTime={message.createdAt}>
            {new Date(message.createdAt).toLocaleDateString("zh-CN", {
              month: "numeric",
              day: "numeric",
            })}
          </time>
        </div>
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-1.5 left-4.75 h-6.75 w-19.5 -rotate-10 border border-amber-700/10 bg-amber-200/65 dark:bg-amber-300/35"
      />
    </>
  )
}
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
function fields(placement: FudabaCardPlacement): WallPlacement {
  return {
    x: placement.x,
    y: placement.y,
    rotation: placement.rotation,
    zIndex: placement.zIndex,
  }
}
export function WallMessageNote({
  message,
  scale,
  selected,
  editing,
  pending,
  onSelect,
  onRead,
  onCommit,
}: {
  message: FudabaPublicMessage
  scale: number
  selected: boolean
  editing: boolean
  pending: boolean
  onSelect: () => void
  onRead: () => void
  onCommit: (
    message: FudabaPublicMessage,
    previous: FudabaCardPlacement,
    placement: WallPlacement
  ) => void
}) {
  const element = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    id: number
    x: number
    y: number
    placement: FudabaCardPlacement
    latest: WallPlacement
    moved: boolean
  } | null>(null)
  const suppressClick = useRef(false)
  const canMove = editing && message.capabilities.canMove && !pending
  const placement = message.placement
  useEffect(() => {
    if (!canMove) drag.current = null
    if (element.current) {
      element.current.style.left = `${placement.x}px`
      element.current.style.top = `${placement.y}px`
    }
  }, [canMove, placement.x, placement.y])
  function down(event: PointerEvent<HTMLButtonElement>) {
    if (!selected || !canMove || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    suppressClick.current = false
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      placement,
      latest: fields(placement),
      moved: false,
    }
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current
    if (!start || start.id !== event.pointerId) return
    if (
      Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4 &&
      !start.moved
    )
      return
    start.moved = true
    start.latest = {
      ...start.latest,
      x:
        Math.round(
          clamp(
            start.placement.x + (event.clientX - start.x) / scale,
            -1_000_000,
            1_000_000
          ) * 10
        ) / 10,
      y:
        Math.round(
          clamp(
            start.placement.y + (event.clientY - start.y) / scale,
            -1_000_000,
            1_000_000
          ) * 10
        ) / 10,
    }
    if (element.current) {
      element.current.style.left = `${start.latest.x}px`
      element.current.style.top = `${start.latest.y}px`
    }
  }
  function up(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current
    if (!start || start.id !== event.pointerId) return
    drag.current = null
    if (start.moved) {
      suppressClick.current = true
      onCommit(message, start.placement, start.latest)
    }
  }
  function cancel() {
    if (!drag.current) return
    drag.current = null
    suppressClick.current = true
    if (element.current) {
      element.current.style.left = `${placement.x}px`
      element.current.style.top = `${placement.y}px`
    }
  }
  function key(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      cancel()
      return
    }
    if (!canMove) return
    const step = event.shiftKey ? 80 : 16
    const offset = (
      {
        ArrowDown: [0, step],
        ArrowUp: [0, -step],
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
      } as Record<string, number[]>
    )[event.key]
    if (!offset) return
    event.preventDefault()
    onSelect()
    onCommit(message, placement, {
      ...fields(placement),
      x: clamp(placement.x + offset[0], -1_000_000, 1_000_000),
      y: clamp(placement.y + offset[1], -1_000_000, 1_000_000),
    })
  }
  return (
    <div
      ref={element}
      data-message-id={message.id}
      data-placement-x={placement.x}
      data-placement-y={placement.y}
      className={cn(
        "absolute h-69.25 w-60.5",
        selected && "ring-2 ring-primary ring-offset-4 ring-offset-background"
      )}
      style={{
        left: placement.x,
        top: placement.y,
        zIndex: placement.zIndex,
        transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
        filter: "drop-shadow(2px 5px 4px #00000025)",
      }}
    >
      <button
        type="button"
        className={cn(
          "absolute inset-0 text-left",
          selected && canMove && "cursor-grab touch-none active:cursor-grabbing"
        )}
        aria-label={`留言：${message.authorName}`}
        aria-pressed={selected}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onKeyDown={key}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          if (selected) onRead()
          else onSelect()
        }}
      >
        <MessagePaper message={message} />
      </button>
      {selected && canMove ? (
        <div
          className="absolute -top-14 left-0 flex gap-1 rounded border bg-background p-1"
          role="toolbar"
          aria-label="留言摆放工具"
          style={{
            transform: `scale(${1 / scale})`,
            transformOrigin: "bottom left",
          }}
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 touch-none"
            aria-label="移动留言"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={cancel}
            onLostPointerCapture={cancel}
            onKeyDown={key}
          >
            <GripIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            aria-label="向左旋转留言"
            onClick={() =>
              onCommit(message, placement, {
                ...fields(placement),
                rotation: clamp(placement.rotation - 2, -12, 12),
              })
            }
          >
            <RotateCcwIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            aria-label="向右旋转留言"
            onClick={() =>
              onCommit(message, placement, {
                ...fields(placement),
                rotation: clamp(placement.rotation + 2, -12, 12),
              })
            }
          >
            <RotateCwIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            aria-label="将留言移到最前"
            onClick={() =>
              onCommit(message, placement, {
                ...fields(placement),
                zIndex: 2_147_483_000,
              })
            }
          >
            <BringToFrontIcon aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  )
}
