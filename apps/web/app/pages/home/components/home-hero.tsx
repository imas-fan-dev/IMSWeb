import { CakeSliceIcon } from "lucide-react"

import { cn } from "~/lib/utils"
import { getBirthdaysOn } from "../birthday-data"
import { seriesItems } from "../home-content"

export function SeriesWall() {
  return (
    <section
      className="relative isolate overflow-hidden bg-neutral-950 text-white"
      aria-labelledby="home-heading"
    >
      <div
        className="grid h-[19rem] grid-cols-2 sm:h-80 sm:grid-cols-3 lg:h-[28rem] lg:grid-cols-6"
        aria-hidden="true"
      >
        {seriesItems.map((series) => (
          <div
            key={series.name}
            data-testid="series-band"
            className={cn(
              "group relative min-w-0 overflow-hidden",
              series.background
            )}
          >
            <img
              src={series.image}
              alt=""
              width={585}
              height={500}
              className="absolute inset-0 size-full object-cover opacity-45 transition-[opacity,transform] duration-500 group-hover:scale-[1.02] group-hover:opacity-100 motion-reduce:transition-none"
              decoding="async"
              draggable={false}
            />
          </div>
        ))}
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 z-10 hidden h-44 -translate-y-1/2 bg-neutral-950/70 lg:block"
        aria-hidden="true"
      />
      <div className="relative z-10 flex min-h-44 items-center justify-center bg-neutral-950 px-5 text-center lg:pointer-events-none lg:absolute lg:inset-0 lg:min-h-0 lg:bg-transparent">
        <div className="max-w-3xl text-white">
          <p className="text-xs font-semibold">PRODUCER PORTAL</p>
          <h1
            id="home-heading"
            className="mt-3 text-3xl font-semibold sm:text-5xl"
          >
            偶像大师交流站
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 sm:text-lg sm:leading-7">
            中文资料、活动日程、制作人社区与共同创作内容的统一入口
          </p>
        </div>
      </div>
    </section>
  )
}

export function TodayBirthdayNotice() {
  const today = new Date()
  const birthdays = getBirthdaysOn(today.getMonth() + 1, today.getDate())
  if (!birthdays.length) return null

  return (
    <aside className="border-b bg-card" aria-label="今日生日">
      <div className="mx-auto flex w-full max-w-7xl items-start gap-3 px-4 py-4 sm:items-center sm:px-6 lg:px-8">
        <CakeSliceIcon
          className="mt-0.5 size-5 shrink-0 text-primary sm:mt-0"
          aria-hidden="true"
        />
        <p className="text-sm leading-6">
          <span className="font-medium">今天生日：</span>
          {birthdays.map((idol, index) => (
            <span
              key={idol.agency + "-" + idol.name}
              className="inline-flex items-center gap-1.5 font-semibold"
            >
              {index ? "、" : ""}
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: idol.color }}
                aria-hidden="true"
              />
              {idol.name}
            </span>
          ))}
        </p>
      </div>
    </aside>
  )
}
