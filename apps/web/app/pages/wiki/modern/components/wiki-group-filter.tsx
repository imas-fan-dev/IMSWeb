import { type ReactNode } from "react"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import type { WikiPublicCatalog } from "~/lib/api"

import { safeWikiColor } from "~/pages/wiki/wiki-model"

type PublicGroup = NonNullable<WikiPublicCatalog["selection"]>["groups"][number]

export function WikiGroupFilter({
  groups,
  ungroupedCount,
  action,
}: {
  groups: PublicGroup[]
  ungroupedCount: number
  action?: ReactNode
}) {
  return (
    <section
      className="sticky top-16 z-30 mt-4 border-y bg-background/95 backdrop-blur-sm md:mt-6"
      aria-label="组合与分类导航"
    >
      <div className="flex items-center gap-2 py-2 md:gap-3 md:py-3">
        <span className="hidden shrink-0 text-xs font-semibold text-muted-foreground sm:block">
          组合导航
        </span>
        <nav
          className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-x-contain pb-1 md:gap-2"
          aria-label="跳转到组合或分类"
        >
          {groups.map((group) => (
            <GroupLink
              key={group.id}
              color={group.color}
              label={group.name}
              href={`#wiki-group-${group.id}`}
            >
              <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background sm:size-6 md:size-7">
                <span
                  className="size-2 rounded-full sm:size-1.5 md:size-2"
                  style={{ backgroundColor: safeWikiColor(group.color) }}
                  aria-hidden="true"
                />
                {group.iconUrl ? (
                  <WikiTransformedImage
                    src={group.iconUrl}
                    alt=""
                    transform={group.imageTransform}
                    className="absolute inset-0 bg-background p-1"
                    onError={(event) => {
                      event.currentTarget.hidden = true
                    }}
                  />
                ) : null}
              </span>
            </GroupLink>
          ))}

          {ungroupedCount ? (
            <GroupLink
              color="#6b7280"
              label="未归档"
              href="#wiki-group-ungrouped"
            >
              <span
                className="size-2 shrink-0 rounded-full bg-muted-foreground sm:size-1.5 md:size-2"
                aria-hidden="true"
              />
            </GroupLink>
          ) : null}
        </nav>
        {action}
      </div>
    </section>
  )
}

function GroupLink({
  color,
  label,
  children,
  href,
}: {
  color: string
  label: string
  children: ReactNode
  href: string
}) {
  const accent = safeWikiColor(color)

  return (
    <a
      href={href}
      className={[
        "inline-flex shrink-0 items-center rounded-md border bg-background font-medium",
        "transition-colors hover:bg-muted",
        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "h-11 w-11 justify-center gap-0 px-0 text-xs",
        "sm:h-9 sm:w-auto sm:justify-start sm:gap-1.5 sm:px-2.5 sm:text-sm",
        "md:h-10 md:px-3",
      ].join(" ")}
      aria-label={label}
      style={{ borderColor: accent }}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </a>
  )
}
