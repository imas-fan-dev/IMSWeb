import { HouseIcon } from "lucide-react"
import { Link } from "react-router"

import { WikiViewSwitchIcon } from "~/components/wiki/wiki-view-switch-icon"

interface ClassicMobileBarProps {
  modernWikiHref: string
}

export function ClassicMobileBar({ modernWikiHref }: ClassicMobileBarProps) {
  return (
    <div className="wiki-classic-mobile-bar">
      <Link
        to="/"
        className="wiki-classic-icon-button"
        aria-label="返回首页"
        title="返回首页"
      >
        <HouseIcon />
      </Link>
      <strong>剧情导航站</strong>
      <Link
        to={modernWikiHref}
        className="wiki-classic-icon-button"
        aria-label="切换到新版视图"
        title="切换到新版视图"
      >
        <WikiViewSwitchIcon tone="light" className="size-5" />
      </Link>
    </div>
  )
}
