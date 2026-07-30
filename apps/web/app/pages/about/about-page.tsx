import { useRequest } from "alova/client"
import { ArrowUpRightIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react"
import type { CSSProperties } from "react"

import { SeriesAccentStrip } from "~/components/shared/series-accent-strip"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { getAboutPageContent } from "~/lib/api"
import type { AboutGroup, AboutPerson } from "~/lib/api"

const groupAccents = [
  {
    stripe: "bg-franchise-sidem",
    surface: "bg-franchise-sidem/5 dark:bg-franchise-sidem/10",
    text: "text-franchise-sidem",
  },
  {
    stripe: "bg-franchise-765",
    surface: "bg-franchise-765/5 dark:bg-franchise-765/10",
    text: "text-franchise-765",
  },
  {
    stripe: "bg-franchise-sc",
    surface: "bg-franchise-sc/5 dark:bg-franchise-sc/10",
    text: "text-franchise-sc",
  },
  {
    stripe: "bg-franchise-cg",
    surface: "bg-franchise-cg/5 dark:bg-franchise-cg/10",
    text: "text-franchise-cg",
  },
] as const

const titleGradientStyle: CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, var(--about-accent-start), color-mix(in srgb, var(--about-accent-end) 72%, var(--about-accent-start)))",
}

const highlightGradientStyle: CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, color-mix(in srgb, var(--about-accent-start) 42%, transparent), color-mix(in srgb, var(--about-accent-end) 82%, transparent))",
}

const overviewGradientStyle: CSSProperties = {
  backgroundImage:
    "linear-gradient(135deg, color-mix(in srgb, var(--about-accent-start) 18%, transparent), color-mix(in srgb, var(--about-accent-end) 68%, transparent))",
}

const sinceGradientStyle: CSSProperties = {
  color: "color-mix(in srgb, var(--about-accent-start) 48%, var(--foreground))",
}

type AboutAccentStyle = CSSProperties & {
  "--about-accent-start": string
  "--about-accent-end": string
}

export function meta() {
  return [{ title: "关于我们 | IMSWeb" }]
}

function AboutLoading() {
  return (
    <main
      id="main-content"
      className="flex min-h-[65svh] items-center justify-center px-4 py-16"
    >
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
        正在读取关于本站
      </p>
    </main>
  )
}

function PersonCard({
  person,
  groupIndex,
}: {
  person: AboutPerson
  groupIndex: number
}) {
  const accent = groupAccents[groupIndex % groupAccents.length]

  return (
    <article
      className={`group relative overflow-hidden rounded-lg border bg-card/95 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-sm motion-reduce:transform-none motion-reduce:transition-none ${accent.surface}`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-1 ${accent.stripe}`}
        aria-hidden="true"
      />
      <div className="grid min-h-32 grid-cols-[auto_minmax(0,1fr)] items-center gap-4 py-5 pr-5 pl-6 sm:gap-x-6 sm:py-6 sm:pr-6 sm:pl-8 md:grid-cols-[5rem_minmax(0,1fr)_12rem]">
        {person.avatarUrl ? (
          <img
            src={person.avatarUrl}
            alt={`${person.name}的头像`}
            className="size-16 shrink-0 rounded-full border-2 border-background object-cover shadow-sm sm:size-20"
            width={128}
            height={128}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted text-lg font-semibold shadow-sm sm:size-20">
            {person.name.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-lg font-semibold wrap-break-word sm:text-xl">
            {person.name}
          </h3>
          <p className="mt-2 text-sm/6 wrap-break-word text-muted-foreground sm:text-base">
            {person.description || "感谢为本站提供帮助。"}
          </p>
        </div>
        <div className="col-span-2 flex min-w-0 items-center justify-between gap-4 border-t border-foreground/10 pt-4 md:col-span-1 md:block md:border-t-0 md:border-l md:pt-0 md:pl-6">
          <div>
            <p className={`text-sm font-semibold ${accent.text}`}>
              {person.role}
            </p>
            {person.since ? (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {person.since}
              </p>
            ) : null}
          </div>
          {person.profileUrl ? (
            <a
              href={person.profileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:mt-4"
            >
              访问个人主页
              <ArrowUpRightIcon className="size-4" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function PeopleGroup({
  group,
  groupIndex,
}: {
  group: AboutGroup
  groupIndex: number
}) {
  const accent = groupAccents[groupIndex % groupAccents.length]

  return (
    <section
      className="border-t py-12 sm:py-16"
      aria-labelledby={`about-${group.id}`}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center sm:mb-10">
          <p className={`text-xs font-semibold uppercase ${accent.text}`}>
            {group.subtitle || "IMSWeb"}
          </p>
          <h2 id={`about-${group.id}`} className="mt-2 text-2xl font-semibold">
            {group.title}
          </h2>
          <span
            className={`mx-auto mt-4 block h-1 w-10 rounded-full ${accent.stripe}`}
            aria-hidden="true"
          />
        </div>
        {group.people.length ? (
          <div className="space-y-4">
            {group.people.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                groupIndex={groupIndex}
              />
            ))}
          </div>
        ) : (
          <p className="text-center text-sm/6 text-muted-foreground">
            本分组名单暂未公开。
          </p>
        )}
      </div>
    </section>
  )
}

export default function About() {
  const {
    data,
    loading,
    error,
    send: refresh,
    onError,
  } = useRequest(getAboutPageContent())
  onError(() => undefined)

  if (loading && !data) return <AboutLoading />

  if (error || !data) {
    return (
      <main
        id="main-content"
        className="mx-auto flex min-h-[65svh] w-full max-w-3xl items-center px-4 py-16 sm:px-6"
      >
        <Alert variant="destructive">
          <AlertTitle>关于本站暂时无法显示</AlertTitle>
          <AlertDescription className="mt-2 flex flex-col items-start gap-4">
            <span>{error?.message || "未能读取关于页配置。"}</span>
            <Button type="button" variant="outline" onClick={() => refresh()}>
              <RefreshCwIcon data-icon="inline-start" />
              重新加载
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  return (
    <main id="main-content" className="relative isolate overflow-clip">
      <div className="relative z-10">
        <section
          className="relative overflow-hidden border-b"
          aria-labelledby="about-title"
          style={
            {
              "--about-accent-start": data.accentColorStart,
              "--about-accent-end": data.accentColorEnd,
            } as AboutAccentStyle
          }
        >
          {data.heroImageUrl ? (
            <div className="pointer-events-none absolute inset-y-0 right-[-12%] w-[72%] overflow-hidden sm:right-[-8%] sm:w-[60%] lg:top-12 lg:right-auto lg:left-0 lg:w-[44%]">
              <img
                src={data.heroImageUrl}
                alt={data.heroImageAlt}
                className="size-full object-contain object-bottom opacity-15 sm:opacity-20 lg:opacity-100"
                style={{
                  transform: `translate(${data.heroImageOffsetX}%, ${data.heroImageOffsetY}%) scale(${data.heroImageScale / 100})`,
                  transformOrigin: "center bottom",
                }}
                width={1377}
                height={4383}
                decoding="async"
                fetchPriority="high"
              />
            </div>
          ) : null}
          <div className="relative mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:min-h-244 lg:px-8 lg:py-20">
            <div className="relative z-10 max-w-2xl lg:ml-[44%]">
              <h1
                id="about-title"
                className="bg-clip-text text-4xl/tight font-semibold text-transparent sm:text-5xl lg:text-6xl"
                style={titleGradientStyle}
              >
                {data.siteName}
              </h1>
              {data.siteNameEn ? (
                <p className="mt-4 text-base font-semibold text-muted-foreground sm:text-xl">
                  {data.siteNameEn}
                </p>
              ) : null}
              <div className="mt-10 space-y-3">
                {[data.welcome, ...data.manifesto].map(
                  (line: string, index: number) => (
                    <p key={`${index}-${line}`}>
                      <span
                        className="inline-block px-4 py-2 text-base/7 font-semibold sm:text-lg"
                        style={highlightGradientStyle}
                      >
                        {line}
                      </span>
                    </p>
                  )
                )}
              </div>
              <p
                className="mt-9 text-right text-3xl font-semibold italic sm:text-4xl"
                style={sinceGradientStyle}
              >
                Since{data.sinceYear}
              </p>
              <div className="mt-12 sm:mt-16">
                <h2
                  id="about-overview"
                  className="text-center text-2xl font-semibold"
                >
                  {data.overviewTitle}
                </h2>
                <div
                  className="mt-4 space-y-4 rounded-md p-5 text-sm/7 text-muted-foreground sm:px-6 sm:text-base/8"
                  style={overviewGradientStyle}
                >
                  {data.overview.map((paragraph: string, index: number) => (
                    <p key={`${index}-${paragraph}`}>{paragraph}</p>
                  ))}
                  <p className="border-t border-franchise-sidem/20 pt-4 font-medium text-foreground/75">
                    {data.tagline}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <SeriesAccentStrip
            className="h-1.5"
            data-testid="series-accent-strip"
          />
        </section>

        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          {data.groups.map((group: AboutGroup, groupIndex: number) => (
            <PeopleGroup key={group.id} group={group} groupIndex={groupIndex} />
          ))}
        </div>
      </div>
    </main>
  )
}
