import { CheckIcon, MicOffIcon } from "lucide-react"

import { cn } from "~/lib/utils"

export function ClassicVoicedFilter({
  hideUnvoiced,
  onToggle,
}: {
  hideUnvoiced: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={cn("wiki-classic-voiced-filter", hideUnvoiced && "is-active")}
      aria-pressed={hideUnvoiced}
      onClick={onToggle}
    >
      {hideUnvoiced ? (
        <MicOffIcon aria-hidden="true" />
      ) : (
        <CheckIcon aria-hidden="true" />
      )}
      {hideUnvoiced ? "展示未付声" : "隐藏未付声"}
    </button>
  )
}
