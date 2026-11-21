import { cn } from "~/lib/utils"

/**
 * Generic tag facet bar for document-authored cards.
 *
 * Options come from `document.availableTags` (the compiler aggregates card
 * `tags` in document order), so a page never hardcodes cast or event names.
 */
export function WikiDocumentTagFilter({
  tags,
  selected,
  onToggle,
  onClear,
}: {
  tags: readonly string[]
  selected: readonly string[]
  onToggle: (tag: string) => void
  onClear: () => void
}) {
  return (
    <section className="mb-4 rounded-lg border bg-muted/30 px-3 py-2">
      <div
        role="group"
        aria-label="按标签筛选"
        className="flex flex-wrap items-center gap-2"
      >
        <span className="text-xs font-semibold text-muted-foreground">
          标签
        </span>
        {tags.map((tag) => {
          const active = selected.includes(tag)
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(tag)}
              className={cn(
                "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background text-foreground hover:bg-muted"
              )}
            >
              {tag}
            </button>
          )
        })}
        {selected.length ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-primary hover:underline"
          >
            清除筛选
          </button>
        ) : null}
      </div>
    </section>
  )
}
