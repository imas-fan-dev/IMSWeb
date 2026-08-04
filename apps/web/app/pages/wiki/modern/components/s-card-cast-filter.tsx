import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  UsersRoundIcon,
} from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import { cn } from "~/lib/utils"
import {
  GAKUMAS_S_CARD_ALL_CAST,
  GAKUMAS_S_CARD_CAST_OPTIONS,
  type GakumasSCardCastFilter,
} from "~/pages/wiki/gakumas-s-card-cast-model"

interface SCardCastFilterProps {
  selectedCast: GakumasSCardCastFilter
  expanded: boolean
  onSelectCast: (cast: GakumasSCardCastFilter) => void
  onExpandedChange: (expanded: boolean) => void
}

export function SCardCastFilter({
  selectedCast,
  expanded,
  onSelectCast,
  onExpandedChange,
}: SCardCastFilterProps) {
  return (
    <section
      aria-labelledby="s-card-cast-filter-title"
      className="border-b bg-card"
      data-temporary-compatibility="subtitle-cast-filter"
    >
      <Collapsible open={expanded} onOpenChange={onExpandedChange}>
        <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <UsersRoundIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-primary"
                />
                <h2
                  id="s-card-cast-filter-title"
                  className="text-sm font-semibold"
                >
                  按登场人物筛选
                </h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                根据现有 S 卡剧情元数据临时筛选
              </p>
            </div>
            <CollapsibleTrigger
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              aria-label={expanded ? "收起登场人物筛选" : "展开登场人物筛选"}
            >
              {expanded ? "收起" : "展开"}
              {expanded ? (
                <ChevronUpIcon aria-hidden="true" className="size-4" />
              ) : (
                <ChevronDownIcon aria-hidden="true" className="size-4" />
              )}
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent>
            <div
              role="group"
              aria-label="按登场人物筛选"
              className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:flex-wrap"
            >
              <CastFilterButton
                label="全部显示"
                active={selectedCast === GAKUMAS_S_CARD_ALL_CAST}
                onClick={() => onSelectCast(GAKUMAS_S_CARD_ALL_CAST)}
              />
              {GAKUMAS_S_CARD_CAST_OPTIONS.map((option) => (
                <CastFilterButton
                  key={option.value}
                  label={option.label}
                  active={selectedCast === option.value}
                  onClick={() => onSelectCast(option.value)}
                />
              ))}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </section>
  )
}

interface CastFilterButtonProps {
  label: string
  active: boolean
  onClick: () => void
}

function CastFilterButton({ label, active, onClick }: CastFilterButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-foreground hover:bg-muted"
      )}
      onClick={onClick}
    >
      {active ? <CheckIcon aria-hidden="true" className="size-3.5" /> : null}
      {label}
    </button>
  )
}
