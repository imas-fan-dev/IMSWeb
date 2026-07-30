import {
  ChevronDownIcon,
  FolderOpenIcon,
  PencilIcon,
  PlusIcon,
  UsersRoundIcon,
} from "lucide-react"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { WikiEntryKindBadge } from "~/components/wiki/wiki-entry-kind"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { cn } from "~/lib/utils"
import type { WikiAdminAgency, WikiAdminGroup, WikiAdminIdol } from "~/lib/api"

export function WikiHierarchyExplorer({
  agency,
  selectedIdolId,
  onSelectIdol,
  onCreateGroup,
  onEditGroup,
  onCreateIdol,
}: {
  agency: WikiAdminAgency
  selectedIdolId: number | null
  onSelectIdol: (idol: WikiAdminIdol) => void
  onCreateGroup: () => void
  onEditGroup: (group: WikiAdminGroup) => void
  onCreateIdol: () => void
}) {
  const idolCount = new Set(
    [...agency.idols, ...agency.groups.flatMap((group) => group.idols)].map(
      (idol) => idol.id
    )
  ).size
  const groupedIdolIds = new Set(
    agency.groups.flatMap((group) => [
      ...group.idolIds,
      ...group.idols.map((idol) => idol.id),
    ])
  )
  const ungroupedIdols = agency.idols.filter(
    (idol) => !groupedIdolIds.has(idol.id)
  )

  return (
    <nav aria-label={`${agency.name}内容结构`} className="min-w-0">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">内容结构</h2>
          <p className="text-xs text-muted-foreground">
            {agency.groups.length} 个栏目 · {idolCount} 个内容页
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={onCreateGroup}
          >
            <PlusIcon data-icon="inline-start" />
            栏目
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={onCreateIdol}
          >
            <PlusIcon data-icon="inline-start" />
            内容页
          </Button>
        </div>
      </div>

      {agency.groups.length || ungroupedIdols.length ? (
        <div className="flex flex-col py-1">
          {agency.groups.map((group) => (
            <GroupBranch
              key={group.id}
              group={group}
              selectedIdolId={selectedIdolId}
              onSelectIdol={onSelectIdol}
              onEdit={() => onEditGroup(group)}
            />
          ))}
          {ungroupedIdols.length ? (
            <section className="mt-1 border-t px-2 pt-1">
              <div className="flex min-w-0 items-center gap-2 p-1.5">
                <FolderOpenIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  未归档
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {ungroupedIdols.length}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 pb-1 pl-5">
                {ungroupedIdols.map((idol) => (
                  <IdolRow
                    key={idol.id}
                    idol={idol}
                    selected={selectedIdolId === idol.id}
                    onSelect={onSelectIdol}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <Empty className="m-3 min-h-40 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersRoundIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>还没有内容</EmptyTitle>
            <EmptyDescription>
              可直接新增未归档内容页，也可以先创建栏目。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </nav>
  )
}

function GroupBranch({
  group,
  selectedIdolId,
  onSelectIdol,
  onEdit,
}: {
  group: WikiAdminGroup
  selectedIdolId: number | null
  onSelectIdol: (idol: WikiAdminIdol) => void
  onEdit: () => void
}) {
  return (
    <Collapsible defaultOpen>
      <div className="flex items-center gap-1 px-2 py-1">
        <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
          <ChevronDownIcon
            className="size-3.5 shrink-0 transition-transform group-data-panel-open:rotate-180"
            aria-hidden="true"
          />
          {group.iconUrl ? (
            <span className="size-5 shrink-0 overflow-hidden rounded border bg-background">
              <WikiTransformedImage
                src={group.iconUrl}
                alt=""
                transform={group.imageTransform}
              />
            </span>
          ) : (
            <span
              className="size-2 shrink-0 rounded-full border"
              style={{ backgroundColor: group.color }}
              aria-hidden="true"
            />
          )}
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {group.name}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {group.idols.length}
          </span>
          {group.isFallback ? <Badge variant="outline">默认</Badge> : null}
        </CollapsibleTrigger>
        <Button type="button" size="xs" variant="ghost" onClick={onEdit}>
          <PencilIcon data-icon="inline-start" />
          编辑
        </Button>
      </div>

      <CollapsibleContent>
        {group.idols.length ? (
          <div className="flex flex-col gap-0.5 px-2 pb-1 pl-7">
            {group.idols.map((idol) => (
              <IdolRow
                key={idol.id}
                idol={idol}
                selected={selectedIdolId === idol.id}
                onSelect={onSelectIdol}
              />
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 px-9 py-2 text-xs text-muted-foreground">
            <FolderOpenIcon className="size-3.5" aria-hidden="true" />
            暂无内容页
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function IdolRow({
  idol,
  selected,
  onSelect,
}: {
  idol: WikiAdminIdol
  selected: boolean
  onSelect: (idol: WikiAdminIdol) => void
}) {
  return (
    <button
      type="button"
      aria-label={idol.name}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        selected && "border-border bg-accent text-accent-foreground"
      )}
      onClick={() => onSelect(idol)}
    >
      <Avatar size="sm" aria-hidden="true">
        {idol.imageUrl ? (
          <WikiTransformedImage
            src={idol.imageUrl}
            alt=""
            transform={idol.imageTransform}
            className="rounded-full"
          />
        ) : null}
        {!idol.imageUrl ? (
          <AvatarFallback>{idol.name.slice(0, 1)}</AvatarFallback>
        ) : null}
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-sm">{idol.name}</span>
      <WikiEntryKindBadge kind={idol.entryKind} subtype={idol.entrySubtype} />
      {!idol.wikiEnabled ? (
        <span className="text-xs text-muted-foreground">隐藏</span>
      ) : null}
    </button>
  )
}
