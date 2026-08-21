import {
  Building2Icon,
  CreditCardIcon,
  ListFilterIcon,
  MapIcon,
  UserRoundIcon,
} from "lucide-react"
import { Link } from "react-router"

import { SeriesAccentStrip } from "~/components/shared/series-accent-strip"
import { cn } from "~/lib/utils"

interface ExchangeMobileNavigationProps {
  filterActive: boolean
  filterApplied: boolean
  officesActive: boolean
  cardsActive: boolean
  onShowMap: () => void
  onOpenFilter: () => void
  onOpenOffices: () => void
  onOpenCards: () => void
}

const itemClassName =
  "relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5 text-[0.625rem] font-semibold text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 focus-visible:outline-none"

function itemStateClass(active: boolean) {
  return active && "bg-accent/70 text-primary"
}

export function ExchangeMobileNavigation({
  filterActive,
  filterApplied,
  officesActive,
  cardsActive,
  onShowMap,
  onOpenFilter,
  onOpenOffices,
  onOpenCards,
}: ExchangeMobileNavigationProps) {
  const mapActive = !filterActive && !officesActive && !cardsActive

  return (
    <nav
      className="pointer-events-auto absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid h-17 grid-cols-5 overflow-hidden rounded-lg border bg-background/95 shadow-lg backdrop-blur-md md:hidden"
      aria-label="交换地图导航"
    >
      <SeriesAccentStrip className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5" />
      <button
        type="button"
        className={cn(itemClassName, itemStateClass(mapActive))}
        aria-current={mapActive ? "page" : undefined}
        onClick={onShowMap}
      >
        <MapIcon className="size-5" aria-hidden="true" />
        <span>地图</span>
      </button>
      <button
        type="button"
        className={cn(itemClassName, itemStateClass(filterActive))}
        aria-label={filterApplied ? "打开筛选，已应用筛选" : "打开筛选"}
        aria-pressed={filterApplied}
        onClick={onOpenFilter}
      >
        <span className="relative">
          <ListFilterIcon className="size-5" aria-hidden="true" />
          {filterApplied ? (
            <span
              className="absolute -top-1 -right-1 size-2 rounded-full border border-background bg-primary"
              aria-hidden="true"
            />
          ) : null}
        </span>
        <span aria-hidden="true">筛选</span>
      </button>
      <button
        type="button"
        className={cn(itemClassName, itemStateClass(officesActive))}
        aria-label="打开事务所名录"
        aria-pressed={officesActive}
        onClick={onOpenOffices}
      >
        <Building2Icon className="size-5" aria-hidden="true" />
        <span aria-hidden="true">事务所</span>
      </button>
      <button
        type="button"
        className={cn(itemClassName, itemStateClass(cardsActive))}
        aria-label="打开名片名录"
        aria-pressed={cardsActive}
        onClick={onOpenCards}
      >
        <CreditCardIcon className="size-5" aria-hidden="true" />
        <span aria-hidden="true">名片</span>
      </button>
      <Link
        to="/community/exchange/me"
        className={itemClassName}
        aria-label="管理我的交换账号"
      >
        <UserRoundIcon className="size-5" aria-hidden="true" />
        <span aria-hidden="true">我的</span>
      </Link>
    </nav>
  )
}
