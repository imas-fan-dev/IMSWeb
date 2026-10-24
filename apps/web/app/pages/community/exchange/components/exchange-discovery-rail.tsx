import {
  Building2Icon,
  ChevronRightIcon,
  ContactRoundIcon,
  EyeIcon,
  MapPinIcon,
  RadioTowerIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react"
import type { FormEvent } from "react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { SeriesAccentStrip } from "~/components/shared/series-accent-strip"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import type { FudabaOffice, FudabaSeries } from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"
import { cn } from "~/lib/utils"
import { ExchangeSeriesFilter } from "./exchange-series-filter"
import { ExchangeMapToolsMenu } from "./exchange-map-tools-menu"

export interface ExchangeDiscoveryRailProps {
  embedded?: boolean
  onSelectOffice?: (office: FudabaOffice) => void
  cityDraft: string
  seriesCodes: readonly string[]
  openOnly: boolean
  series: FudabaSeries[]
  offices: FudabaOffice[]
  cardCount: number
  refreshing: boolean
  error: string | null
  hasFilters: boolean
  onCityDraftChange: (value: string) => void
  onCitySubmit: (event: FormEvent<HTMLFormElement>) => void
  onSeriesToggle: (seriesCode: string) => void
  onSeriesClear: () => void
  onOpenChange: (openOnly: boolean) => void
  onResetFilters: () => void
  onRefresh: () => void
  onOpenFilter: () => void
  onOpenOffices: () => void
  onOpenCards: () => void
  modalOpen?: boolean
  /**
   * Present only while the map style carries a notice. The rail is the sole
   * container visible at `lg` and up, so this is the desktop's attribution
   * entry point; the bottom search card covers Web below 1024px and App.
   */
  onOpenAttribution?: (trigger: HTMLElement) => void
}

function officeSeriesLabel(
  office: FudabaOffice,
  series: readonly FudabaSeries[]
) {
  const labels = new Map(series.map((item) => [item.code, item.displayName]))
  return office.seriesCodes
    .slice(0, 2)
    .map((code) => labels.get(code) ?? code)
    .join(" / ")
}

export function ExchangeDiscoveryRail({
  embedded = false,
  onSelectOffice,
  cityDraft,
  seriesCodes,
  openOnly,
  series,
  offices,
  cardCount,
  refreshing,
  error,
  hasFilters,
  onCityDraftChange,
  onCitySubmit,
  onSeriesToggle,
  onSeriesClear,
  onOpenChange,
  onResetFilters,
  onRefresh,
  onOpenFilter,
  onOpenOffices,
  onOpenCards,
  modalOpen,
  onOpenAttribution,
}: ExchangeDiscoveryRailProps) {
  const Title = embedded ? "h2" : "h1"
  return (
    <aside
      className={cn(
        "relative z-10 shrink-0 flex-col overflow-hidden bg-background",
        embedded
          ? "exchange-web-discovery flex min-h-0 w-full"
          : "hidden border-r lg:flex",
        !embedded &&
          (IS_APP_TARGET
            ? "h-(--app-content-height) w-80 self-start"
            : "h-full w-88 xl:w-96")
      )}
      aria-label="交换发现栏"
    >
      <SeriesAccentStrip className="absolute inset-x-0 top-0 z-10 h-1" />

      <header className="shrink-0 border-b p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <RadioTowerIcon className="size-4" aria-hidden="true" />
            </span>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground">
              P-CARD EXCHANGE
            </p>
          </div>
          <div
            className={cn(
              "flex shrink-0 items-center gap-1",
              embedded && "hidden"
            )}
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label="刷新交换区"
                    disabled={refreshing}
                    onClick={onRefresh}
                  />
                }
              >
                <RefreshCwIcon
                  className={cn(
                    refreshing && "animate-spin motion-reduce:animate-none"
                  )}
                  aria-hidden="true"
                />
              </TooltipTrigger>
              <TooltipContent side="bottom">刷新交换区</TooltipContent>
            </Tooltip>
            <ExchangeMapToolsMenu
              side="bottom"
              triggerClassName="size-9 rounded-lg bg-transparent hover:bg-muted"
              filterApplied={hasFilters}
              modalOpen={modalOpen}
              onOpenFilter={onOpenFilter}
              onOpenOffices={onOpenOffices}
              onOpenCards={onOpenCards}
              onOpenAttribution={onOpenAttribution}
            />
          </div>
        </div>

        <Title className="mt-3 text-xl font-semibold tracking-tight">
          名片交换信号地图
        </Title>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
          <Badge
            variant="secondary"
            className="gap-1.5 font-normal tabular-nums"
          >
            <Building2Icon aria-hidden="true" />
            {offices.length} 个事务所
          </Badge>
          <Badge
            variant="secondary"
            className="gap-1.5 font-normal tabular-nums"
          >
            <ContactRoundIcon aria-hidden="true" />
            {cardCount} 张名片
          </Badge>
        </div>

        <form className="mt-5 flex gap-2" onSubmit={onCitySubmit}>
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="desktop-rail-exchange-city"
              value={cityDraft}
              maxLength={100}
              placeholder="搜索城市"
              aria-label="搜索城市"
              className="h-10 bg-muted/30 pl-9"
              onChange={(event) => onCityDraftChange(event.currentTarget.value)}
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            size="icon"
            className="size-10"
          >
            <SearchIcon aria-hidden="true" />
            <span className="sr-only">按城市查找</span>
          </Button>
        </form>

        <div className="mt-3 flex items-center justify-between gap-3">
          <Label
            htmlFor="desktop-rail-open-only"
            className="flex min-w-0 items-center gap-2 text-xs font-normal"
          >
            <Checkbox
              id="desktop-rail-open-only"
              checked={openOnly}
              onCheckedChange={(checked) => onOpenChange(checked === true)}
            />
            仅看开放事务所
          </Label>
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onResetFilters}
            >
              清除筛选
            </Button>
          ) : null}
        </div>
      </header>

      <section className="shrink-0 border-b p-4" aria-label="企划标签">
        <div className="mb-3 flex min-h-7 items-center justify-between gap-3 px-1">
          <h2 className="text-sm font-semibold">企划标签</h2>
          {seriesCodes.length ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onSeriesClear}
            >
              已选 {seriesCodes.length} · 清除
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">全部</span>
          )}
        </div>
        <ExchangeSeriesFilter
          series={series}
          selectedCodes={seriesCodes}
          onToggle={onSeriesToggle}
        />
      </section>

      {!embedded ? (
        <section
          className="flex min-h-0 flex-1 flex-col"
          aria-label="公开事务所"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4">
            <h2 className="text-sm font-semibold">公开事务所</h2>
            <Badge variant="secondary" className="font-normal tabular-nums">
              {offices.length} 个地点
            </Badge>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {offices.length ? (
              <div className="divide-y">
                {offices.map((office) => (
                  <NavigationLink
                    key={office.id}
                    to={`/community/exchange/offices/${encodeURIComponent(office.slug)}`}
                    onClick={(event) => {
                      if (
                        !onSelectOffice ||
                        event.button !== 0 ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      )
                        return
                      event.preventDefault()
                      onSelectOffice(office)
                    }}
                    className="group relative flex min-w-0 items-start gap-3 px-5 py-4 transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                  >
                    <span
                      className="mt-1 block h-10 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: office.accent }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="line-clamp-2 text-sm/6 font-semibold wrap-break-word">
                        {office.name}
                      </strong>
                      <span className="mt-1 flex min-w-0 items-start gap-1.5 text-xs/5 text-muted-foreground">
                        <MapPinIcon
                          className="mt-1 size-3 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="line-clamp-2 wrap-break-word">
                          {office.address}
                        </span>
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span className="min-w-0 truncate">
                          {officeSeriesLabel(office, series) || "综合企划"}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 tabular-nums">
                          <EyeIcon className="size-3" aria-hidden="true" />
                          {office.visitorCount.toLocaleString("zh-CN")} 次访问
                        </span>
                      </span>
                    </span>
                    <ChevronRightIcon
                      className="mt-3 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </NavigationLink>
                ))}
              </div>
            ) : (
              <Empty className="min-h-48 px-5">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Building2Icon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>当前筛选下没有公开事务所</EmptyTitle>
                  <EmptyDescription>试试其他城市或企划标签。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </section>
      ) : null}

      {error ? (
        <p
          className="shrink-0 border-b px-5 py-2 text-xs text-destructive"
          role="status"
        >
          {error}。地图结果仍可继续使用。
        </p>
      ) : null}
    </aside>
  )
}
