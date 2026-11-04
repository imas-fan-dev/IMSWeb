import { HomeIcon } from "lucide-react"
import { useState } from "react"

import type { PlatformAccountKind } from "~/lib/api"
import { cn } from "~/lib/utils"
import { platformIconUrl } from "~/components/profile/platform-account-icons"
import githubIcon from "./platform-icons/github.svg?url"
import nintendoSwitchIcon from "./platform-icons/nintendo-switch.svg?url"
import xIcon from "./platform-icons/x.svg?url"
import xboxIcon from "./platform-icons/xbox.svg?url"

export function PlatformAccountKindIcon({
  kind,
  className,
}: {
  kind: PlatformAccountKind
  className?: string
}) {
  const [failed, setFailed] = useState<string[]>([])
  if (kind.group === "link") {
    return (
      <HomeIcon
        aria-hidden="true"
        className={cn("size-4 shrink-0 text-muted-foreground", className)}
      />
    )
  }
  const bundled: Record<string, string> = {
    switch: nintendoSwitchIcon,
    nintendoswitch: nintendoSwitchIcon,
    xbox: xboxIcon,
    github: githubIcon,
    x: xIcon,
  }
  const fallback = bundled[kind.icon ?? ""] ?? platformIconUrl(kind.icon, null)
  const url = [kind.iconUrl, fallback].find(
    (candidate) => candidate && !failed.includes(candidate)
  )
  const monochrome = ["x", "github"].includes(kind.icon ?? kind.id)
  if (!url) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[10px] text-muted-foreground",
          className
        )}
      >
        {kind.name.slice(0, 1)}
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn("size-4 shrink-0 bg-current text-foreground", className)}
      style={{
        backgroundColor: monochrome
          ? "currentColor"
          : (kind.color ?? "currentColor"),
        maskImage: `url("${url}")`,
        WebkitMaskImage: `url("${url}")`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    >
      <img
        src={url}
        alt=""
        className="hidden"
        onError={() => setFailed((items) => [...items, url])}
      />
    </span>
  )
}
