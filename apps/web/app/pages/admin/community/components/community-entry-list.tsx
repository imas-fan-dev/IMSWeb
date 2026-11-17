import { Menu } from "@base-ui/react/menu"
import {
  ArrowUpIcon,
  ArrowDownIcon,
  PencilIcon,
  Trash2Icon,
  MoreHorizontalIcon,
  UsersIcon,
} from "lucide-react"
import { AdminEmptyState } from "~/components/admin/admin-ui"
import { Button } from "~/components/ui/button"
import { Badge } from "~/components/ui/badge"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "~/components/ui/table"
import { ConfigurableLucideIcon } from "~/components/lucide-icon"
import { resolveSafeMediaUrl, type CommunityContentEntry } from "~/lib/api"
import { audienceLabel, availabilityLabel } from "../community-model"

export function CommunityEntryList({
  entries,
  disabled,
  onEdit,
  onMove,
  onDelete,
  onEditRef,
}: {
  entries: CommunityContentEntry[]
  disabled: boolean
  onEdit: (entry: CommunityContentEntry) => void
  onMove: (id: string, offset: number) => void
  onDelete: (id: string) => void
  onEditRef: (id: string, node: HTMLButtonElement | null) => void
}) {
  if (!entries.length)
    return (
      <AdminEmptyState
        icon={UsersIcon}
        title="暂无社区入口"
        description="使用新增入口添加内容，保存配置后发布。"
      />
    )
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="hidden w-14 lg:table-cell">顺序</TableHead>
          <TableHead>入口与说明</TableHead>
          <TableHead className="hidden w-40 xl:table-cell">地址</TableHead>
          <TableHead className="hidden w-20 lg:table-cell">范围</TableHead>
          <TableHead className="hidden w-24 lg:table-cell">状态</TableHead>
          <TableHead className="w-24 text-right lg:w-36">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry, index) => (
          <TableRow key={entry.id} aria-label={`入口 ${index + 1}`}>
            <TableCell className="hidden text-muted-foreground lg:table-cell">
              {index + 1}
            </TableCell>
            <TableCell className="whitespace-normal">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted">
                  {entry.imageUrl ? (
                    <img
                      alt=""
                      src={resolveSafeMediaUrl(entry.imageUrl) ?? undefined}
                      className="size-full object-contain"
                    />
                  ) : (
                    <ConfigurableLucideIcon
                      name={entry.icon}
                      className="size-4"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="font-medium wrap-anywhere">{entry.title}</p>
                  <p className="line-clamp-2 text-xs wrap-anywhere text-muted-foreground">
                    {entry.description}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground lg:hidden">
                    <span>#{index + 1}</span>
                    <span>{audienceLabel[entry.audience]}</span>
                    <span>{entry.enabled ? "显示" : "隐藏"}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {availabilityLabel[entry.availability]}
                  </p>
                </div>
              </div>
            </TableCell>
            <TableCell className="hidden xl:table-cell">
              <p className="truncate font-mono text-xs" title={entry.href}>
                {entry.href}
              </p>
            </TableCell>
            <TableCell className="hidden lg:table-cell">
              <Badge variant="secondary">{audienceLabel[entry.audience]}</Badge>
            </TableCell>
            <TableCell className="hidden lg:table-cell">
              <Badge variant="outline">{entry.enabled ? "显示" : "隐藏"}</Badge>
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="hidden lg:inline-flex"
                  aria-label={`上移 ${entry.title}`}
                  disabled={disabled || index === 0}
                  onClick={() => onMove(entry.id, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="hidden lg:inline-flex"
                  aria-label={`下移 ${entry.title}`}
                  disabled={disabled || index === entries.length - 1}
                  onClick={() => onMove(entry.id, 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="max-lg:size-11"
                  aria-label={`编辑 ${entry.title}`}
                  disabled={disabled}
                  ref={(node) => {
                    onEditRef(entry.id, node)
                  }}
                  onClick={() => onEdit(entry)}
                >
                  <PencilIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="hidden text-destructive lg:inline-flex"
                  aria-label={`删除 ${entry.title}`}
                  disabled={disabled}
                  onClick={() => onDelete(entry.id)}
                >
                  <Trash2Icon />
                </Button>
                <Menu.Root>
                  <Menu.Trigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-11 lg:hidden"
                        aria-label={`更多操作 ${entry.title}`}
                        disabled={disabled}
                      />
                    }
                  >
                    <MoreHorizontalIcon />
                  </Menu.Trigger>
                  <Menu.Portal>
                    <Menu.Positioner
                      sideOffset={4}
                      align="end"
                      className="z-50"
                    >
                      <Menu.Popup className="min-w-36 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
                        <Menu.Item
                          className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm outline-none data-highlighted:bg-accent data-disabled:opacity-50"
                          disabled={index === 0}
                          onClick={() => onMove(entry.id, -1)}
                        >
                          <ArrowUpIcon className="size-4" />
                          上移
                        </Menu.Item>
                        <Menu.Item
                          className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm outline-none data-highlighted:bg-accent data-disabled:opacity-50"
                          disabled={index === entries.length - 1}
                          onClick={() => onMove(entry.id, 1)}
                        >
                          <ArrowDownIcon className="size-4" />
                          下移
                        </Menu.Item>
                        <Menu.Item
                          className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-destructive outline-none data-highlighted:bg-accent"
                          onClick={() => onDelete(entry.id)}
                        >
                          <Trash2Icon className="size-4" />
                          删除
                        </Menu.Item>
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.Root>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
