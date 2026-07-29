import { ArrowUpRightIcon } from "lucide-react"
import { Link } from "react-router"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { WikiEntryKindBadge } from "~/components/wiki/wiki-entry-kind"
import type {
  WikiImageTransform,
  WikiPublicCatalog,
  WikiPublicIdol,
} from "~/shared/api"

import { safeWikiColor } from "../wiki-model"

type PublicGroup = NonNullable<WikiPublicCatalog["selection"]>["groups"][number]

export function WikiIdolGrid({
  agency,
  groups,
  ungroupedIdols,
}: {
  agency: string
  groups: PublicGroup[]
  ungroupedIdols: WikiPublicIdol[]
}) {
  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <IdolSection
          key={group.id}
          agency={agency}
          headingId={`wiki-group-${group.id}`}
          title={group.name}
          color={group.color}
          iconUrl={group.iconUrl}
          imageTransform={group.imageTransform}
          idols={group.idols}
        />
      ))}
      {ungroupedIdols.length ? (
        <IdolSection
          agency={agency}
          headingId="wiki-group-ungrouped"
          title="未归档"
          color="#6b7280"
          iconUrl={null}
          idols={ungroupedIdols}
        />
      ) : null}
    </div>
  )
}

function IdolSection({
  agency,
  headingId,
  title,
  color,
  iconUrl,
  imageTransform,
  idols,
}: {
  agency: string
  headingId: string
  title: string
  color: string
  iconUrl: string | null
  imageTransform?: WikiImageTransform
  idols: WikiPublicIdol[]
}) {
  return (
    <section
      aria-labelledby={headingId}
      style={{ contentVisibility: "auto", containIntrinsicSize: "640px" }}
    >
      <div className="mb-4 flex items-center justify-between gap-4 border-b pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-8 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: safeWikiColor(color) }}
            aria-hidden="true"
          />
          {iconUrl && imageTransform ? (
            <WikiTransformedImage
              src={iconUrl}
              alt=""
              transform={imageTransform}
              className="size-7 shrink-0"
              loading="lazy"
              onError={(event) => {
                event.currentTarget.hidden = true
              }}
            />
          ) : null}
          <h3 id={headingId} className="text-lg font-semibold wrap-break-word">
            {title}
          </h3>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {idols.length} 个内容页
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {idols.map((idol) => (
          <Link
            key={idol.id}
            to={`/story?agency=${encodeURIComponent(agency)}&idol=${encodeURIComponent(idol.name)}`}
            aria-label={idol.name}
            className="group overflow-hidden rounded-lg border bg-card shadow-xs transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            style={{ borderTopColor: safeWikiColor(idol.color) }}
          >
            <div className="aspect-4/5 overflow-hidden bg-muted">
              {idol.imageUrl ? (
                <WikiTransformedImage
                  src={idol.imageUrl}
                  alt={idol.name}
                  transform={idol.imageTransform}
                  loading="lazy"
                  decoding="async"
                  className="transition-transform duration-300"
                />
              ) : null}
            </div>
            <div className="flex min-h-18 items-center justify-between gap-2 border-t px-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                <span className="min-w-0 text-sm font-medium wrap-break-word">
                  {idol.name}
                </span>
                <WikiEntryKindBadge
                  kind={idol.entryKind}
                  subtype={idol.entrySubtype}
                  variant="secondary"
                />
              </div>
              <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
