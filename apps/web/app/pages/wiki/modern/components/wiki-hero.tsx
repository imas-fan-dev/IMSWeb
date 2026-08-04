import { ArrowUpRightIcon, RefreshCwIcon } from "lucide-react"
import { Link } from "react-router"

import { WikiViewSwitchIcon } from "~/components/wiki/wiki-view-switch-icon"
import { Button } from "~/components/ui/button"
import type { WikiRandomBackground } from "~/lib/api"

export function WikiHero({
  background,
  loading,
  classicHref,
  onRefresh,
}: {
  background: WikiRandomBackground | null
  loading: boolean
  classicHref: string
  onRefresh: () => void
}) {
  const source = [background?.agency_name, background?.idol_name]
    .filter(Boolean)
    .join(" · ")
  const cardHref =
    background?.card_id && background.agency_name && background.idol_name
      ? `/story?agency=${encodeURIComponent(background.agency_name)}&idol=${encodeURIComponent(background.idol_name)}#story-card-${background.card_id}`
      : null

  return (
    <section
      className="relative isolate min-h-112 overflow-hidden border-b bg-neutral-950 text-white sm:min-h-[clamp(30rem,62svh,42rem)]"
      aria-label="剧情档案视觉"
    >
      {background?.url ? (
        <img
          src={background.url}
          alt={background.card_name || "剧情档案视觉"}
          className="absolute inset-0 size-full object-cover object-[center_25%]"
        />
      ) : null}
      <div
        className="absolute inset-0 bg-black/30 sm:bg-black/25"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex min-h-112 w-full max-w-7xl flex-col justify-end px-4 py-8 drop-shadow-[0_2px_8px_rgb(0_0_0/0.9)] sm:min-h-[clamp(30rem,62svh,42rem)] sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <p className="text-xs font-semibold text-white/70">STORY ARCHIVE</p>
        <div className="mt-2 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-semibold sm:text-4xl">剧情档案</h1>
            <p className="mt-3 max-w-2xl text-sm/6 text-white/80 sm:text-base">
              按企划与内容页查找主线、卡片、活动和特别剧情。
            </p>
            {source ? (
              <p className="mt-2 text-xs text-white/65">
                当前视觉：{source}
                {background?.card_name ? ` · ${background.card_name}` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {cardHref ? (
              <Link
                to={cardHref}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white bg-white px-2.5 text-sm font-medium text-neutral-950 transition-colors hover:bg-white/85 focus-visible:ring-3 focus-visible:ring-white/40 focus-visible:outline-none"
              >
                <ArrowUpRightIcon className="size-4" />
                查看对应卡片
              </Link>
            ) : null}
            <Link
              to={classicHref}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/35 bg-black/30 px-2.5 text-sm font-medium text-white transition-colors hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-white/40 focus-visible:outline-none"
            >
              <WikiViewSwitchIcon tone="light" />
              经典视图
            </Link>
            <Button
              type="button"
              variant="outline"
              onClick={onRefresh}
              disabled={loading}
              className="border-white/35 bg-black/30 text-white hover:bg-white/15 hover:text-white"
            >
              <RefreshCwIcon
                data-icon="inline-start"
                className={loading ? "animate-spin" : undefined}
              />
              换一张剧情视觉
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
