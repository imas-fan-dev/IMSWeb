import type { ComponentPropsWithoutRef } from "react"

import { cn } from "~/lib/utils"
import { seriesWallItems } from "~/lib/series-wall"

type SeriesAccentStripProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> & {
  orientation?: "horizontal" | "vertical"
}

export function SeriesAccentStrip({
  className,
  orientation = "horizontal",
  ...props
}: SeriesAccentStripProps) {
  return (
    <div
      {...props}
      className={cn(
        "grid",
        orientation === "horizontal" ? "grid-cols-6" : "grid-rows-6",
        className
      )}
      data-orientation={orientation}
      aria-hidden="true"
    >
      {seriesWallItems.map((series) => (
        <span
          key={series.name}
          className={series.background}
          data-series-accent={series.name}
        />
      ))}
    </div>
  )
}
