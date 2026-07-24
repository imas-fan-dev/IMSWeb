import { ArrowUpRightIcon } from "lucide-react"
import { Link } from "react-router"

import type { WikiPublicIdol } from "~/shared/api"

import { groupWikiIdols } from "../wiki-groups"
import { safeWikiColor } from "../wiki-model"

export function WikiIdolGrid({
  agency,
  idols,
}: {
  agency: string
  idols: WikiPublicIdol[]
}) {
  const groups = groupWikiIdols(agency, idols)

  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section
          key={group.key}
          aria-labelledby={`wiki-group-${group.key}`}
          style={{ contentVisibility: "auto", containIntrinsicSize: "640px" }}
        >
          <div className="mb-4 flex items-center justify-between gap-4 border-b pb-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="h-8 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: safeWikiColor(group.color) }}
                aria-hidden="true"
              />
              {group.iconUrl ? (
                <img
                  src={group.iconUrl}
                  alt=""
                  className="size-7 shrink-0 object-contain"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.hidden = true
                  }}
                />
              ) : null}
              <h3
                id={`wiki-group-${group.key}`}
                className="text-lg font-semibold break-words"
              >
                {group.name}
              </h3>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {group.idols.length} 位角色
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {group.idols.map((idol) => (
              <Link
                key={idol.id}
                to={`/story?agency=${encodeURIComponent(agency)}&idol=${encodeURIComponent(idol.name)}`}
                className="group overflow-hidden rounded-lg border bg-card shadow-xs transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                style={{ borderTopColor: safeWikiColor(idol.color) }}
              >
                <div className="aspect-[4/5] overflow-hidden bg-muted">
                  <img
                    src={idol.imageUrl}
                    alt={idol.name}
                    loading="lazy"
                    decoding="async"
                    className="size-full transition-transform duration-300 group-hover:scale-[1.03]"
                    style={{ objectFit: idol.imageFit }}
                  />
                </div>
                <div className="flex min-h-14 items-center justify-between gap-2 border-t px-3 py-2.5">
                  <span className="min-w-0 text-sm font-medium break-words">
                    {idol.name}
                  </span>
                  <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
