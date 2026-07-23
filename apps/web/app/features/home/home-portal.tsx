import { ArrowRightIcon, CakeSliceIcon, ExternalLinkIcon } from "lucide-react"

import { cn } from "~/lib/utils"
import { AnimatedBrandBackground } from "./animated-brand-background"
import { getBirthdaysOn } from "./birthday-data"
import { BirthdayCalendar } from "./birthday-calendar"
import { friendLinks, portalItems, seriesItems } from "./home-content"
import { HomeExtras } from "./home-extras"
import { HomeFeed } from "./home-feed"

function SeriesWall() {
  return (
    <section
      className="relative isolate overflow-hidden bg-neutral-950 text-white"
      aria-labelledby="home-heading"
    >
      <div
        className="grid h-[19rem] grid-cols-2 sm:h-80 sm:grid-cols-3 lg:flex lg:h-[28rem]"
        aria-label="偶像大师系列图片预览"
      >
        {seriesItems.map((series) => (
          <button
            key={series.name}
            type="button"
            aria-label={"预览 " + series.name + " 图片"}
            className={cn(
              "group relative min-w-0 cursor-pointer appearance-none overflow-hidden border-0 p-0 transition-[flex,filter] duration-500 focus-visible:z-20 focus-visible:ring-4 focus-visible:ring-white/85 focus-visible:outline-none motion-reduce:transition-none lg:flex-1 lg:hover:flex-[1.5] lg:focus:flex-[1.5]",
              series.background
            )}
          >
            <img
              src={series.image}
              alt=""
              width="585"
              height="500"
              draggable={false}
              className="pointer-events-none absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus:opacity-100 motion-reduce:transition-none"
            />
            <span
              className="absolute inset-0 bg-neutral-950/0 transition-colors duration-500 group-hover:bg-neutral-950/10 group-focus:bg-neutral-950/10 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </button>
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

function TodayBirthdayNotice() {
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

function PortalDirectory() {
  return (
    <section aria-labelledby="portal-heading">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-primary">DIRECTORY</p>
            <h2 id="portal-heading" className="mt-2 text-2xl font-semibold">
              站点导航
            </h2>
          </div>
          <p className="hidden text-sm text-muted-foreground sm:block">
            9 个原站业务入口
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {portalItems.map((item) => (
            <a
              key={item.title}
              href={item.href}
              className="group relative flex min-h-24 items-center gap-4 overflow-hidden rounded-md border bg-card px-5 py-4 transition-colors hover:border-foreground/25 hover:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span
                className={cn("absolute inset-y-0 left-0 w-1", item.accent)}
                aria-hidden="true"
              />
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                <item.icon className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {item.description}
                </span>
              </span>
              <ArrowRightIcon
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

function FriendLinks() {
  return (
    <section aria-labelledby="friends-heading">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-7">
          <p className="text-xs font-semibold text-primary">COMMUNITY LINKS</p>
          <h2 id="friends-heading" className="mt-2 text-2xl font-semibold">
            友情链接
          </h2>
        </div>
        <div className="grid gap-x-8 border-y sm:grid-cols-2 lg:grid-cols-3">
          {friendLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="group relative flex min-h-24 items-center gap-4 border-b px-4 py-5 transition-colors hover:bg-muted/35 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:px-5 [&:nth-last-child(-n+2)]:sm:border-b-0 [&:nth-last-child(-n+3)]:lg:border-b-0"
            >
              <span
                className={cn("h-9 w-1 shrink-0 rounded-full", link.accent)}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{link.title}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {link.description}
                </span>
              </span>
              <ExternalLinkIcon
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden="true"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

export function HomePortal() {
  return (
    <main id="main-content" className="relative isolate overflow-clip">
      <AnimatedBrandBackground />
      <div className="relative z-10">
        <SeriesWall />
        <TodayBirthdayNotice />
        <PortalDirectory />
        <HomeFeed />
        <BirthdayCalendar />
        <HomeExtras />
        <FriendLinks />
      </div>
    </main>
  )
}
