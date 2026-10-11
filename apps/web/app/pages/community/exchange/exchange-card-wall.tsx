import {
  BringToFrontIcon,
  GripIcon,
  LoaderCircleIcon,
  Repeat2Icon,
  RotateCcwIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"

import { CoverImagePreview } from "~/components/shared/cover-image-preview"
import { SeriesAccentStrip } from "~/components/shared/series-accent-strip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Button } from "~/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import type { FudabaCardPlacement, FudabaPlacedCard } from "~/lib/api"
import { cn } from "~/lib/utils"
import { WallViewport, type WallBounds, type WallFocus } from "./wall-viewport"

export type WallPlacement = Pick<
  FudabaCardPlacement,
  "x" | "y" | "rotation" | "zIndex"
>

type PlacementCommit = (
  cardId: string,
  previous: FudabaCardPlacement,
  placement: WallPlacement
) => void

interface PlacedCardWallProps {
  cards: FudabaPlacedCard[]
  focus?: WallFocus | null
  total?: number
  maxZIndex?: number
  onRegionChange?: (bounds: WallBounds) => void
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
  pendingCardIds?: ReadonlySet<string>
  onPlacementPreview?: (cardId: string, placement: WallPlacement) => void
  onPlacementCommit?: PlacementCommit
  onRemove?: (card: FudabaPlacedCard) => void
}

interface WallCardProps {
  scale: number
  card: FudabaPlacedCard
  editing: boolean
  flipped: boolean
  pending: boolean
  selected: boolean
  onFlip: () => void
  onSelect: () => void
  onActivate: () => boolean
  onPlacementPreview?: PlacedCardWallProps["onPlacementPreview"]
  onPlacementCommit?: PlacementCommit
}

interface DragStart {
  pointerId: number
  clientX: number
  clientY: number
  placement: FudabaCardPlacement
  latest: WallPlacement
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function roundedCoordinate(value: number) {
  return Math.round(clamp(value, -1_000_000, 1_000_000) * 10) / 10
}

function placementFields(placement: FudabaCardPlacement): WallPlacement {
  return {
    x: placement.x,
    y: placement.y,
    rotation: placement.rotation,
    zIndex: placement.zIndex,
  }
}

function samePlacement(left: WallPlacement, right: WallPlacement) {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.rotation === right.rotation &&
    left.zIndex === right.zIndex
  )
}

function compareCardStacking(left: FudabaPlacedCard, right: FudabaPlacedCard) {
  const zIndexDifference = left.placement.zIndex - right.placement.zIndex
  if (zIndexDifference !== 0) return zIndexDifference

  const updatedAtDifference =
    Date.parse(left.placement.updatedAt) - Date.parse(right.placement.updatedAt)
  if (updatedAtDifference !== 0) return updatedAtDifference

  return left.id.localeCompare(right.id)
}

function IconTooltip({
  label,
  children,
}: {
  label: string
  children: React.ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function WallCard({
  scale,
  card,
  editing,
  flipped,
  pending,
  selected,
  onFlip,
  onSelect,
  onActivate,
  onPlacementPreview,
  onPlacementCommit,
}: WallCardProps) {
  const dragStart = useRef<DragStart | null>(null)
  const suppressPreview = useRef(false)
  const cardElement = useRef<HTMLDivElement | null>(null)
  const canMove = editing && card.viewerOwned && !pending

  useEffect(() => {
    if (!canMove) {
      dragStart.current = null
      if (cardElement.current) {
        cardElement.current.style.left = String(card.placement.x) + "px"
        cardElement.current.style.top = String(card.placement.y) + "px"
        cardElement.current.dataset.placementX = String(card.placement.x)
        cardElement.current.dataset.placementY = String(card.placement.y)
      }
    }
  }, [canMove, card.placement.x, card.placement.y])

  function preview(placement: WallPlacement) {
    onPlacementPreview?.(card.id, placement)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!canMove || event.button !== 0) return
    suppressPreview.current = false
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const placement = card.placement
    dragStart.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      placement,
      latest: placementFields(placement),
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = dragStart.current
    if (!start || start.pointerId !== event.pointerId) return
    const next = {
      ...start.latest,
      x: roundedCoordinate(
        start.placement.x + (event.clientX - start.clientX) / scale
      ),
      y: roundedCoordinate(
        start.placement.y + (event.clientY - start.clientY) / scale
      ),
    }
    start.latest = next
    if (cardElement.current) {
      cardElement.current.style.left = `${next.x}px`
      cardElement.current.style.top = `${next.y}px`
      cardElement.current.dataset.placementX = String(next.x)
      cardElement.current.dataset.placementY = String(next.y)
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = dragStart.current
    if (!start || start.pointerId !== event.pointerId) return
    dragStart.current = null
    onSelect()
    if (!samePlacement(placementFields(start.placement), start.latest)) {
      suppressPreview.current = true
      preview(start.latest)
      onPlacementCommit?.(card.id, start.placement, start.latest)
    }
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = dragStart.current
    if (!start || start.pointerId !== event.pointerId) return
    dragStart.current = null
    suppressPreview.current = true
    const previous = placementFields(start.placement)
    if (cardElement.current) {
      cardElement.current.style.left = `${previous.x}px`
      cardElement.current.style.top = `${previous.y}px`
      cardElement.current.dataset.placementX = String(previous.x)
      cardElement.current.dataset.placementY = String(previous.y)
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && dragStart.current) {
      dragStart.current = null
      suppressPreview.current = true
      if (cardElement.current) {
        cardElement.current.style.left = String(card.placement.x) + "px"
        cardElement.current.style.top = String(card.placement.y) + "px"
        cardElement.current.dataset.placementX = String(card.placement.x)
        cardElement.current.dataset.placementY = String(card.placement.y)
      }
      return
    }
    if (!canMove) return
    const step = event.shiftKey ? 80 : 16
    const movement = {
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
    }[event.key]
    if (!movement) return
    event.preventDefault()
    onSelect()
    const previous = card.placement
    const next = {
      ...placementFields(previous),
      x: roundedCoordinate(previous.x + movement[0]),
      y: roundedCoordinate(previous.y + movement[1]),
    }
    if (samePlacement(placementFields(previous), next)) return
    preview(next)
    onPlacementCommit?.(card.id, previous, next)
  }

  const side = flipped ? "背面" : "正面"

  return (
    <div
      ref={cardElement}
      className={cn(
        "absolute w-60",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
      data-card-id={card.id}
      data-placement-x={card.placement.x}
      data-placement-y={card.placement.y}
      style={{
        left: `${card.placement.x}px`,
        top: `${card.placement.y}px`,
        zIndex: card.placement.zIndex,
        transform: `translate(-50%, -50%) rotate(${card.placement.rotation}deg)`,
      }}
    >
      <CoverImagePreview
        src={flipped ? card.backImageUrl : card.frontImageUrl}
        alt={`${card.displayName}${side}`}
        previewLabel="名片"
        className={cn(
          "aspect-3/2 w-full border bg-card shadow-sm",
          selected && canMove && "cursor-grab touch-none active:cursor-grabbing"
        )}
        imageClassName="object-contain"
        imageDraggable={false}
        onPreviewRequest={() => {
          if (suppressPreview.current) {
            suppressPreview.current = false
            return false
          }
          return onActivate()
        }}
        triggerProps={{
          title: selected ? "查看大图" : "选中名片",
          onPointerDown: (event) => {
            suppressPreview.current = false
            if (selected) handlePointerDown(event)
          },
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerUp,
          onPointerCancel: handlePointerCancel,
          onLostPointerCapture: handlePointerCancel,
          onKeyDown: handleKeyDown,
        }}
      />
      <IconTooltip label={flipped ? "翻到正面" : "翻到背面"}>
        <Button
          type="button"
          variant="secondary"
          size="icon-xs"
          className="absolute right-1.5 bottom-1.5 shadow-sm"
          aria-label={`${card.displayName}${flipped ? "翻到正面" : "翻到背面"}`}
          onClick={onFlip}
        >
          <Repeat2Icon aria-hidden="true" />
        </Button>
      </IconTooltip>
      {editing && card.viewerOwned ? (
        <IconTooltip label="移动名片">
          <Button
            type="button"
            variant={selected ? "default" : "outline"}
            size="icon-sm"
            className={cn(
              "absolute -top-3 -left-3 touch-none shadow-sm",
              canMove && "cursor-grab active:cursor-grabbing"
            )}
            style={{
              transform: `scale(${1 / scale})`,
              transformOrigin: "center",
            }}
            aria-label={`移动${card.displayName}`}
            aria-pressed={selected}
            disabled={pending}
            onFocus={onSelect}
            onKeyDown={handleKeyDown}
            onLostPointerCapture={handlePointerCancel}
            onPointerCancel={handlePointerCancel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {pending ? (
              <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
            ) : (
              <GripIcon aria-hidden="true" />
            )}
          </Button>
        </IconTooltip>
      ) : null}
    </div>
  )
}

export function PlacedCardWall({
  cards,
  focus,
  total = cards.length,
  maxZIndex = 0,
  onRegionChange,
  editing = false,
  onEditingChange,
  pendingCardIds = new Set<string>(),
  onPlacementPreview,
  onPlacementCommit,
  onRemove,
}: PlacedCardWallProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previousEditing, setPreviousEditing] = useState(editing)
  if (editing !== previousEditing) {
    setPreviousEditing(editing)
    if (!editing) setSelectedId(null)
  }
  const [flippedIds, setFlippedIds] = useState(() => new Set<string>())
  const [removeOpen, setRemoveOpen] = useState(false)

  const ownedCards = useMemo(
    () => cards.filter((card) => card.viewerOwned),
    [cards]
  )
  const orderedCards = useMemo(
    () => [...cards].sort(compareCardStacking),
    [cards]
  )
  const activeCard =
    cards.find((card) => card.id === selectedId) ??
    (editing ? (ownedCards[0] ?? null) : null)
  const selectedCard = editing ? activeCard : null
  const selectedPending = selectedCard
    ? pendingCardIds.has(selectedCard.id)
    : false
  const selectedReadOnly = !selectedCard?.viewerOwned
  const maximumZIndex = Math.max(
    maxZIndex,
    ...cards.map((card) => card.placement.zIndex)
  )
  const selectedIsFrontmost =
    selectedCard !== null &&
    selectedCard.placement.zIndex === maximumZIndex &&
    orderedCards.at(-1)?.id === selectedCard.id

  function flip(cardId: string) {
    setFlippedIds((current) => {
      const next = new Set(current)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  function commitSelected(patch: Partial<WallPlacement>) {
    if (!selectedCard || selectedReadOnly || selectedPending) return
    const previous = selectedCard.placement
    const next = { ...placementFields(previous), ...patch }
    if (samePlacement(placementFields(previous), next)) return
    onPlacementPreview?.(selectedCard.id, next)
    onPlacementCommit?.(selectedCard.id, previous, next)
  }

  function bringSelectedToFront() {
    if (
      !selectedCard ||
      selectedReadOnly ||
      selectedPending ||
      selectedIsFrontmost
    )
      return
    const previous = selectedCard.placement
    const next = {
      ...placementFields(previous),
      zIndex: 2_147_483_000,
    }
    if (!samePlacement(placementFields(previous), next)) {
      onPlacementPreview?.(selectedCard.id, next)
    }
    onPlacementCommit?.(selectedCard.id, previous, next)
  }

  return (
    <TooltipProvider>
      <div
        className="relative space-y-3"
        aria-label="名片墙"
        aria-busy={pendingCardIds.size > 0}
      >
        <SeriesAccentStrip className="h-1" />

        {editing ? (
          <div
            role="toolbar"
            aria-label="名片墙编辑工具"
            className={cn(
              "flex flex-wrap items-center gap-1 border bg-background px-1.5 py-1"
            )}
          >
            <span className="max-w-28 truncate px-1 text-xs font-medium sm:max-w-48">
              {selectedCard?.displayName ?? "选择名片"}
            </span>
            <IconTooltip label="向左旋转">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="向左旋转名片"
                disabled={!selectedCard || selectedReadOnly || selectedPending}
                onClick={() =>
                  commitSelected({
                    rotation: clamp(
                      (selectedCard?.placement.rotation ?? 0) - 2,
                      -12,
                      12
                    ),
                  })
                }
              >
                <RotateCcwIcon aria-hidden="true" />
              </Button>
            </IconTooltip>
            <IconTooltip label="向右旋转">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="向右旋转名片"
                disabled={!selectedCard || selectedReadOnly || selectedPending}
                onClick={() =>
                  commitSelected({
                    rotation: clamp(
                      (selectedCard?.placement.rotation ?? 0) + 2,
                      -12,
                      12
                    ),
                  })
                }
              >
                <RotateCwIcon aria-hidden="true" />
              </Button>
            </IconTooltip>
            <IconTooltip label="移到最前">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="将名片移到最前"
                disabled={
                  !selectedCard ||
                  selectedReadOnly ||
                  selectedPending ||
                  selectedIsFrontmost
                }
                onClick={bringSelectedToFront}
              >
                <BringToFrontIcon aria-hidden="true" />
              </Button>
            </IconTooltip>
            <IconTooltip label="翻转名片">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="翻转选中名片"
                disabled={!selectedCard}
                onClick={() => {
                  if (selectedCard) flip(selectedCard.id)
                }}
              >
                <Repeat2Icon aria-hidden="true" />
              </Button>
            </IconTooltip>
            <IconTooltip label="移除名片">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive"
                aria-label="从名片墙移除"
                disabled={!selectedCard || selectedReadOnly || selectedPending}
                onClick={() => setRemoveOpen(true)}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </IconTooltip>
          </div>
        ) : null}

        <WallViewport
          editing={editing}
          focus={focus}
          onRegionChange={onRegionChange}
        >
          {(camera, interaction) => (
            <>
              {orderedCards.length ? (
                orderedCards.map((card) => (
                  <WallCard
                    key={card.id}
                    scale={camera.scale}
                    card={card}
                    editing={editing}
                    flipped={flippedIds.has(card.id)}
                    pending={pendingCardIds.has(card.id)}
                    selected={activeCard?.id === card.id}
                    onFlip={() => flip(card.id)}
                    onSelect={() => setSelectedId(card.id)}
                    onActivate={() => {
                      if (!interaction.wasSelected) return false
                      if (selectedId !== card.id) {
                        setSelectedId(card.id)
                        onEditingChange?.(true)
                        return false
                      }
                      return true
                    }}
                    onPlacementPreview={onPlacementPreview}
                    onPlacementCommit={onPlacementCommit}
                  />
                ))
              ) : (
                <p
                  className="absolute w-80 -translate-x-1/2 text-center text-sm text-muted-foreground"
                  style={{ left: camera.x, top: camera.y }}
                >
                  当前区域暂无名片，可平移或切换列表。
                </p>
              )}
            </>
          )}
        </WallViewport>
        <p className="text-xs text-muted-foreground">
          {total} 张公开名片 · 当前显示 {cards.length} 张
        </p>
      </div>

      <AlertDialog open={editing && removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="text-destructive">
              <Trash2Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>从名片墙移除？</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCard
                ? `“${selectedCard.displayName}”会从当前事务所移除，名片本身仍会保留。`
                : "名片会从当前事务所移除，名片本身仍会保留。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={selectedPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!selectedCard || selectedReadOnly || selectedPending}
              onClick={() => {
                if (!selectedCard || selectedReadOnly) return
                setRemoveOpen(false)
                onRemove?.(selectedCard)
              }}
            >
              移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
