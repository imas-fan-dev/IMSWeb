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
        <CheckIcon aria-hidden="true" />
      ) : (
        <MicOffIcon aria-hidden="true" />
      )}
      隐藏未付声
    </button>
  )
}
