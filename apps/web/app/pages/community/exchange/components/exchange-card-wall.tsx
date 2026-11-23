import type { FudabaWallLayoutItem } from "@imsweb/contracts/fudaba/messages"
import { WallObjectPlaceholder } from "../wall-object-placeholder"
import { wallLayoutIntersects } from "../wall-scene-layout"
import { useWallImage } from "../use-wall-image"
import {
  useWallItemInteraction,
  WallMoveHandle,
} from "../wall-item-interactions"
import { WallMessageNote } from "../wall-message-note"
import type { FudabaPublicMessage } from "~/lib/api"
import {
  BringToFrontIcon,
  Repeat2Icon,
  RotateCcwIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react"
import { useMemo, useState } from "react"

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
import { WallViewport, type WallBounds, type WallFocus } from "../wall-viewport"
import { ExchangeCardPreviewActions } from "./exchange-card-preview-actions"
import { cardLabel } from "./card-label"

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
  loadError?: string | null
  onRetryLoad?: () => void
  layoutItems?: FudabaWallLayoutItem[]
  layoutBounds?: WallBounds
  messages?: FudabaPublicMessage[]
  canArrangeWall?: boolean
  focusedMessageId?: string | null
  pendingMessageIds?: ReadonlySet<string>
  onReadMessage?: (message: FudabaPublicMessage) => void
  onMessagePlacementCommit?: (
    message: FudabaPublicMessage,
    previous: FudabaCardPlacement,
    placement: WallPlacement
  ) => void

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
  layout?: Extract<FudabaWallLayoutItem, { kind: "card" }>
  canArrangeWall?: boolean
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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
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
  layout,
  canArrangeWall = false,
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
  const canMove = editing && (card.viewerOwned || canArrangeWall) && !pending
  const { elementRef, triggerProps, handleProps, requestActivation } =
    useWallItemInteraction({
      placement: card.placement,
      scale,
      canMove,
      selected,
      onSelect,
      onActivate,
      onPreview: (placement) => onPlacementPreview?.(card.id, placement),
      onCommit: (previous, placement) =>
        onPlacementCommit?.(card.id, previous, placement),
    })

  const originalImageSource =
    (flipped ? card.backImageUrl : card.frontImageUrl) ?? card.frontImageUrl
  const imageSource = (() => {
    if (!layout?.assetVersion || /^(data:|blob:)/.test(originalImageSource))
      return originalImageSource
    const hashAt = originalImageSource.indexOf("#")
    const path =
      hashAt < 0 ? originalImageSource : originalImageSource.slice(0, hashAt)
    const hash = hashAt < 0 ? "" : originalImageSource.slice(hashAt)
    return `${path}${path.includes("?") ? "&" : "?"}wall_asset=${encodeURIComponent(layout.assetVersion)}${hash}`
  })()
  const image = useWallImage(imageSource, elementRef)
  const side = flipped ? "背面" : "正面"

  return (
    <div
      ref={elementRef}
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
        src={imageSource}
        alt={`${cardLabel(card)}${side}`}
        previewLabel="名片"
        className={cn(
          "aspect-3/2 w-full border bg-card shadow-sm",
          selected && canMove && "cursor-grab touch-none active:cursor-grabbing"
        )}
        imageClassName={cn(
          "object-contain transition-opacity motion-reduce:transition-none",
          !image.ready && "opacity-0"
        )}
        imageDraggable={false}
        onPreviewRequest={requestActivation}
        triggerProps={{
          ...triggerProps,
          title: selected ? "查看大图" : "选中名片",
        }}
        previewActions={<ExchangeCardPreviewActions card={card} />}
      />
      {!image.ready ? (
        <div
          className="pointer-events-none absolute inset-0"
          data-wall-image-loading={card.id}
        >
          <WallObjectPlaceholder
            item={{
              kind: "card",
              id: card.id,
              displayName: cardLabel(card),
              viewerOwned: card.viewerOwned,
              width: 240,
              height: 160,
              layoutVersion: 1,
              preview:
                (flipped ? layout?.backPreview : layout?.preview) ?? null,
              assetVersion: layout?.assetVersion ?? imageSource,
              placement: {
                ...card.placement,
                x: 120,
                y: 80,
                rotation: 0,
                zIndex: 0,
              },
            }}
          />
        </div>
      ) : null}
      {image.error ? (
        <Button
          type="button"
          size="sm"
          className="absolute top-1/2 left-1/2 -translate-1/2"
          onClick={image.retry}
        >
          重试图片
        </Button>
      ) : null}
      <IconTooltip label={flipped ? "翻到正面" : "翻到背面"}>
        <Button
          type="button"
          variant="secondary"
          size="icon-xs"
          className="absolute right-1.5 bottom-1.5 shadow-sm"
          aria-label={`${cardLabel(card)}${flipped ? "翻到正面" : "翻到背面"}`}
          onClick={onFlip}
        >
          <Repeat2Icon aria-hidden="true" />
        </Button>
      </IconTooltip>
      {editing && (card.viewerOwned || canArrangeWall) ? (
        <WallMoveHandle
          label={`移动${cardLabel(card)}`}
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

export function PlacedCardWall({
  loadError,
  onRetryLoad,
  layoutItems = [],
  layoutBounds,
  messages = [],
  canArrangeWall = false,
  focusedMessageId,
  pendingMessageIds = new Set<string>(),
  onReadMessage,
  onMessagePlacementCommit,
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
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    focusedMessageId ?? null
  )
  const [selectedId, setSelectedId] = useState<string | null>(
    focus?.cardId ?? null
  )
  const [previousFocusKey, setPreviousFocusKey] = useState(focus?.key)
  if (focus?.key !== previousFocusKey) {
    setPreviousFocusKey(focus?.key)
    if (focus?.cardId) {
      setSelectedId(focus.cardId)
      setSelectedMessageId(null)
    }
  }

  const [previousFocusedMessageId, setPreviousFocusedMessageId] =
    useState(focusedMessageId)
  if (focusedMessageId !== previousFocusedMessageId) {
    setPreviousFocusedMessageId(focusedMessageId)
    if (focusedMessageId) {
      setSelectedMessageId(focusedMessageId)
      setSelectedId(null)
    }
  }
  const [previousEditing, setPreviousEditing] = useState(editing)
  if (editing !== previousEditing) {
    setPreviousEditing(editing)
    if (!editing) {
      setSelectedId(null)
      setSelectedMessageId(null)
    }
  }
  const [flippedIds, setFlippedIds] = useState(() => new Set<string>())
  const [removeOpen, setRemoveOpen] = useState(false)

  const ownedCards = useMemo(
    () => cards.filter((card) => card.viewerOwned || canArrangeWall),
    [cards, canArrangeWall]
  )
  const orderedCards = useMemo(
    () => [...cards].sort(compareCardStacking),
    [cards]
  )
  const activeCard = selectedMessageId
    ? null
    : (cards.find((card) => card.id === selectedId) ??
      (editing ? (ownedCards[0] ?? null) : null))
  const selectedCard = editing ? activeCard : null
  const selectedMessage = editing
    ? (messages.find((message) => message.id === selectedMessageId) ?? null)
    : null
  const selectedPlacement =
    selectedMessage?.placement ?? selectedCard?.placement
  const selectedPending = selectedMessage
    ? pendingMessageIds.has(selectedMessage.id)
    : selectedCard
      ? pendingCardIds.has(selectedCard.id)
      : false
  const selectedReadOnly = selectedMessage
    ? !selectedMessage.capabilities.canMove
    : !(selectedCard?.viewerOwned || canArrangeWall)
  const maximumZIndex = Math.max(
    maxZIndex,
    ...cards.map((card) => card.placement.zIndex),
    ...messages.map((message) => message.placement.zIndex)
  )
  const selectedIsFrontmost =
    selectedPlacement?.zIndex === maximumZIndex &&
    (selectedMessage
      ? !cards.some((card) => card.placement.zIndex === maximumZIndex) &&
        !messages.some(
          (message) =>
            message.id !== selectedMessage.id &&
            message.placement.zIndex === maximumZIndex
        )
      : orderedCards.at(-1)?.id === selectedCard?.id &&
        !messages.some((message) => message.placement.zIndex === maximumZIndex))
  const selectedKind = selectedMessage ? "留言" : "名片"

  function flip(cardId: string) {
    setFlippedIds((current) => {
      const next = new Set(current)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  function commitSelected(patch: Partial<WallPlacement>) {
    if (!selectedPlacement || selectedReadOnly || selectedPending) return
    const next = { ...placementFields(selectedPlacement), ...patch }
    if (samePlacement(placementFields(selectedPlacement), next)) return
    if (selectedMessage) {
      onMessagePlacementCommit?.(selectedMessage, selectedPlacement, next)
    } else if (selectedCard) {
      onPlacementPreview?.(selectedCard.id, next)
      onPlacementCommit?.(selectedCard.id, selectedPlacement, next)
    }
  }

  function bringSelectedToFront() {
    if (selectedIsFrontmost) return
    commitSelected({
      zIndex: selectedMessage ? maximumZIndex + 1 : 2_147_483_000,
    })
  }

  return (
    <TooltipProvider>
      <div
        className="relative space-y-3"
        aria-label="名片墙"
        aria-busy={pendingCardIds.size > 0 || pendingMessageIds.size > 0}
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
              {selectedMessage?.authorName ??
                (selectedCard ? cardLabel(selectedCard) : "选择名片或留言")}
            </span>
            <IconTooltip label="向左旋转">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`向左旋转${selectedKind}`}
                disabled={
                  !selectedPlacement || selectedReadOnly || selectedPending
                }
                onClick={() =>
                  commitSelected({
                    rotation: clamp(
                      (selectedPlacement?.rotation ?? 0) - 2,
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
                aria-label={`向右旋转${selectedKind}`}
                disabled={
                  !selectedPlacement || selectedReadOnly || selectedPending
                }
                onClick={() =>
                  commitSelected({
                    rotation: clamp(
                      (selectedPlacement?.rotation ?? 0) + 2,
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
                aria-label={`将${selectedKind}移到最前`}
                disabled={
                  !selectedPlacement ||
                  selectedReadOnly ||
                  selectedPending ||
                  selectedIsFrontmost
                }
                onClick={bringSelectedToFront}
              >
                <BringToFrontIcon aria-hidden="true" />
              </Button>
            </IconTooltip>
            {selectedMessage ? null : (
              <>
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
                    disabled={
                      !selectedCard || selectedReadOnly || selectedPending
                    }
                    onClick={() => setRemoveOpen(true)}
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                </IconTooltip>
              </>
            )}
          </div>
        ) : null}

        <WallViewport
          editing={editing}
          focus={focus}
          onRegionChange={onRegionChange}
        >
          {(camera) => (
            <>
              {orderedCards.length ||
              messages.length ||
              layoutItems.some(
                (item) =>
                  !layoutBounds || wallLayoutIntersects(item, layoutBounds)
              ) ? (
                <>
                  {" "}
                  {layoutItems
                    .filter(
                      (item) =>
                        (!layoutBounds ||
                          wallLayoutIntersects(item, layoutBounds)) &&
                        (item.kind === "card"
                          ? !cards.some((card) => card.id === item.id)
                          : !messages.some((message) => message.id === item.id))
                    )
                    .map((item) => (
                      <WallObjectPlaceholder
                        error={loadError}
                        onRetry={onRetryLoad}
                        key={`${item.kind}:${item.id}`}
                        item={item}
                      />
                    ))}
                  {orderedCards.map((card) => (
                    <WallCard
                      key={card.id}
                      scale={camera.scale}
                      layout={layoutItems.find(
                        (
                          item
                        ): item is Extract<
                          FudabaWallLayoutItem,
                          { kind: "card" }
                        > => item.kind === "card" && item.id === card.id
                      )}
                      card={card}
                      canArrangeWall={canArrangeWall}
                      editing={editing}
                      flipped={flippedIds.has(card.id)}
                      pending={pendingCardIds.has(card.id)}
                      selected={activeCard?.id === card.id}
                      onFlip={() => flip(card.id)}
                      onSelect={() => {
                        setSelectedMessageId(null)
                        setSelectedId(card.id)
                      }}
                      onActivate={() => {
                        if (selectedId !== card.id) {
                          setSelectedMessageId(null)
                          setSelectedId(card.id)
                          onEditingChange?.(true)
                          return false
                        }
                        return true
                      }}
                      onPlacementPreview={onPlacementPreview}
                      onPlacementCommit={onPlacementCommit}
                    />
                  ))}{" "}
                  {messages.map((message) => (
                    <WallMessageNote
                      key={"message:" + message.id}
                      height={
                        layoutItems.find(
                          (item) =>
                            item.kind === "message" && item.id === message.id
                        )?.height ?? 277
                      }
                      message={message}
                      scale={camera.scale}
                      selected={selectedMessageId === message.id}
                      editing={editing}
                      pending={pendingMessageIds.has(message.id)}
                      onSelect={() => {
                        setSelectedMessageId(message.id)
                        setSelectedId(null)
                        if (message.capabilities.canMove)
                          onEditingChange?.(true)
                      }}
                      onActivate={() => {
                        if (selectedMessageId !== message.id) {
                          setSelectedMessageId(message.id)
                          setSelectedId(null)
                          onEditingChange?.(true)
                          return false
                        }
                        return true
                      }}
                      onRead={() => onReadMessage?.(message)}
                      onCommit={(message, previous, placement) =>
                        onMessagePlacementCommit?.(message, previous, placement)
                      }
                    />
                  ))}
                </>
              ) : (
                <p
                  className="absolute w-80 -translate-x-1/2 text-center text-sm text-muted-foreground"
                  style={{ left: camera.x, top: camera.y }}
                >
                  当前区域暂无名片或留言，可平移或切换列表。
                </p>
              )}
            </>
          )}
        </WallViewport>
        <p className="text-xs text-muted-foreground">
          {total} 个公开物件 · 当前显示 {cards.length} 张名片、{messages.length}{" "}
          条留言
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
                ? `“${cardLabel(selectedCard)}”会从当前事务所移除，名片本身仍会保留。`
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
