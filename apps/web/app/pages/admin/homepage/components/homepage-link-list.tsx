import {
  ArrowUpRightIcon,
  LayoutListIcon,
  LoaderCircleIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"

import { homepageLinkAccentClasses } from "~/components/homepage/homepage-link-options"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import type { HomepageLink } from "~/lib/api"
import { cn } from "~/lib/utils"
import { AdminEmptyState, AdminPanel } from "~/pages/admin/components/admin-ui"
import { SortableList } from "~/pages/admin/components/sortable-list"

function HomepageLinkRow({
  link,
  deleting,
  onDelete,
  onEdit,
}: {
  link: HomepageLink
  deleting: boolean
  onDelete: () => void
  onEdit: () => void
}) {
  return (
    <article className="flex min-h-24 flex-col gap-3 py-4 sm:flex-row sm:items-center">
      <span
        className={cn(
          "h-8 w-1 shrink-0 rounded-full",
          homepageLinkAccentClasses[link.accent]
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{link.title}</h3>
        {link.description ? (
          <p className="mt-1 text-xs/5 text-muted-foreground">
            {link.description}
          </p>
        ) : null}
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
        >
          <span className="truncate">{link.href}</span>
          <ArrowUpRightIcon className="size-3 shrink-0" aria-hidden="true" />
        </a>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <PencilIcon data-icon="inline-start" />
          编辑
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={deleting}
          onClick={onDelete}
        >
          {deleting ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin"
            />
          ) : (
            <Trash2Icon data-icon="inline-start" />
          )}
          删除
        </Button>
      </div>
    </article>
  )
}

export function HomepageLinkList({
  title,
  links,
  loading,
  error,
  deletingId,
  reordering,
  onDelete,
  onEdit,
  onReorder,
}: {
  title: string
  links: HomepageLink[]
  loading: boolean
  error: unknown
  deletingId: string | null
  reordering: boolean
  onDelete: (link: HomepageLink) => void
  onEdit: (link: HomepageLink) => void
  onReorder: (links: HomepageLink[]) => void
}) {
  return (
    <AdminPanel
      title={title}
      description={`${links.length} 条链接`}
      icon={LayoutListIcon}
      contentClassName="pt-1"
    >
      {error ? (
        <Alert>
          <AlertTitle>首页链接加载失败</AlertTitle>
          <AlertDescription>请刷新后重试。</AlertDescription>
        </Alert>
      ) : loading ? (
        <p className="py-6 text-sm text-muted-foreground">正在加载链接</p>
      ) : links.length ? (
        <SortableList
          items={links}
          disabled={reordering}
          getLabel={(link) => link.title}
          renderItem={(link) => (
            <HomepageLinkRow
              link={link}
              deleting={deletingId === link.id}
              onEdit={() => onEdit(link)}
              onDelete={() => onDelete(link)}
            />
          )}
          onReorder={onReorder}
        />
      ) : (
        <AdminEmptyState
          icon={LayoutListIcon}
          title={`还没有${title}`}
          description="添加第一条链接后会显示在公开首页。"
        />
      )}
    </AdminPanel>
  )
}
