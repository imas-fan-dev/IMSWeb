import {
  Building2Icon,
  CreditCardIcon,
  ListFilterIcon,
  MapIcon,
  MenuIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react"
import { useState } from "react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { SeriesAccentStrip } from "~/components/shared/series-accent-strip"
import { IS_APP_TARGET } from "~/lib/app-target"
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

interface ExchangeMapNavigationActionsProps extends ExchangeMobileNavigationProps {
  itemClassName: string
  onNavigate?: () => void
}

const bottomItemClassName =
  "relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5 text-[0.625rem] font-semibold text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 focus-visible:outline-none"

const sideItemClassName =
  "relative flex h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 focus-visible:outline-none"

function itemStateClass(active: boolean) {
  return active && "bg-accent/70 text-primary"
}

function ExchangeMapNavigationActions({
  filterActive,
  filterApplied,
  officesActive,
  cardsActive,
  itemClassName,
  onNavigate,
  onShowMap,
  onOpenFilter,
  onOpenOffices,
  onOpenCards,
}: ExchangeMapNavigationActionsProps) {
  const mapActive = !filterActive && !officesActive && !cardsActive

  function navigate(action: () => void) {
    return () => {
      action()
      onNavigate?.()
    }
  }

  return (
    <>
      <button
        type="button"
        className={cn(itemClassName, itemStateClass(mapActive))}
        aria-current={mapActive ? "page" : undefined}
        onClick={navigate(onShowMap)}
      >
        <MapIcon className="size-5" aria-hidden="true" />
        <span>地图</span>
      </button>
      <button
        type="button"
        className={cn(itemClassName, itemStateClass(filterActive))}
        aria-label={filterApplied ? "打开筛选，已应用筛选" : "打开筛选"}
        aria-pressed={filterApplied}
        onClick={navigate(onOpenFilter)}
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
        onClick={navigate(onOpenOffices)}
      >
        <Building2Icon className="size-5" aria-hidden="true" />
        <span aria-hidden="true">事务所</span>
      </button>
      <button
        type="button"
        className={cn(itemClassName, itemStateClass(cardsActive))}
        aria-label="打开名片名录"
        aria-pressed={cardsActive}
        onClick={navigate(onOpenCards)}
      >
        <CreditCardIcon className="size-5" aria-hidden="true" />
        <span aria-hidden="true">名片</span>
      </button>
      <NavigationLink
        to="/community/exchange/me"
        className={itemClassName}
        aria-label="管理我的交换账号"
        onClick={onNavigate}
      >
        <UserRoundIcon className="size-5" aria-hidden="true" />
        <span aria-hidden="true">我的</span>
      </NavigationLink>
    </>
  )
}

function AppExchangeMapNavigation(props: ExchangeMobileNavigationProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="pointer-events-none absolute top-16 right-3 z-30 md:hidden">
      <button
        type="button"
        className="pointer-events-auto grid size-11 place-items-center rounded-full border bg-background/95 text-foreground shadow-lg backdrop-blur-md transition-[transform,background-color] duration-200 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
        aria-label={expanded ? "收起交换地图导航" : "展开交换地图导航"}
        aria-controls="exchange-map-navigation"
        aria-expanded={expanded}
        title={expanded ? "收起地图导航" : "展开地图导航"}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? (
          <XIcon className="size-5" aria-hidden="true" />
        ) : (
          <MenuIcon className="size-5" aria-hidden="true" />
        )}
      </button>
      <nav
        id="exchange-map-navigation"
        hidden={!expanded}
        className="pointer-events-auto absolute top-0 right-[calc(100%+0.5rem)] w-40 overflow-hidden rounded-lg border bg-background/95 p-1.5 shadow-lg backdrop-blur-md"
        aria-label="交换地图导航"
      >
        <SeriesAccentStrip className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5" />
        <ExchangeMapNavigationActions
          {...props}
          itemClassName={sideItemClassName}
          onNavigate={() => setExpanded(false)}
        />
      </nav>
    </div>
  )
}

export function ExchangeMobileNavigation(props: ExchangeMobileNavigationProps) {
  if (IS_APP_TARGET) return <AppExchangeMapNavigation {...props} />

  return (
    <nav
      className="pointer-events-auto absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid h-17 grid-cols-5 overflow-hidden rounded-lg border bg-background/95 shadow-lg backdrop-blur-md md:hidden"
      aria-label="交换地图导航"
    >
      <SeriesAccentStrip className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5" />
      <ExchangeMapNavigationActions
        {...props}
        itemClassName={bottomItemClassName}
      />
    </nav>
  )
}
