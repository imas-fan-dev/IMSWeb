import {
  ArrowUpRightIcon,
  ImageIcon,
  LoaderCircleIcon,
  Trash2Icon,
} from "lucide-react"

import { Button } from "~/components/ui/button"
import type { AdminRecommendation } from "~/lib/api"

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function formatDate(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : dateFormatter.format(date)
}

export function RecommendationRow({
  recommendation,
  deleting,
  onDelete,
}: {
  recommendation: AdminRecommendation
  deleting: boolean
  onDelete: () => void
}) {
  return (
    <article className="grid grid-cols-[5rem_minmax(0,1fr)] gap-4 border-b py-5 last:border-b-0 sm:grid-cols-[6rem_minmax(0,1fr)_auto]">
      <div className="flex aspect-4/3 w-full items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
        {recommendation.thumbnail || recommendation.image ? (
          <img
            src={recommendation.thumbnail || recommendation.image || ""}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <ImageIcon className="size-5" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0">
        <h3 className="line-clamp-2 text-sm font-semibold">
          {recommendation.title}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {recommendation.author || "未知发布者"}
          {recommendation.date ? ` · ${formatDate(recommendation.date)}` : ""}
        </p>
        <a
          href={recommendation.content}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
        >
          <span className="truncate">{recommendation.content}</span>
          <ArrowUpRightIcon className="size-3 shrink-0" aria-hidden="true" />
        </a>
      </div>
      <div className="col-span-2 flex justify-end sm:col-span-1 sm:self-center">
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
