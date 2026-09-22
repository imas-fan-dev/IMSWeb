import { LoaderCircleIcon } from "lucide-react"
import type { RefObject } from "react"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

/**
 * End-of-list region for a cursor-paged feed.
 *
 * Owns the sentinel that `useInfiniteScroll` observes, so the element that
 * triggers the next page and the element that reports on it cannot drift
 * apart. There is no "load more" button: scrolling is the only way forward,
 * and a button appears only to retry a page that failed.
 */
export function InfiniteScrollFooter({
  sentinelRef,
  label,
  hasNextPage,
  loading,
  error = null,
  onRetry,
  className,
}: {
  sentinelRef: RefObject<HTMLDivElement | null>
  /** Noun for the status text, such as 活动 or 推荐. */
  label: string
  hasNextPage: boolean
  loading: boolean
  /** Omit where the page reports a failed page load somewhere else. */
  error?: string | null
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      ref={sentinelRef}
      className={cn("flex flex-col items-center py-8", className)}
    >
      {error && onRetry ? (
        <>
          <p role="alert" className="mb-3 text-sm text-destructive">
            后续{label}加载失败：{error}
          </p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onRetry}
            disabled={loading}
          >
            {loading ? (
              <LoaderCircleIcon
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : null}
            {loading ? "正在加载" : "重试加载"}
          </Button>
        </>
      ) : hasNextPage ? (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircleIcon
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
          正在加载更多{label}
        </p>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          已显示本批次的全部{label}
        </p>
      )}
    </div>
  )
}
