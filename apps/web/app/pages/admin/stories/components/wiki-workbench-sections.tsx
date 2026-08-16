import { PencilIcon } from "lucide-react"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { WikiEntryKindBadge } from "~/components/wiki/wiki-entry-kind"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import type { WikiAdminAgency, WikiAdminIdol } from "~/lib/api"

export function IdolSummary({
  agency,
  idol,
  onEdit,
}: {
  agency: WikiAdminAgency
  idol: WikiAdminIdol
  onEdit: () => void
}) {
  const groups = agency.groups.filter(
    (group) =>
      idol.groupIds.includes(group.id) ||
      group.idolIds.includes(idol.id) ||
      group.idols.some((candidate) => candidate.id === idol.id)
  )

  return (
    <section
      aria-labelledby="wiki-idol-summary-title"
      className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center"
    >
      <Avatar className="size-14 rounded-lg">
        {idol.imageUrl ? (
          <WikiTransformedImage
            src={idol.imageUrl}
            alt=""
            transform={idol.imageTransform}
            className="rounded-lg"
          />
        ) : null}
        {!idol.imageUrl ? (
          <AvatarFallback className="rounded-lg">
            {idol.name.slice(0, 1)}
          </AvatarFallback>
        ) : null}
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="wiki-idol-summary-title" className="text-base font-semibold">
            {idol.name}
          </h2>
          <Badge variant={idol.wikiEnabled ? "secondary" : "outline"}>
            {idol.wikiEnabled ? "公开显示" : "暂不公开"}
          </Badge>
          <WikiEntryKindBadge
            kind={idol.entryKind}
            subtype={idol.entrySubtype}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          ID {idol.id} · 素材目录 {idol.folderName}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {groups.map((group) => (
            <Badge key={group.id} variant="outline">
              {group.name}
            </Badge>
          ))}
          {!groups.length ? <Badge variant="outline">未归档</Badge> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onEdit}>
          <PencilIcon data-icon="inline-start" />
          编辑内容页
        </Button>
      </div>
    </section>
  )
}

export function WorkbenchSkeleton() {
  return (
    <div className="grid min-h-128 overflow-hidden rounded-lg border lg:grid-cols-[17rem_minmax(0,1fr)]">
      <div className="hidden border-r bg-muted/20 p-3 lg:flex lg:flex-col lg:gap-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-8 w-11/12" />
      </div>
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  )
}

export function StoryOutlineSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4" aria-label="正在加载剧情大纲">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

export function AgencySelectLabel({ agency }: { agency: WikiAdminAgency }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-muted">
        {agency.iconUrl ? (
          <WikiTransformedImage
            src={agency.iconUrl}
            alt=""
            transform={agency.imageTransform}
          />
        ) : (
          <span
            className="size-2 rounded-full border"
            style={{ backgroundColor: agency.color ?? undefined }}
            aria-hidden="true"
          />
        )}
      </span>
      <span className="truncate">{agency.name}</span>
    </span>
  )
}
