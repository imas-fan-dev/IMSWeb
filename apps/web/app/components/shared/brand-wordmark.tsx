import { cn } from "~/lib/utils"

type BrandWordmarkProps = {
  className?: string
}

export function BrandWordmark({ className }: BrandWordmarkProps) {
  return (
    <img
      className={cn("h-8 w-auto shrink-0 object-contain", className)}
      src="/brand/imsweb-logo.webp"
      alt="偶像大师交流站"
      width={545}
      height={188}
      decoding="async"
    />
  )
}
