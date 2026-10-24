import { cn } from "~/lib/utils"

/**
 * The members a unit contributes, on one truncated line with the full roster in
 * the tooltip.
 *
 * An earlier version swapped in 「第一名等N名偶像」 once the column got narrow,
 * but a two-member unit's shorthand can be *longer* than listing both names,
 * and the column has no fixed width, so no text-length heuristic holds. One
 * clipped line keeps every row the same height and never misleads.
 *
 * The caller owns the typography.
 */
export function UnitMemberSummary({
  names,
  className,
}: {
  names: string[]
  className?: string
}) {
  if (!names.length) return null
  const full = names.join("、")
  return (
    <span className={cn("block min-w-0 truncate", className)} title={full}>
      {full}
    </span>
  )
}
