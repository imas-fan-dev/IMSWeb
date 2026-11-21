import { HeartIcon } from "lucide-react"
import { createContext, useContext, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import { Button } from "~/components/ui/button"
import {
  isApiError,
  setFudabaCardInteraction,
  type FudabaCard,
  type FudabaCardInteractions,
} from "~/lib/api"
import { cn } from "~/lib/utils"

const InteractionContext = createContext<{
  values: Record<string, FudabaCardInteractions>
  update: (id: string, value: FudabaCardInteractions) => void
} | null>(null)

export function CardInteractionScope({ children }: { children: ReactNode }) {
  const parent = useContext(InteractionContext)
  const [values, setValues] = useState<Record<string, FudabaCardInteractions>>(
    {}
  )
  return (
    <InteractionContext
      value={
        parent ?? {
          values,
          update: (id, value) =>
            setValues((current) => ({ ...current, [id]: value })),
        }
      }
    >
      {children}
    </InteractionContext>
  )
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
  return [interactions.likes, interactions.viewerLiked].join(":")
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
  const shared = useContext(InteractionContext)
  const [local, setLocal] = useState(card.interactions)
  const sharedKey = `${card.id}:${serverState(card.interactions)}`
  const interactions = shared?.values[sharedKey] ?? local
  function setInteractions(value: FudabaCardInteractions) {
    setLocal(value)
    shared?.update(sharedKey, value)
  }
  const [pending, setPending] = useState(false)

  const interactive = platform.status === "authenticated"

  async function toggleLike() {
    if (pending) return
    const active = !interactions.viewerLiked
    const previous = interactions
    setInteractions({
      ...previous,
      likes: Math.max(0, previous.likes + (active ? 1 : -1)),
      viewerLiked: active,
    })
    setPending(true)
    try {
      const result = await setFudabaCardInteraction(
        card.id,
        "like",
        active
      ).send()
      setInteractions(result.interactions)
      onChange?.(result.interactions)
    } catch (error) {
      setInteractions(previous)
      toast.error(failureMessage(error))
    } finally {
      setPending(false)
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
        disabled={pending}
        aria-pressed={interactions.viewerLiked}
        aria-label={`${
          interactions.viewerLiked ? "取消点赞" : "点赞"
        }（${interactions.likes}）`}
        onClick={() => void toggleLike()}
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
    </span>
  )
}
