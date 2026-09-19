import { NavigationLink } from "~/components/navigation/navigation-link"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import type { ExchangeMapAttribution } from "~/pages/community/exchange/exchange-map-attribution"

interface ExchangeMapAttributionDialogProps {
  attribution: ExchangeMapAttribution | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Renders the parsed OpenMapTiles notice. Segments keep the authored order, so
 * links and plain text stay interleaved exactly as the style file spells them.
 * Nothing here builds HTML, which is why untrusted anchor markup can render
 * through React instead of `dangerouslySetInnerHTML`.
 */
export function ExchangeMapAttributionDialog({
  attribution,
  open,
  onOpenChange,
}: ExchangeMapAttributionDialogProps) {
  if (!attribution) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>地图数据来源</DialogTitle>
          <DialogDescription>
            地图数据来自 OpenFreeMap、OpenMapTiles 与
            OpenStreetMap。以下授权信息按许可要求保留。
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm/relaxed text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground">
          {attribution.segments.map((segment, index) =>
            segment.kind === "link" ? (
              <NavigationLink
                key={`link-${index}`}
                href={segment.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {segment.label}
              </NavigationLink>
            ) : (
              <span key={`text-${index}`}>{segment.value}</span>
            )
          )}
        </p>
      </DialogContent>
    </Dialog>
  )
}
