import { BookOpenTextIcon, Link2Icon, Mic2Icon } from "lucide-react"

import { cn } from "~/lib/utils"

function sourceIcon(contentType: string) {
  const normalized = contentType.normalize("NFKC").trim().toLowerCase()
  if (normalized.includes("语音") || normalized.includes("audio")) {
    return { Icon: Mic2Icon, label: "语音" }
  }
  if (normalized.includes("剧情") || normalized.includes("story")) {
    return { Icon: BookOpenTextIcon, label: "剧情" }
  }
  return { Icon: Link2Icon, label: contentType || "其他" }
}

export function WikiStorySourceIcon({
  contentType,
  className,
}: {
  contentType: string
  className?: string
}) {
  const { Icon, label } = sourceIcon(contentType)
  return (
    <span
      role="img"
      aria-label={`${label}来源`}
      title={`${label}来源`}
      className={cn("grid shrink-0 place-items-center", className)}
    >
      <Icon aria-hidden="true" />
    </span>
  )
}
