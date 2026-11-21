import {
  ConfigurableLucideIcon,
  fallbackLucideIconName,
} from "~/components/lucide-icon"
import { cn } from "~/lib/utils"

/**
 * Source-type icon for a story link.
 *
 * Structured links carry the catalog `iconName`; document links are authored in
 * Markdown and have no catalog row, so they fall back to the default link icon.
 */
export function WikiStorySourceIcon({
  contentType,
  iconName,
  className,
}: {
  contentType: string
  iconName?: string
  className?: string
}) {
  const label = contentType || "其他"
  return (
    <span
      role="img"
      aria-label={`${label}来源`}
      title={`${label}来源`}
      className={cn("grid shrink-0 place-items-center", className)}
    >
      <ConfigurableLucideIcon
        name={iconName ?? fallbackLucideIconName}
        aria-hidden="true"
      />
    </span>
  )
}
