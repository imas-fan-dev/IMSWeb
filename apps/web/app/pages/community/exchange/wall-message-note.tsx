import {
  useWallItemInteraction,
  WallMoveHandle,
} from "./wall-item-interactions"
import { type ReactNode, useEffect, useRef, useState } from "react"
import type { FudabaCardPlacement, FudabaPublicMessage } from "~/lib/api"
import { cn } from "~/lib/utils"
import type { WallPlacement } from "./components/exchange-card-wall"

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
const paperTexture =
  "repeating-linear-gradient(17deg,transparent 0 5px,#806d4420 5px 6px)"
export const liftedPaperShadow =
  "drop-shadow(0 18px 26px #00000040) drop-shadow(0 3px 5px #00000020)"

const tornEdge =
  "polygon(0 0,100% 0,100% 97%,96% 99%,92% 96%,88% 100%,84% 97%,80% 99%,76% 96%,72% 100%,68% 97%,64% 99%,60% 96%,56% 100%,52% 97%,48% 99%,44% 96%,40% 100%,36% 97%,32% 99%,28% 96%,24% 100%,20% 97%,16% 99%,12% 96%,8% 100%,4% 97%,0 99%)"
/** The reading surface keeps the torn paper behind independently scrollable content. */
export function MessagePaperSurface({
  color,
  children,
  className,
}: {
  color: FudabaPublicMessage["color"]
  children: ReactNode
  className?: string
}) {
  return (
    <div
      data-lifted-note="true"
      className={cn("relative isolate flex min-h-0 flex-col", className)}
      style={{ filter: liftedPaperShadow }}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 rounded-xs",
          noteColors.find((choice) => choice.value === color)?.paper
        )}
        style={{ clipPath: tornEdge, backgroundImage: paperTexture }}
      />
      <div className="relative flex min-h-0 flex-1 flex-col px-6 pt-9 pb-8 text-slate-800 dark:text-slate-100">
        {children}
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-2 left-7 h-7 w-20 -rotate-7 border border-amber-700/10 bg-amber-200/70 shadow-sm dark:bg-amber-300/40"
        style={{ clipPath: "polygon(1% 7%,98% 0,100% 95%,3% 100%)" }}
      />
    </div>
  )
}

export function MessagePaper({
  message,
  measurement = false,
  editor,
  lifted = false,
}: {
  message: Pick<
    FudabaPublicMessage,
    "content" | "color" | "authorName" | "createdAt"
  >
  measurement?: boolean
  editor?: ReactNode
  lifted?: boolean
}) {
  const copy = useRef<HTMLParagraphElement>(null)
  const [overflow, setOverflow] = useState(false)
  useEffect(() => {
    if (measurement) return
    const element = copy.current
    if (!element) return
    const measure = () =>
      setOverflow(element.scrollHeight > element.clientHeight + 1)
    measure()
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    observer?.observe(element)
    window.addEventListener("resize", measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [message.content, measurement])
  return (
    <>
      <div
        className={cn(
          "flex flex-col rounded-xs px-5.5 pt-7.75 pb-7.5",
          measurement ? "relative w-60.5" : "absolute inset-0",
          noteColors.find((color) => color.value === message.color)?.paper
        )}
        style={{
          clipPath: tornEdge,
          backgroundImage: paperTexture,
        }}
      >
        {editor ? (
          <div className="relative min-h-0 flex-1">
            <p
              ref={copy}
              aria-hidden="true"
              className="pointer-events-none invisible absolute inset-0 overflow-hidden text-[15px] leading-[1.75] wrap-break-word whitespace-pre-wrap"
            >
              {message.content}
            </p>
            {editor}
          </div>
        ) : (
          <p
            ref={copy}
            className={cn(
              "text-[15px] leading-[1.75] wrap-break-word whitespace-pre-wrap",
              !measurement && "min-h-0 flex-1 overflow-hidden"
            )}
          >
            {message.content}
          </p>
        )}
        {!measurement && overflow ? (
          <span className="mt-1 shrink-0 text-xs">查看全文</span>
        ) : null}
        <div className="mt-auto flex shrink-0 items-center justify-between gap-2 pt-3 text-[11px]">
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
        className={cn(
          "pointer-events-none absolute -top-1.5 left-4.75 h-6.75 w-19.5 -rotate-10 border border-amber-700/10 bg-amber-200/65 dark:bg-amber-300/35",
          lifted && "-top-2 left-6 -rotate-7 shadow-sm"
        )}
      />
    </>
  )
}

export function WallMessageNote({
  message,
  height = 277,
  scale,
  selected,
  editing,
  pending,
  onSelect,
  onActivate,
  onRead,
  onCommit,
}: {
  message: FudabaPublicMessage
  height?: number
  scale: number
  selected: boolean
  editing: boolean
  pending: boolean
  onSelect: () => void
  onActivate: () => boolean
  onRead: () => void
  onCommit: (
    message: FudabaPublicMessage,
    previous: FudabaCardPlacement,
    placement: WallPlacement
  ) => void
}) {
  const placement = message.placement
  const canMove = editing && message.capabilities.canMove && !pending
  const { elementRef, triggerProps, handleProps, requestActivation } =
    useWallItemInteraction({
      placement,
      scale,
      canMove,
      selected,
      onSelect,
      onActivate,
      onCommit: (previous, next) => onCommit(message, previous, next),
    })
  return (
    <div
      ref={elementRef}
      data-message-id={message.id}
      data-placement-x={placement.x}
      data-placement-y={placement.y}
      className={cn(
        "absolute w-60.5",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
      style={{
        height,
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
          "absolute inset-0 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          selected && canMove && "cursor-grab touch-none active:cursor-grabbing"
        )}
        aria-label={`留言：${message.authorName}`}
        aria-pressed={selected}
        title={selected ? "查看全文" : "选中留言"}
        {...triggerProps}
        onClick={() => {
          if (requestActivation()) onRead()
        }}
      >
        <MessagePaper message={message} />
      </button>
      {editing && message.capabilities.canMove ? (
        <WallMoveHandle
          label="移动留言"
          selected={selected}
          pending={pending}
          scale={scale}
          canMove={canMove}
          onSelect={onSelect}
          handlers={handleProps}
        />
      ) : null}
    </div>
  )
}
