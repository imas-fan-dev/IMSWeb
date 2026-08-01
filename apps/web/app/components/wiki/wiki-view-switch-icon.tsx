import type { ComponentPropsWithoutRef } from "react"

import { cn } from "~/lib/utils"

type WikiViewSwitchIconProps = Omit<
  ComponentPropsWithoutRef<"img">,
  "alt" | "src"
> & {
  tone?: "adaptive" | "dark" | "light"
}

export function WikiViewSwitchIcon({
  className,
  tone = "adaptive",
  ...props
}: WikiViewSwitchIconProps) {
  return (
    <img
      src="/brand/wiki-view-switch.png"
      alt=""
      aria-hidden="true"
      width={167}
      height={167}
      className={cn(
        "size-4 shrink-0 object-contain",
        tone === "adaptive" && "brightness-0 dark:brightness-100",
        tone === "dark" && "brightness-0",
        className
      )}
      {...props}
    />
  )
}
