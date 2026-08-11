import {
  ArrowUpRightIcon,
  CalendarDaysIcon,
  FileCode2Icon,
  ImagePlusIcon,
  ImagesIcon,
  LinkIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useRef } from "react"

import { CoverImagePreview } from "~/components/shared/cover-image-preview"
import { observeImageLoading } from "~/components/shared/image-loading-indicator"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  AdminEmptyState,
  AdminPanel,
  AdminStatus,
} from "~/components/admin/admin-ui"
import { SortableList } from "~/components/admin/sortable-list"
import type { AdminInformationCard, InformationSubmission } from "~/lib/api"

import {
  categoryLabel,
  contentTypeLabel,
  informationErrorMessage,
} from "../information-model"

function InformationRow({
  card,
  onEdit,
  onDelete,
  deleting,
}: {
  card: AdminInformationCard
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  return (
    <article className="grid grid-cols-[6rem_minmax(0,1fr)] gap-4 py-5 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto]">
      <CoverImagePreview
        src={card.image}
        alt={`${card.title}封面`}
        className="aspect-16/10 w-full bg-muted"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <AdminStatus>{categoryLabel(card.category)}</AdminStatus>
          <AdminStatus>{contentTypeLabel(card.contentType)}</AdminStatus>
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold">
          {card.title}
        </h3>
        <a
          href={card.link}
          target={card.contentType === "external" ? "_blank" : undefined}
          rel={card.contentType === "external" ? "noreferrer" : undefined}
          aria-label={`打开“${card.title}”`}
          className="mt-2 inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
        >
          <span>打开内容</span>
          <ArrowUpRightIcon className="size-3 shrink-0" aria-hidden="true" />
        </a>
      </div>
      <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1 sm:self-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`编辑“${card.title}”`}
          onClick={onEdit}
        >
          <PencilIcon data-icon="inline-start" />
          编辑
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          aria-label={`删除“${card.title}”`}
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

function InformationHtmlPreviewFrame({ document }: { document: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const imageObserverCleanupRef = useRef<(() => void) | null>(null)

  function handleLoad() {
    imageObserverCleanupRef.current?.()
    const contentDocument = frameRef.current?.contentDocument
    if (!contentDocument) return

    imageObserverCleanupRef.current = observeImageLoading(contentDocument)
  }

  useEffect(
    () => () => {
      imageObserverCleanupRef.current?.()
    },
    []
  )

  return (
    <iframe
      ref={frameRef}
      title="活动 HTML 预览"
      sandbox="allow-same-origin"
      srcDoc={document}
      onLoad={handleLoad}
      className="h-144 w-full rounded-lg border bg-background"
    />
  )
}

export function InformationPreview({
  document,
  submission,
}: {
  document: string
  submission: InformationSubmission
}) {
  const PreviewIcon =
    submission.contentType === "html" ? FileCode2Icon : LinkIcon

  return (
    <aside
      aria-label="内容预览"
      className="min-w-0 lg:sticky lg:top-0 lg:self-start"
    >
      <header className="mb-4 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <PreviewIcon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">内容预览</h2>
          <p className="mt-1 text-xs/5 text-muted-foreground">
            {submission.contentType === "html"
              ? "以站内安全策略渲染 HTML。"
              : "首页活动卡片的展示效果。"}
          </p>
        </div>
      </header>
      {submission.contentType === "html" ? (
        <InformationHtmlPreviewFrame document={document} />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="aspect-video bg-muted">
            {submission.image ? (
              <CoverImagePreview
                src={submission.image}
                alt={`${submission.title || "活动标题"}封面`}
                className="size-full rounded-none"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <ImagePlusIcon className="size-8" aria-hidden="true" />
              </div>
            )}
          </div>
          <div className="p-4">
            <p className="text-xs font-medium text-primary">
              {categoryLabel(submission.category)}
            </p>
            <p className="mt-2 font-semibold">
              {submission.title || "活动标题"}
            </p>
          </div>
        </div>
      )}
    </aside>
  )
}

export function PublishedInformationPanel({
  cards,
  deletingId,
  error,
  loading,
  reordering,
  onDelete,
  onEdit,
  onCreate,
  onReorder,
}: {
  cards: AdminInformationCard[]
  deletingId: string | null
  error: unknown
  loading: boolean
  reordering: boolean
  onDelete: (card: AdminInformationCard) => void
  onEdit: (card: AdminInformationCard) => void
  onCreate: () => void
  onReorder: (cards: AdminInformationCard[]) => void
}) {
  return (
    <AdminPanel
      title="已发布活动内容"
      description={`${cards.length} 条内容`}
      icon={CalendarDaysIcon}
      action={
        <Button type="button" onClick={onCreate}>
          <PlusIcon data-icon="inline-start" />
          新增活动内容
        </Button>
      }
      contentClassName="pt-1"
    >
      {error ? (
        <Alert>
          <AlertTitle>活动内容加载失败</AlertTitle>
          <AlertDescription>{informationErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : loading ? (
        <p className="py-6 text-sm text-muted-foreground">正在加载内容</p>
      ) : cards.length ? (
        <SortableList
          items={cards}
          disabled={reordering}
          getLabel={(card) => card.title}
          renderItem={(card) => (
            <InformationRow
              card={card}
              deleting={deletingId === card.id}
              onEdit={() => onEdit(card)}
              onDelete={() => onDelete(card)}
            />
          )}
          onReorder={onReorder}
        />
      ) : (
        <AdminEmptyState
          icon={CalendarDaysIcon}
          title="还没有活动内容"
          description="等待发布第一条活动资讯或同人活动。"
        />
      )}
    </AdminPanel>
  )
}

export function InformationAssetsPanel({
  assets,
  deletingUrl,
  onDelete,
}: {
  assets: string[]
  deletingUrl: string | null
  onDelete: (url: string) => void
}) {
  return (
    <AdminPanel
      title="托管图片"
      description={`${assets.length} 个对象`}
      icon={ImagesIcon}
    >
      {assets.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((url, index) => (
            <article key={url} className="min-w-0">
              <img
                src={url}
                alt={`托管图片 ${index + 1}`}
                className="aspect-video w-full rounded-lg border bg-muted object-cover"
              />
              <div className="mt-2 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-xs font-medium">
                  托管图片 {index + 1}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除托管图片 ${index + 1}`}
                  title={`删除托管图片 ${index + 1}`}
                  disabled={deletingUrl === url}
                  onClick={() => onDelete(url)}
                >
                  {deletingUrl === url ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : (
                    <Trash2Icon />
                  )}
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <AdminEmptyState
          icon={ImagesIcon}
          title="还没有托管图片"
          description="上传封面或正文图片后，资源会显示在这里。"
        />
      )}
    </AdminPanel>
  )
}
