import { CheckIcon, MicOffIcon } from "lucide-react"

import { cn } from "~/lib/utils"

export function WikiVoicedFilter({
  hideUnvoiced,
  onToggle,
}: {
  hideUnvoiced: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={hideUnvoiced}
      onClick={onToggle}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        hideUnvoiced
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-foreground hover:bg-muted"
      )}
    >
      {hideUnvoiced ? (
        <MicOffIcon aria-hidden="true" className="size-3.5" />
      ) : (
        <CheckIcon aria-hidden="true" className="size-3.5" />
      )}
      {hideUnvoiced ? "展示未付声" : "隐藏未付声"}
    </button>
  )
}
