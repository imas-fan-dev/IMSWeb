import type { WorkspaceSearchTabs } from "../hooks/use-map-workspace-search"

export function ExchangeSearchTabs({ tabs }: { tabs: WorkspaceSearchTabs }) {
  return (
    <div
      role="tablist"
      aria-label="搜索类型"
      className="flex gap-1 border-b px-4 py-2"
    >
      {(
        [
          ["offices", "事务所"],
          ["places", "地点"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={tabs.active === value}
          id={tabs.panelId ? `${tabs.panelId}-${value}` : undefined}
          aria-controls={tabs.panelId}
          tabIndex={tabs.active === value ? 0 : -1}
          className="min-h-11 flex-1 rounded-md px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-selected:bg-primary/10 aria-selected:text-primary"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return
            event.preventDefault()
            const next =
              event.key === "Home"
                ? "offices"
                : event.key === "End"
                  ? "places"
                  : value === "offices"
                    ? "places"
                    : "offices"
            tabs.onChange(next)
            const buttons =
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                '[role="tab"]'
              )
            buttons?.[next === "offices" ? 0 : 1]?.focus()
          }}
          onClick={() => tabs.onChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
