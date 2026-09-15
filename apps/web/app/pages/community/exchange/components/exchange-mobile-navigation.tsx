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
import { Button } from "~/components/ui/button"
import { APP_FLOATING_CONTROL_OFFSET, IS_APP_TARGET } from "~/lib/app-target"
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
  localToolsOnly?: boolean
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
  localToolsOnly = false,
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
      {localToolsOnly ? null : (
        <button
          type="button"
          className={cn(itemClassName, itemStateClass(mapActive))}
          aria-current={mapActive ? "page" : undefined}
          onClick={navigate(onShowMap)}
        >
          <MapIcon className="size-5" aria-hidden="true" />
          <span>地图</span>
        </button>
      )}
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
      {localToolsOnly ? null : (
        <NavigationLink
          to="/community/exchange/me"
          className={itemClassName}
          aria-label="管理我的交换账号"
          onClick={onNavigate}
        >
          <UserRoundIcon className="size-5" aria-hidden="true" />
          <span aria-hidden="true">我的</span>
        </NavigationLink>
      )}
    </>
  )
}

function AppExchangeMapNavigation(props: ExchangeMobileNavigationProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={cn(
        "pointer-events-none absolute right-3 z-30 lg:hidden",
        APP_FLOATING_CONTROL_OFFSET
      )}
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="exchange-map-app-control pointer-events-auto size-10 rounded-lg transition-[transform,background-color] duration-200 active:scale-95 motion-reduce:transition-none"
        aria-label={expanded ? "收起地图工具" : "展开地图工具"}
        aria-controls="exchange-map-tools"
        aria-expanded={expanded}
        title={expanded ? "收起地图工具" : "展开地图工具"}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="relative size-5" aria-hidden="true">
          <MenuIcon
            className={cn(
              "absolute inset-0 size-5 transition-[opacity,transform] duration-200 motion-reduce:transition-none",
              expanded ? "rotate-90 opacity-0" : "rotate-0 opacity-100"
            )}
          />
          <XIcon
            className={cn(
              "absolute inset-0 size-5 transition-[opacity,transform] duration-200 motion-reduce:transition-none",
              expanded ? "rotate-0 opacity-100" : "-rotate-90 opacity-0"
            )}
          />
        </span>
      </Button>
      <div
        id="exchange-map-tools"
        role="toolbar"
        inert={!expanded}
        className={cn(
          "exchange-map-app-surface pointer-events-auto absolute right-[calc(100%+0.5rem)] bottom-0 w-36 origin-bottom-right overflow-hidden rounded-lg border p-1.5 transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transition-none",
          expanded
            ? "visible translate-x-0 scale-100 opacity-100"
            : "invisible translate-x-2 scale-95 opacity-0"
        )}
        aria-label="交换地图工具"
        aria-hidden={!expanded}
      >
        <SeriesAccentStrip className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5" />
        <ExchangeMapNavigationActions
          {...props}
          itemClassName={sideItemClassName}
          localToolsOnly
          onNavigate={() => setExpanded(false)}
        />
      </div>
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
