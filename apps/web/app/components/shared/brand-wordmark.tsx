import { cn } from "~/lib/utils"

type BrandWordmarkProps = {
  className?: string
}

export function BrandWordmark({ className }: BrandWordmarkProps) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-semibold text-current",
        className
      )}
      aria-hidden="true"
    >
      IMSWeb
    </span>
  )
}
