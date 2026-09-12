import { CircleXIcon, SearchIcon, XIcon } from "lucide-react"
import { type MouseEvent, useRef, useState } from "react"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { WikiGlobalSearchResults } from "~/components/wiki/wiki-global-search-results"
import type { WikiPublicSearchEntry } from "~/lib/api"
import { APP_FLOATING_CONTROL_OFFSET, IS_APP_TARGET } from "~/lib/app-target"
import { cn } from "~/lib/utils"

export function WikiMobileSearch({
  entries,
  view,
  className,
}: {
  entries: WikiPublicSearchEntry[]
  view: "classic" | "modern"
  className: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const classic = view === "classic"
  // `/wiki/classic` is a standalone route: it renders with no layout, so the app
  // build has no tab bar there and the button keeps its edge position. Only the
  // modern view sits inside `app-layout.tsx`. `IS_APP_TARGET` is inlined, so the
  // web bundle evaluates this to `false` and keeps the original offset.
  const clearsAppTabBar = IS_APP_TARGET && !classic

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) setQuery("")
  }

  function closeFromBackground(event: MouseEvent<HTMLDivElement>) {
    const target = event.target
    if (
      target instanceof Element &&
      target.closest("[data-wiki-mobile-search-panel]")
    ) {
      return
    }
    changeOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="icon"
            className={cn(
              "fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 size-12 rounded-full shadow-lg",
              classic &&
                "border-[3px] border-white bg-(--classic-accent) text-white hover:bg-(--classic-accent)",
              clearsAppTabBar && APP_FLOATING_CONTROL_OFFSET,
              className
            )}
            data-wiki-mobile-search={view}
            aria-label="打开全屏搜索"
            title="搜索 Wiki"
          />
        }
      >
        <SearchIcon className="size-5" aria-hidden="true" />
      </DialogTrigger>

      <DialogContent
        initialFocus={inputRef}
        showCloseButton={false}
        safeArea={clearsAppTabBar ? "custom" : "viewport"}
        overlayClassName={cn(
          "bg-background/92 duration-300 supports-backdrop-filter:bg-background/45 supports-backdrop-filter:backdrop-blur-2xl supports-backdrop-filter:backdrop-saturate-150 motion-reduce:duration-0",
          classic && "bg-[#fff8fb]/92 supports-backdrop-filter:bg-[#fff8fb]/48"
        )}
        className={cn(
          "flex flex-col gap-0 overflow-hidden rounded-none bg-transparent p-0 ring-0 duration-300 motion-reduce:duration-0 data-open:zoom-in-100 data-closed:zoom-out-100",
          clearsAppTabBar &&
            "inset-x-0 top-(--app-header-inset) bottom-0 h-(--app-viewport-height) max-h-none w-screen max-w-none translate-0",
          classic && "text-[#292a2f]"
        )}
        data-wiki-mobile-search-dialog={view}
        onClick={closeFromBackground}
      >
        <div
          className={cn(
            "min-h-0 flex-1",
            clearsAppTabBar
              ? "px-(--app-safe-inline) pt-4 pb-[calc(var(--app-bottom-clearance)-4.25rem)]"
              : "pt-[calc(1.5rem+var(--safe-area-top))] pr-[calc(1rem+var(--safe-area-right))] pb-[calc(1rem+var(--safe-area-bottom))] pl-[calc(1rem+var(--safe-area-left))]"
          )}
          data-wiki-mobile-search-surface={view}
          data-wiki-mobile-search-dismiss={view}
        >
          <section
            className={cn(
              "mx-auto flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-foreground/10 bg-background/72 shadow-xl shadow-foreground/5 backdrop-blur-xl",
              classic &&
                "border-[#ef9caf]/70 bg-[#fff9fb]/78 shadow-[#9f2648]/10"
            )}
            data-wiki-mobile-search-panel={view}
          >
            <header className="shrink-0 p-2">
              <div className="flex h-9 items-center justify-between px-2">
                <DialogTitle className="text-sm font-semibold">
                  搜索 Wiki
                </DialogTitle>
                <DialogClose
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className={cn(
                        "bg-background/35 backdrop-blur-md",
                        classic &&
                          "text-[#8f2949] hover:bg-[#fbdfe7] hover:text-[#6f1f39]"
                      )}
                      aria-label="关闭搜索"
                      title="关闭搜索"
                    />
                  }
                >
                  <XIcon aria-hidden="true" />
                </DialogClose>
              </div>

              <label className="relative block">
                <span className="sr-only">移动端全局搜索内容页</span>
                <SearchIcon
                  className={cn(
                    "pointer-events-none absolute top-1/2 left-3 z-10 size-5 -translate-y-1/2 text-primary",
                    classic && "text-(--classic-accent,#f34f6d)"
                  )}
                  aria-hidden="true"
                />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索全站偶像或内容页"
                  className={cn(
                    "h-12 rounded-lg border-foreground/10 bg-background/72 pr-11 pl-10 text-base shadow-sm backdrop-blur-md",
                    classic &&
                      "border-[#ef9caf] bg-white/72 focus-visible:border-[#d94f72] focus-visible:ring-[#d94f72]/20"
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    "absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground transition-opacity",
                    query ? "opacity-100" : "pointer-events-none opacity-0"
                  )}
                  aria-label="清除搜索词"
                  title="清除搜索词"
                  tabIndex={query ? 0 : -1}
                  onClick={() => {
                    setQuery("")
                    inputRef.current?.focus()
                  }}
                >
                  <CircleXIcon aria-hidden="true" />
                </Button>
              </label>
            </header>

            <WikiGlobalSearchResults
              entries={entries}
              query={query}
              view={view}
              className={cn(
                "static inset-auto top-auto mt-0 min-h-0 flex-1 rounded-none border-x-0 border-t border-b-0 border-foreground/10 bg-transparent shadow-none backdrop-blur-none",
                classic && "border-[#ef9caf]/70 bg-transparent text-[#292a2f]"
              )}
              onNavigate={() => changeOpen(false)}
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
