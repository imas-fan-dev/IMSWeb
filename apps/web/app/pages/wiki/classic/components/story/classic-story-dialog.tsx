import { ExternalLinkIcon } from "lucide-react"
import { type CSSProperties } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { WikiStorySourceIcon } from "~/components/wiki/wiki-story-source-icon"
import type { WikiPublicStoryCard, WikiPublicStoryCategory } from "~/lib/api"
import { safeExternalStoryUrl } from "~/pages/wiki/wiki-model"
import { NavigationLink } from "~/components/navigation/navigation-link"

interface ClassicStoryDialogProps {
  selected: {
    category: WikiPublicStoryCategory
    card: WikiPublicStoryCard
  } | null
  style: CSSProperties
  onClose: () => void
}

export function ClassicStoryDialog({
  selected,
  style,
  onClose,
}: ClassicStoryDialogProps) {
  return (
    <Dialog
      open={selected !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="wiki-classic-story-dialog" style={style}>
        <DialogHeader>
          <p>{selected?.category.name}</p>
          <DialogTitle>{selected?.card.name}</DialogTitle>
          {selected?.card.subtitle ? (
            <DialogDescription>{selected.card.subtitle}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="wiki-classic-story-dialog-links">
          {selected?.card.links.length ? (
            selected.card.links.map((link) => {
              const href = safeExternalStoryUrl(link.url)
              return href ? (
                <NavigationLink
                  key={link.id}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <WikiStorySourceIcon
                    contentType={link.contentType}
                    iconName={link.contentTypeIcon}
                  />
                  <span>
                    <span className="wiki-classic-story-link-meta">
                      <span>{link.contentType}</span>
                      <span>{link.sourcePlatform}</span>
                    </span>
                    <strong>{link.title || "查看剧情"}</strong>
                    <small>来源：{link.up || "未知投稿者"}</small>
                  </span>
                  <ExternalLinkIcon />
                </NavigationLink>
              ) : (
                <div key={link.id} className="is-unavailable">
                  来源：{link.up || "未知投稿者"} · 链接不可用
                </div>
              )
            })
          ) : (
            <p className="wiki-classic-story-empty">暂无可用剧情来源</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
