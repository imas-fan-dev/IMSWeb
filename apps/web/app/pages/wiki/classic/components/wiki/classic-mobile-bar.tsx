import { MenuIcon } from "lucide-react"
import { Link } from "react-router"

import { WikiViewSwitchIcon } from "~/components/wiki/wiki-view-switch-icon"

interface ClassicMobileBarProps {
  navigationOpen: boolean
  modernWikiHref: string
  onOpenNavigation: () => void
}

export function ClassicMobileBar({
  navigationOpen,
  modernWikiHref,
  onOpenNavigation,
}: ClassicMobileBarProps) {
  return (
    <div className="wiki-classic-mobile-bar">
      <button
        type="button"
        className="wiki-classic-icon-button"
        aria-label="打开企划导航"
        title="打开企划导航"
        aria-controls="classic-agency-navigation"
        aria-expanded={navigationOpen}
        onClick={onOpenNavigation}
      >
        <MenuIcon />
      </button>
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
