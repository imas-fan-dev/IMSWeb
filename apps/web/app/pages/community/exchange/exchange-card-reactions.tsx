import { SmilePlusIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import {
  NAMECARD_REACTION_EMOJIS,
  isApiError,
  setFudabaCardReaction,
  type FudabaCardReaction,
  type NamecardReactionEmoji,
} from "~/lib/api"
import { cn } from "~/lib/utils"

function failureMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 404) return "名片已下架。"
    if (error.status === 400) return "表情不受支持。"
    if (error.status === 429) return "操作过于频繁，请稍后再试。"
  }
  return error instanceof Error ? error.message : "表情更新失败。"
}

function applyDelta(
  reactions: readonly FudabaCardReaction[],
  emoji: NamecardReactionEmoji,
  delta: 1 | -1
): FudabaCardReaction[] {
  const known = reactions.some((reaction) => reaction.emoji === emoji)
  const next = known
    ? reactions.map((reaction) =>
        reaction.emoji === emoji
          ? { ...reaction, count: Math.max(0, reaction.count + delta) }
          : reaction
      )
    : [...reactions, { emoji, count: Math.max(0, delta) }]
  return next
    .filter((reaction) => reaction.count > 0)
    .sort((left, right) => right.count - left.count)
}

interface CardReactionBarProps {
  cardId: string
  reactions: readonly FudabaCardReaction[]
  onChange?: (reactions: FudabaCardReaction[]) => void
  className?: string
}

// Reactions are anonymous counters shared with the compatibility namecard
// pages, so anyone can add one and there is no per-viewer state to track.
export function CardReactionBar({
  cardId,
  reactions,
  onChange,
  className,
}: CardReactionBarProps) {
  const [pending, setPending] = useState<NamecardReactionEmoji | null>(null)
  const [picking, setPicking] = useState(false)

  async function react(emoji: NamecardReactionEmoji, active: boolean) {
    if (pending) return
    setPending(emoji)
    const previous = reactions
    onChange?.(applyDelta(previous, emoji, active ? 1 : -1))
    try {
      const result = await setFudabaCardReaction(cardId, emoji, active).send()
      onChange?.([...result.reactions])
    } catch (caught) {
      onChange?.([...previous])
      toast.error(failureMessage(caught))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {reactions.map((reaction) => (
        <Button
          key={reaction.emoji}
          type="button"
          variant="outline"
          size="sm"
          disabled={pending !== null}
          aria-label={`${reaction.emoji} ${reaction.count} 次`}
          className="h-7 gap-1 rounded-full px-2 text-xs"
          onClick={() => void react(reaction.emoji, true)}
          onContextMenu={(event) => {
            event.preventDefault()
            void react(reaction.emoji, false)
          }}
        >
          <span aria-hidden="true">{reaction.emoji}</span>
          <span className="tabular-nums">{reaction.count}</span>
        </Button>
      ))}
      <Popover open={picking} onOpenChange={setPicking}>
        <PopoverTrigger
          type="button"
          disabled={pending !== null}
          aria-label="添加表情"
          className="inline-flex size-7 items-center justify-center rounded-full hover:bg-accent"
        >
          <SmilePlusIcon className="size-4" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <div className="grid grid-cols-8 gap-1">
            {NAMECARD_REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`用 ${emoji} 回应`}
                className="rounded-sm p-1 text-base hover:bg-accent"
                onClick={() => {
                  setPicking(false)
                  void react(emoji, true)
                }}
              >
                <span aria-hidden="true">{emoji}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
