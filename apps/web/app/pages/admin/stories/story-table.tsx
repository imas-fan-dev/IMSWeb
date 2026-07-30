import {
  ExternalLinkIcon,
  ImageIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import type { WikiAdminStory } from "~/lib/api"

export function StoryTable({
  stories,
  allStories,
  onEdit,
  onDelete,
}: {
  stories: WikiAdminStory[]
  allStories: WikiAdminStory[]
  onEdit: (story: WikiAdminStory) => void
  onDelete: (story: WikiAdminStory, linkCount: number) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">图片</TableHead>
          <TableHead>分类与卡片</TableHead>
          <TableHead className="hidden lg:table-cell">视频来源</TableHead>
          <TableHead className="hidden xl:table-cell">链接</TableHead>
          <TableHead className="w-24 text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stories.map((story) => {
          const linkCount = allStories.filter(
            (candidate) =>
              candidate.category === story.category &&
              candidate.cardName === story.cardName
          ).length
          return (
            <TableRow key={story.id}>
              <TableCell>
                <div className="flex size-11 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
                  {story.imageUrl ? (
                    <img
                      src={story.imageUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="size-4" aria-hidden="true" />
                  )}
                </div>
              </TableCell>
              <TableCell className="max-w-80 whitespace-normal">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{story.category}</Badge>
                  {linkCount > 1 ? (
                    <Badge variant="outline">{linkCount} 个来源</Badge>
                  ) : null}
                </div>
                <p className="mt-2 font-medium wrap-break-word">
                  {story.cardName}
                </p>
                {story.subtitle ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {story.subtitle}
                  </p>
                ) : null}
                <div className="mt-2 text-xs text-muted-foreground lg:hidden">
                  <p className="font-medium text-foreground">{story.upName}</p>
                  <p className="mt-0.5 line-clamp-2">{story.videoTitle}</p>
                </div>
              </TableCell>
              <TableCell className="hidden max-w-72 whitespace-normal lg:table-cell">
                <p className="font-medium">{story.upName}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {story.videoTitle}
                </p>
              </TableCell>
              <TableCell className="hidden max-w-64 xl:table-cell">
                <a
                  href={story.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
                >
                  <span className="truncate">{story.url}</span>
                  <ExternalLinkIcon
                    className="size-3 shrink-0"
                    aria-hidden="true"
                  />
                </a>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    title={`编辑 ${story.cardName}`}
                    onClick={() => onEdit(story)}
                  >
                    <PencilIcon />
                    <span className="sr-only">编辑</span>
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="destructive"
                    title={`删除整张卡片 ${story.cardName}`}
                    onClick={() => onDelete(story, linkCount)}
                  >
                    <Trash2Icon />
                    <span className="sr-only">删除整张卡片</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
