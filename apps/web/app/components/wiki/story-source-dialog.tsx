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
import { useRetainedValue } from "~/lib/use-retained-value"
import { safeExternalStoryUrl } from "~/pages/wiki/wiki-model"

/**
 * Structural source row shared by the dialog and by `:::links` groups.
 *
 * `StorySourceLinkItem` (dialog) and `WikiDocumentSourceLink` (compiled AST)
 * both satisfy it, so one row owns the icon, the two badges, the label, the UP
 * line, and the unavailable-URL fallback.
 */
export interface StorySourceLinkRowLink {
  up: string
  title: string
  url: string
  contentType: string
  sourcePlatform: string
  iconName?: string
}

/**
 * One source row: absolute URLs open a new tab, site-relative URLs navigate
 * inside the site, and an unusable URL renders as a dashed, non-interactive row
 * so the source's metadata stays readable.
 */
export function StorySourceLinkRow({
  link,
  id,
}: {
  link: StorySourceLinkRowLink
  id?: string
}) {
  const label = link.title || link.up || "查看来源"
  const external = safeExternalStoryUrl(link.url)
  const internal = !external && link.url.startsWith("/") ? link.url : null
  const navigation = external
    ? { href: external, target: "_blank", rel: "noreferrer" }
    : internal
      ? { to: internal }
      : null
  return navigation ? (
    <NavigationLink
      id={id}
      {...navigation}
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
    <div id={id} className="rounded-md border border-dashed px-3 py-2">
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
}

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
  // 关闭时先置空，退场期间保留最后一次选中的来源详情。
  const shownSelection = useRetainedValue(selection)
  return (
    <Dialog
      open={selection !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          {shownSelection?.groupTitle ? (
            <p className="text-sm text-muted-foreground">
              {shownSelection.groupTitle}
            </p>
          ) : null}
          <DialogTitle>{shownSelection?.title}</DialogTitle>
          {shownSelection?.subtitle ? (
            <DialogDescription>{shownSelection.subtitle}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="space-y-2">
          {shownSelection?.links.length ? (
            shownSelection.links.map((link) => (
              <StorySourceLinkRow key={link.key} link={link} />
            ))
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
