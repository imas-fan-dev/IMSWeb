import { useEffect, useRef } from "react"

/**
 * Auto-loading for cursor-paged lists.
 *
 * Attach the returned ref to a sentinel element at the end of the list. The
 * next page loads as the sentinel comes within `rootMargin` of the viewport,
 * so a list advances by scrolling rather than by a "load more" button.
 *
 * Two mechanisms, one behavior. IntersectionObserver is the real one; the
 * scroll listener only runs where that constructor is missing, so a browser
 * without it still reaches the end of the list instead of stopping dead at the
 * first page.
 */

/** How close to the end the next page starts loading, in CSS pixels. */
const DEFAULT_ROOT_MARGIN = 480

type InfiniteScrollOptions = {
  hasNextPage: boolean
  /** Blocks re-entry while a page is already in flight. */
  loading: boolean
  onLoadMore: () => void | Promise<void>
  rootMargin?: number
}

export function useInfiniteScroll({
  hasNextPage,
  loading,
  onLoadMore,
  rootMargin = DEFAULT_ROOT_MARGIN,
}: InfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const onLoadMoreRef = useRef(onLoadMore)

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore
  }, [onLoadMore])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (
      !sentinel ||
      !hasNextPage ||
      loading ||
      typeof IntersectionObserver === "undefined"
    ) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void onLoadMoreRef.current()
        }
      },
      { rootMargin: `${rootMargin}px 0px` }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, loading, rootMargin])

  useEffect(() => {
    if (
      !hasNextPage ||
      loading ||
      typeof IntersectionObserver !== "undefined"
    ) {
      return
    }

    const loadWhenNearBottom = () => {
      const remaining =
        document.documentElement.scrollHeight -
        (window.scrollY + window.innerHeight)
      if (remaining <= rootMargin) void onLoadMoreRef.current()
    }

    // A page shorter than the viewport never fires a scroll event, so the
    // fallback has to check its own starting position.
    loadWhenNearBottom()
    window.addEventListener("scroll", loadWhenNearBottom, { passive: true })
    window.addEventListener("resize", loadWhenNearBottom)
    return () => {
      window.removeEventListener("scroll", loadWhenNearBottom)
      window.removeEventListener("resize", loadWhenNearBottom)
    }
  }, [hasNextPage, loading, rootMargin])

  return sentinelRef
}
