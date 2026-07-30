import { ExternalLinkIcon, UserRoundIcon } from "lucide-react"
import { type CSSProperties } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import type { WikiPublicStoryCard, WikiPublicStoryCategory } from "~/lib/api"
import { safeExternalStoryUrl } from "~/pages/wiki/wiki-model"

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
                <a key={link.id} href={href} target="_blank" rel="noreferrer">
                  <UserRoundIcon />
                  <span>
                    <strong>{link.title || "查看剧情"}</strong>
                    <small>{link.up || "未知投稿者"}</small>
                  </span>
                  <ExternalLinkIcon />
                </a>
              ) : (
                <div key={link.id} className="is-unavailable">
                  链接不可用
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
