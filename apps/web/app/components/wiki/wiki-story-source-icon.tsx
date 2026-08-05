import { ConfigurableLucideIcon } from "~/components/lucide-icon"
import { cn } from "~/lib/utils"

export function WikiStorySourceIcon({
  contentType,
  iconName,
  className,
}: {
  contentType: string
  iconName: string
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
      <ConfigurableLucideIcon name={iconName} aria-hidden="true" />
    </span>
  )
}
