import {
  Building2Icon,
  CreditCardIcon,
  InfoIcon,
  ListFilterIcon,
  MapIcon,
  MenuIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useState } from "react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { SeriesAccentStrip } from "~/components/shared/series-accent-strip"
import { Button } from "~/components/ui/button"
import { APP_FLOATING_CONTROL_OFFSET, IS_APP_TARGET } from "~/lib/app-target"
import { useNativeGlassControl } from "~/lib/native-glass-controls"
import type {
  NativeGlassControlEvent,
  NativeGlassMenuItem,
} from "~/lib/native-glass-panel"
import { cn } from "~/lib/utils"
import type { ExchangeMapAttribution } from "~/pages/community/exchange/exchange-map-attribution"

interface ExchangeMobileNavigationProps {
  filterActive: boolean
  filterApplied: boolean
  officesActive: boolean
  cardsActive: boolean
  attribution?: ExchangeMapAttribution | null
  onOpenAttribution?: (trigger?: HTMLElement | null) => void
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
  attribution,
  itemClassName,
  localToolsOnly = false,
  onNavigate,
  onShowMap,
  onOpenFilter,
  onOpenOffices,
  onOpenCards,
  onOpenAttribution,
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
      {attribution ? (
        <button
          type="button"
          className={itemClassName}
          aria-label="查看地图数据来源"
          aria-haspopup="dialog"
          onClick={(event) => {
            onNavigate?.()
            onOpenAttribution?.(event.currentTarget)
          }}
        >
          <InfoIcon className="size-5" aria-hidden="true" />
          <span aria-hidden="true">数据来源</span>
        </button>
      ) : null}
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

function AppExchangeMapNavigation({
  filterActive,
  filterApplied,
  officesActive,
  cardsActive,
  attribution,
  onOpenFilter,
  onOpenOffices,
  onOpenCards,
  onOpenAttribution,
  ...props
}: ExchangeMobileNavigationProps) {
  const [expanded, setExpanded] = useState(false)
  const menuItems: NativeGlassMenuItem[] = [
    {
      id: "filter",
      icon: "list-filter",
      label: "筛选",
      active: filterActive,
      badge: filterApplied,
    },
    {
      id: "offices",
      icon: "building-2",
      label: "事务所",
      active: officesActive,
    },
    { id: "cards", icon: "credit-card", label: "名片", active: cardsActive },
    ...(attribution
      ? [{ id: "attribution", icon: "info", label: "数据来源" }]
      : []),
  ]

  const handleNativeEvent = useCallback(
    (event: NativeGlassControlEvent) => {
      if (event.action === "press") {
        setExpanded((current) => !current)
        return
      }
      if (event.action !== "menu-item") return
      setExpanded(false)
      if (event.itemId === "filter") onOpenFilter()
      else if (event.itemId === "offices") onOpenOffices()
      else if (event.itemId === "cards") onOpenCards()
      else if (event.itemId === "attribution") onOpenAttribution?.()
    },
    [onOpenAttribution, onOpenCards, onOpenFilter, onOpenOffices]
  )

  const { controlRef, panelRef } = useNativeGlassControl(
    "map-tools",
    {
      kind: "menu",
      icon: expanded ? "x" : "menu",
      label: expanded ? "收起地图工具" : "展开地图工具",
      expanded,
      items: menuItems,
    },
    handleNativeEvent
  )

  return (
    <div
      className={cn(
        "pointer-events-none absolute right-3 z-30 lg:hidden",
        APP_FLOATING_CONTROL_OFFSET
      )}
    >
      <Button
        ref={controlRef}
        type="button"
        variant="outline"
        size="icon"
        data-native-glass-control="map-tools"
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
        ref={panelRef}
        data-native-glass-twin="map-tools"
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
          filterActive={filterActive}
          filterApplied={filterApplied}
          officesActive={officesActive}
          cardsActive={cardsActive}
          attribution={attribution}
          onOpenFilter={onOpenFilter}
          onOpenOffices={onOpenOffices}
          onOpenCards={onOpenCards}
          onOpenAttribution={onOpenAttribution}
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
      className={cn(
        "pointer-events-auto absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid h-17 overflow-hidden rounded-lg border bg-background/95 shadow-lg backdrop-blur-md md:hidden",
        props.attribution ? "grid-cols-6" : "grid-cols-5"
      )}
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
