import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  EraserIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"
import { Separator } from "~/components/ui/separator"
import { cn } from "~/lib/utils"
import { TIER_COLOR_PRESETS, type Tier } from "../tier-list-model"
import type { TierListActions } from "../hooks/use-tier-list-state"

export function TierLabelEditor({
  tier,
  canMoveUp,
  canMoveDown,
  actions,
}: {
  tier: Tier
  canMoveUp: boolean
  canMoveDown: boolean
  actions: TierListActions
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`编辑 ${tier.label} 层级`}
            className="flex min-h-24 w-20 shrink-0 flex-col items-center justify-center gap-2 rounded-lg px-1 text-white shadow-sm transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:w-24"
            style={{ backgroundColor: tier.color }}
            data-testid="tier-label"
          >
            <span className="max-w-full px-1 text-center text-xl/tight font-bold wrap-break-word whitespace-normal drop-shadow-sm sm:text-2xl">
              {tier.label || "—"}
            </span>
            <PencilIcon aria-hidden="true" className="size-4 opacity-80" />
          </button>
        }
      />
      <PopoverContent
        align="start"
        side="right"
        sideOffset={8}
        className="w-72"
      >
        <PopoverTitle className="mb-3">编辑层级</PopoverTitle>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            名称
          </span>
          <Input
            value={tier.label}
            onChange={(event) =>
              actions.renameTier(tier.id, event.target.value)
            }
            placeholder="层级名称"
          />
        </label>

        <div
          role="radiogroup"
          aria-label="层级颜色"
          className="mb-3 grid grid-cols-7 gap-1.5"
        >
          {TIER_COLOR_PRESETS.map((color) => {
            const selected = tier.color.toLowerCase() === color
            return (
              <button
                key={color}
                type="button"
                aria-label={`使用颜色 ${color}`}
                aria-pressed={selected}
                onClick={() => actions.setTierColor(tier.id, color)}
                className={cn(
                  "flex size-6 items-center justify-center rounded-md transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  selected && "ring-2 ring-foreground ring-offset-1"
                )}
                style={{ backgroundColor: color }}
              >
                {selected ? (
                  <CheckIcon
                    aria-hidden="true"
                    className="size-3 text-white drop-shadow-sm"
                  />
                ) : null}
              </button>
            )
          })}
        </div>

        <label className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="color"
            value={tier.color}
            onChange={(event) =>
              actions.setTierColor(tier.id, event.target.value)
            }
            aria-label="自定义颜色"
            className="size-6 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
          />
          自定义颜色
        </label>

        <Separator className="mb-2" />

        <div className="mb-2 grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canMoveUp}
            onClick={() => actions.moveTier(tier.id, -1)}
          >
            <ArrowUpIcon aria-hidden="true" className="size-3.5" />
            上移
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canMoveDown}
            onClick={() => actions.moveTier(tier.id, 1)}
          >
            <ArrowDownIcon aria-hidden="true" className="size-3.5" />
            下移
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              actions.clearTier(tier.id)
              setOpen(false)
            }}
          >
            <EraserIcon aria-hidden="true" className="size-3.5" />
            清空
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => {
              actions.removeTier(tier.id)
              setOpen(false)
            }}
          >
            <Trash2Icon aria-hidden="true" className="size-3.5" />
            删除
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
