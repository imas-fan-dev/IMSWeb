/** Reserve essential rows and one reachable reading target before scrolling. */
export function expandedSearchMinimumHeight({
  surface,
  actions,
  gap,
  insets,
}: {
  surface: number
  actions: number
  gap: number
  insets: number
}): number {
  if (![surface, actions, gap, insets].every(Number.isFinite)) return 260
  return Math.max(
    260,
    Math.max(0, surface) +
      Math.max(44, actions) +
      Math.max(12, gap) +
      Math.max(0, insets) +
      44
  )
}
