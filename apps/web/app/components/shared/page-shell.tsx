import type { ComponentPropsWithoutRef } from "react"

import { IS_APP_TARGET } from "~/lib/app-target"
import { cn } from "~/lib/utils"

const widths = {
  read: "max-w-3xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
} as const

export function PageShell({
  width = "default",
  className,
  ...props
}: ComponentPropsWithoutRef<"main"> & {
  width?: keyof typeof widths
}) {
  return (
    <main
      {...props}
      id="main-content"
      className={cn(
        "mx-auto w-full",
        widths[width],
        IS_APP_TARGET
          ? "px-(--app-safe-inline) py-5"
          : "px-4 py-12 sm:px-6 sm:py-16 lg:px-8",
        className
      )}
    />
  )
}
