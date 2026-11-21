import { ExternalLinkIcon } from "lucide-react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { Badge } from "~/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { WikiStorySourceIcon } from "~/components/wiki/wiki-story-source-icon"
import type { StorySourceSelection } from "~/components/wiki/story-source-model"
import { safeExternalStoryUrl } from "~/pages/wiki/wiki-model"

/**
 * Source dialog for a story card.
 *
 * Structured categories and document `:::card` blocks both open this component,
 * so a card always lists its sources the same way in either content mode.
 */
export function StorySourceDialog({
  selection,
  onClose,
}: {
  selection: StorySourceSelection | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={selection !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          {selection?.groupTitle ? (
            <p className="text-sm text-muted-foreground">
              {selection.groupTitle}
            </p>
          ) : null}
          <DialogTitle>{selection?.title}</DialogTitle>
          {selection?.subtitle ? (
            <DialogDescription>{selection.subtitle}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="space-y-2">
          {selection?.links.length ? (
            selection.links.map((link) => {
              const href = safeExternalStoryUrl(link.url)
              const label = link.title || "查看剧情"
              return href ? (
                <NavigationLink
                  key={link.key}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="group/link flex min-h-12 items-center gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <WikiStorySourceIcon
                    contentType={link.contentType}
                    iconName={link.iconName}
                    className="size-8 rounded-full bg-muted text-muted-foreground [&_svg]:size-4"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{link.contentType}</Badge>
                      <Badge variant="outline">{link.sourcePlatform}</Badge>
                    </span>
                    <span className="block text-sm font-medium wrap-break-word">
                      {label}
                    </span>
                    <span className="block text-xs wrap-break-word text-muted-foreground">
                      来源：{link.up || "未知发布者"}
                    </span>
                  </span>
                  <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground group-hover/link:text-foreground" />
                </NavigationLink>
              ) : (
                <div
                  key={link.key}
                  className="rounded-md border border-dashed px-3 py-2"
                >
                  <span className="mb-1 flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{link.contentType}</Badge>
                    <Badge variant="outline">{link.sourcePlatform}</Badge>
                  </span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">
                    来源：{link.up || "未知发布者"} · 链接不可用
                  </span>
                </div>
              )
            })
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              暂无可用剧情来源
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
