import { useCallback, useEffect, useRef, useState } from "react"

const minimumFrameHeight = 480
const maximumFrameHeight = 24_000

function boundedFrameHeight(value: number) {
  return Math.min(Math.max(value, minimumFrameHeight), maximumFrameHeight)
}

export function InformationDocumentFrame({
  contentId,
  title,
}: {
  contentId: string
  title: string
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [height, setHeight] = useState(minimumFrameHeight)

  const syncTheme = useCallback(() => {
    const root = frameRef.current?.contentDocument?.documentElement
    if (!root) return
    root.dataset.theme = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light"
  }, [])

  const syncHeight = useCallback(() => {
    const contentDocument = frameRef.current?.contentDocument
    if (!contentDocument) return
    const contentHeight = Math.max(
      contentDocument.documentElement.scrollHeight,
      contentDocument.body?.scrollHeight ?? 0
    )
    if (contentHeight > 0) setHeight(boundedFrameHeight(contentHeight))
  }, [])

  function handleLoad() {
    resizeObserverRef.current?.disconnect()
    syncTheme()
    syncHeight()

    const contentDocument = frameRef.current?.contentDocument
    if (!contentDocument || !("ResizeObserver" in window)) return
    const observer = new ResizeObserver(syncHeight)
    observer.observe(contentDocument.documentElement)
    if (contentDocument.body) observer.observe(contentDocument.body)
    resizeObserverRef.current = observer
  }

  useEffect(() => {
    const themeObserver = new MutationObserver(syncTheme)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => {
      themeObserver.disconnect()
      resizeObserverRef.current?.disconnect()
    }
  }, [syncTheme])

  return (
    <iframe
      ref={frameRef}
      src={`/information/${encodeURIComponent(contentId)}/content`}
      title={title}
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      onLoad={handleLoad}
      style={{ height }}
      className="min-h-[60svh] w-full rounded-md border bg-background"
    />
  )
}
