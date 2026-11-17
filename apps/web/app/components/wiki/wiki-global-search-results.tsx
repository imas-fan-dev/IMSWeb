import { ArrowUpRightIcon } from "lucide-react"
import { type CSSProperties, useMemo } from "react"

import {
  wikiEntryKindLabel,
  wikiEntryKindOptions,
} from "~/components/wiki/wiki-entry-kind"
import type { WikiPublicSearchEntry } from "~/lib/api"
import { cn } from "~/lib/utils"
import { NavigationLink } from "~/components/navigation/navigation-link"

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN")
}

function entrySearchText(entry: WikiPublicSearchEntry) {
  return normalizeSearchText(
    [
      entry.name,
      entry.agencyName,
      entry.agencyCode,
      wikiEntryKindLabel(entry.entryKind, entry.entrySubtype),
    ].join(" ")
  )
}

export function WikiGlobalSearchResults({
  entries,
  query,
  view,
  className,
  onNavigate,
}: {
  entries: WikiPublicSearchEntry[]
  query: string
  view: "classic" | "modern"
  className?: string
  onNavigate?: () => void
}) {
  const normalizedQuery = normalizeSearchText(query)
  const matches = useMemo(() => {
    if (!normalizedQuery) return []
    return entries.filter((entry) =>
      entrySearchText(entry).includes(normalizedQuery)
    )
  }, [entries, normalizedQuery])

  if (!normalizedQuery) return null

  return (
    <nav
      aria-label="全局搜索结果"
      className={cn(
        "absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-xl",
        className
      )}
    >
      <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        {matches.length ? `${matches.length} 个匹配条目` : "没有匹配的全局条目"}
      </p>
      {matches.length ? (
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {matches.map((entry) => {
            const option =
              wikiEntryKindOptions.find(
                (candidate) => candidate.value === entry.entryKind
              ) ?? wikiEntryKindOptions[3]
            const Icon = option.icon
            const searchParams = new URLSearchParams({
              agency: entry.agencyName,
              idol: entry.name,
            })
            return (
              <li key={`${entry.agencyId}\u0000${entry.id}`}>
                <NavigationLink
                  to={`${import.meta.env.VITE_IMS_APP_TARGET === "app" || view === "modern" ? "/story" : "/story/classic"}?${searchParams}`}
                  className="group/result grid min-h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-sm px-3 py-2 hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={`跳转到 ${entry.name} · ${entry.agencyName}`}
                  onClick={onNavigate}
                >
                  <span
                    className="grid size-8 place-items-center rounded-full border bg-background"
                    style={
                      {
                        "--wiki-search-agency": entry.agencyColor,
                        borderColor: "var(--wiki-search-agency)",
                      } as CSSProperties
                    }
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-medium">
                      {entry.name}
                    </strong>
                    <small className="block truncate text-xs text-muted-foreground">
                      {entry.agencyName} ·{" "}
                      {wikiEntryKindLabel(entry.entryKind, entry.entrySubtype)}
                    </small>
                  </span>
                  <ArrowUpRightIcon
                    className="size-4 text-muted-foreground group-hover/result:text-foreground"
                    aria-hidden="true"
                  />
                </NavigationLink>
              </li>
            )
          })}
        </ul>
      ) : null}
    </nav>
  )
}
