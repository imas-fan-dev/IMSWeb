import { BookmarkIcon, HeartIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import { Button } from "~/components/ui/button"
import {
  isApiError,
  setFudabaCardInteraction,
  type FudabaCard,
  type FudabaCardInteractionKind,
  type FudabaCardInteractions,
} from "~/lib/api"
import { cn } from "~/lib/utils"

const labels = {
  like: { active: "取消点赞", inactive: "点赞" },
  favorite: { active: "取消收藏", inactive: "收藏" },
} as const

function nextInteractions(
  current: FudabaCardInteractions,
  kind: FudabaCardInteractionKind,
  active: boolean
): FudabaCardInteractions {
  const delta = active ? 1 : -1
  return kind === "like"
    ? {
        ...current,
        likes: Math.max(0, current.likes + delta),
        viewerLiked: active,
      }
    : {
        ...current,
        favorites: Math.max(0, current.favorites + delta),
        viewerFavorited: active,
      }
}

function failureMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 401) return "登录状态已过期，请重新登录后再试。"
    if (error.status === 403) return "当前帐号状态无法进行互动。"
    if (error.status === 404) return "这张名片已下架。"
    if (error.status === 429) return "操作过于频繁，请稍后再试。"
  }
  return error instanceof Error ? error.message : "名片互动失败。"
}

interface CardInteractionBarProps {
  card: FudabaCard
  className?: string
  onChange?: (interactions: FudabaCardInteractions) => void
}

function serverState(interactions: FudabaCardInteractions): string {
  return [
    interactions.likes,
    interactions.favorites,
    interactions.viewerLiked,
    interactions.viewerFavorited,
  ].join(":")
}

/**
 * 本地乐观状态只在服务端计数变化时重置，因此用 key 重建内部组件，
 * 而不是在 effect 里把 props 同步回 state。
 */
export function CardInteractionBar(props: CardInteractionBarProps) {
  return (
    <InteractionControls
      key={serverState(props.card.interactions)}
      {...props}
    />
  )
}

function InteractionControls({
  card,
  className,
  onChange,
}: CardInteractionBarProps) {
  const platform = useOptionalPlatformSession()
  const [interactions, setInteractions] = useState(card.interactions)
  const [pending, setPending] = useState<FudabaCardInteractionKind | null>(null)

  const interactive = platform.status === "authenticated"

  async function toggle(kind: FudabaCardInteractionKind) {
    if (pending) return
    const active =
      kind === "like"
        ? !interactions.viewerLiked
        : !interactions.viewerFavorited
    const previous = interactions
    setInteractions(nextInteractions(previous, kind, active))
    setPending(kind)
    try {
      const result = await setFudabaCardInteraction(
        card.id,
        kind,
        active
      ).send()
      setInteractions(result.interactions)
      onChange?.(result.interactions)
    } catch (error) {
      setInteractions(previous)
      toast.error(failureMessage(error))
    } finally {
      setPending(null)
    }
  }

  if (!interactive) {
    return (
      <span
        className={cn(
          "flex items-center gap-3 text-xs text-muted-foreground",
          className
        )}
      >
        <span
          className="inline-flex items-center gap-1"
          aria-label={`${interactions.likes} 次点赞`}
        >
          <HeartIcon
            className={cn(
              "size-3.5",
              interactions.viewerLiked && "fill-current"
            )}
            aria-hidden="true"
          />
          {interactions.likes}
        </span>
        <span
          className="inline-flex items-center gap-1"
          aria-label={`${interactions.favorites} 次收藏`}
        >
          <BookmarkIcon
            className={cn(
              "size-3.5",
              interactions.viewerFavorited && "fill-current"
            )}
            aria-hidden="true"
          />
          {interactions.favorites}
        </span>
      </span>
    )
  }

  return (
    <span className={cn("flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-muted-foreground"
        disabled={pending !== null}
        aria-pressed={interactions.viewerLiked}
        aria-label={`${
          interactions.viewerLiked ? labels.like.active : labels.like.inactive
        }（${interactions.likes}）`}
        onClick={() => void toggle("like")}
      >
        <HeartIcon
          className={cn(
            "size-3.5",
            interactions.viewerLiked && "fill-current text-destructive"
          )}
          aria-hidden="true"
        />
        {interactions.likes}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-muted-foreground"
        disabled={pending !== null}
        aria-pressed={interactions.viewerFavorited}
        aria-label={`${
          interactions.viewerFavorited
            ? labels.favorite.active
            : labels.favorite.inactive
        }（${interactions.favorites}）`}
        onClick={() => void toggle("favorite")}
      >
        <BookmarkIcon
          className={cn(
            "size-3.5",
            interactions.viewerFavorited && "fill-current text-primary"
          )}
          aria-hidden="true"
        />
        {interactions.favorites}
      </Button>
    </span>
  )
}
