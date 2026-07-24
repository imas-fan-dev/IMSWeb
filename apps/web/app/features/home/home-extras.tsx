import {
  ArrowUpRightIcon,
  ExternalLinkIcon,
  ShuffleIcon,
  SparklesIcon,
} from "lucide-react"
import { useRequest } from "alova/client"
import { useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import { cn } from "~/lib/utils"
import { birthdays } from "./birthday-data"
import type { BirthdayRecord } from "./birthday-data"
import { getHomeInformation } from "./api"
import { supportLinks } from "./home-content"

function isExternalLink(href: string) {
  return href.startsWith("http://") || href.startsWith("https://")
}

function ActivityHighlights() {
  const { data, loading, error, onError } = useRequest(getHomeInformation(), {
    initialData: { cards: [] },
  })
  onError(() => undefined)
  const items = data.cards.map((card) => ({
    category: card.category === "activity" ? "活动资讯" : "同人活动",
    title: card.title,
    href: card.link,
    image: card.image,
  }))

  return (
    <section
      className="border-y bg-muted/20"
      aria-labelledby="highlights-heading"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-7">
          <p className="text-xs font-semibold text-primary">SPOTLIGHTS</p>
          <h2 id="highlights-heading" className="mt-2 text-2xl font-semibold">
            活动资讯与同人活动
          </h2>
        </div>
        {loading ? (
          <div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="正在加载活动资讯"
          >
            {[0, 1, 2].map((item) => (
              <div key={item} className="overflow-hidden rounded-md border">
                <Skeleton className="aspect-[16/9] w-full" />
                <div className="space-y-2 px-4 py-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <Alert>
            <AlertTitle>活动资讯暂时不可用</AlertTitle>
            <AlertDescription>稍后刷新即可重新获取。</AlertDescription>
          </Alert>
        ) : items.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const external = isExternalLink(item.href)
              return (
                <a
                  key={item.href + item.title}
                  href={item.href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noreferrer" : undefined}
                  className="group overflow-hidden rounded-md border bg-card transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="block aspect-[16/9] overflow-hidden bg-muted">
                    <img
                      src={item.image}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
                    />
                  </span>
                  <span className="flex min-h-20 items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-primary">
                        {item.category}
                      </span>
                      <span className="mt-1 block font-medium">
                        {item.title}
                      </span>
                    </span>
                    <ArrowUpRightIcon
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </span>
                </a>
              )
            })}
          </div>
        ) : (
          <p className="border-y py-8 text-sm text-muted-foreground">
            当前没有已发布的活动资讯。
          </p>
        )}
      </div>
    </section>
  )
}

function idolWikiHref(idol: BirthdayRecord) {
  const idolName = idol.name === "伴田路子" ? "Roco" : idol.name
  return (
    "/wiki/story?agency=" +
    encodeURIComponent(idol.agency) +
    "&idol=" +
    encodeURIComponent(idolName)
  )
}

function RandomIdol() {
  const [selectedIdol, setSelectedIdol] = useState<BirthdayRecord | null>(null)

  function selectRandomIdol() {
    const index = Math.floor(Math.random() * birthdays.length)
    setSelectedIdol(birthdays[index] ?? null)
  }

  return (
    <section aria-labelledby="random-idol-heading">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.72fr)] lg:px-8">
        <div className="flex flex-col justify-center">
          <p className="text-xs font-semibold text-primary">IDOL PICK</p>
          <h2 id="random-idol-heading" className="mt-2 text-2xl font-semibold">
            随机担当
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
            从完整生日资料中随机选择一位偶像，并进入对应剧情资料页。
          </p>
        </div>

        <div className="flex min-h-52 flex-col justify-between rounded-md border bg-card p-6">
          <div
            className="flex min-h-24 items-center justify-center text-center"
            aria-live="polite"
          >
            {selectedIdol ? (
              <div>
                <span
                  className="mx-auto mb-4 block size-3 rounded-full"
                  style={{ backgroundColor: selectedIdol.color }}
                  aria-hidden="true"
                />
                <a
                  href={idolWikiHref(selectedIdol)}
                  className="text-2xl font-semibold hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {selectedIdol.name}
                </a>
                <p className="mt-2 text-sm text-muted-foreground">
                  {selectedIdol.agency}
                </p>
              </div>
            ) : (
              <div className="text-muted-foreground">
                <SparklesIcon
                  className="mx-auto mb-3 size-7"
                  aria-hidden="true"
                />
                等待抽取今日的随机担当
              </div>
            )}
          </div>
          <Button
            type="button"
            className="mt-5 w-full"
            onClick={selectRandomIdol}
          >
            <ShuffleIcon data-icon="inline-start" />
            随机选择
          </Button>
        </div>
      </div>
    </section>
  )
}

function SiteSupport() {
  return (
    <section className="border-t" aria-labelledby="support-heading">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-7">
          <p className="text-xs font-semibold text-primary">SITE SUPPORT</p>
          <h2 id="support-heading" className="mt-2 text-2xl font-semibold">
            网站支持
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {supportLinks.map((link) => (
            <a
              key={link.title}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="group flex min-h-24 items-center gap-4 rounded-md border bg-card px-5 py-4 transition-colors hover:bg-muted/35 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span
                className={cn("h-9 w-1 shrink-0 rounded-full", link.accent)}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{link.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {link.description}
                </span>
              </span>
              <ExternalLinkIcon
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

export function HomeExtras() {
  return (
    <>
      <ActivityHighlights />
      <RandomIdol />
      <SiteSupport />
    </>
  )
}
