import { ArrowUpRightIcon, ImageIcon } from "lucide-react"
import { useEffect, useMemo } from "react"

function safeHttpUrl(value: string) {
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null
  } catch {
    return null
  }
}

function useImagePreviewUrl(file: File | null) {
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : ""),
    [file]
  )
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl]
  )

  return previewUrl
}

export function RecommendationDraftPreview({
  title,
  url,
  image,
  remoteImageUrl = "",
}: {
  title: string
  url: string
  image: File | null
  remoteImageUrl?: string
}) {
  const localPreviewUrl = useImagePreviewUrl(image)
  const previewUrl = localPreviewUrl || safeHttpUrl(remoteImageUrl.trim())
  const href = safeHttpUrl(url.trim())
  const previewTitle = title.trim() || "推荐标题将在这里显示"

  const content = (
    <>
      <div className="flex aspect-4/3 w-full items-center justify-center self-start overflow-hidden rounded-md bg-warning/14 text-warning-foreground">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={localPreviewUrl ? "所选封面预览" : "B站封面预览"}
            referrerPolicy="no-referrer"
            className="size-full object-cover"
          />
        ) : (
          <ImageIcon aria-hidden="true" className="size-6" />
        )}
      </div>
      <div className="min-w-0 py-0.5">
        <p className="text-xs font-medium text-primary">推荐预览</p>
        <h3 className="mt-1.5 text-base/6 font-semibold group-hover:text-primary sm:text-lg/7">
          {previewTitle}
        </h3>
        <p className="mt-3 text-sm text-muted-foreground">发布后显示时间</p>
      </div>
      {href ? (
        <ArrowUpRightIcon
          aria-hidden="true"
          className="mt-1 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
        />
      ) : null}
    </>
  )

  const className =
    "group grid min-h-36 grid-cols-[6.5rem_minmax(0,1fr)_auto] gap-4 border-y py-5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:gap-5"

  return (
    <aside aria-labelledby="recommendation-preview-heading">
      <div className="mb-3">
        <h3
          id="recommendation-preview-heading"
          className="text-sm font-semibold"
        >
          实时预览
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">公开推荐列表</p>
      </div>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className={className}>
          {content}
        </a>
      ) : (
        <article className={className}>{content}</article>
      )}
    </aside>
  )
}
