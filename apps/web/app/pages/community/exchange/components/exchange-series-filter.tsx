import { useState } from "react"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { Button } from "~/components/ui/button"
import type { FudabaSeries } from "~/lib/api"
import { cn } from "~/lib/utils"

interface ExchangeSeriesFilterProps {
  series: readonly FudabaSeries[]
  selectedCodes: readonly string[]
  onToggle: (seriesCode: string) => void
  className?: string
}

function SeriesTagIcon({ series }: { series: FudabaSeries }) {
  return (
    <StatefulSeriesTagIcon
      key={`${series.code}:${series.iconUrl ?? ""}`}
      series={series}
    />
  )
}

function StatefulSeriesTagIcon({ series }: { series: FudabaSeries }) {
  const [failed, setFailed] = useState(false)
  const showIcon = Boolean(series.iconUrl) && !failed

  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-sm",
        showIcon && "border bg-background p-0.5"
      )}
      style={{
        backgroundColor: showIcon ? undefined : series.color,
        borderColor: showIcon ? series.color : undefined,
      }}
      aria-hidden="true"
    >
      {showIcon ? (
        <WikiTransformedImage
          src={series.iconUrl ?? undefined}
          alt=""
          transform={series.imageTransform}
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  )
}

export function ExchangeSeriesFilter({
  series,
  selectedCodes,
  onToggle,
  className,
}: ExchangeSeriesFilterProps) {
  const selected = new Set(selectedCodes)

  return (
    <div
      className={cn("grid grid-cols-2 gap-1", className)}
      role="group"
      aria-label="企划标签"
    >
      {series.map((item) => {
        const active = selected.has(item.code)
        return (
          <Button
            key={item.code}
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 min-w-0 justify-start gap-2 rounded-sm px-2 text-xs",
              active &&
                "border border-primary/25 bg-primary/10 hover:bg-primary/15"
            )}
            aria-pressed={active}
            onClick={() => onToggle(item.code)}
          >
            <SeriesTagIcon series={item} />
            <span className="min-w-0 flex-1 truncate text-left">
              {item.displayName}
            </span>
            <span className="text-[0.6875rem] text-muted-foreground">
              {item.activeOfficeCount}
            </span>
          </Button>
        )
      })}
    </div>
  )
}
