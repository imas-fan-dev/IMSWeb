import { LayoutGridIcon, MenuIcon } from "lucide-react"
import { Link } from "react-router"

interface ClassicMobileBarProps {
  navigationOpen: boolean
  onOpenNavigation: () => void
}

export function ClassicMobileBar({
  navigationOpen,
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
        to="/wiki"
        className="wiki-classic-icon-button"
        aria-label="切换到新版视图"
        title="切换到新版视图"
      >
        <LayoutGridIcon />
      </Link>
    </div>
  )
}
