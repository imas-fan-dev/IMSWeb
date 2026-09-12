import { ArrowLeftIcon, ArrowUpRightIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { IDOL_FONT_URL } from "~/pages/works/brand-assets"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { IS_APP_TARGET } from "~/lib/app-target"
import { cn } from "~/lib/utils"
import { getWorkDestination, getWorkEntry } from "~/pages/works/works-content"
import type { Route } from "./+types/work-detail-page"

export function meta({ params }: Route.MetaArgs) {
  const entry = getWorkEntry(params.workSlug)
  return [{ title: `${entry?.title ?? "作品专题"} | IMSWeb` }]
}

const workDetailMinHeight = IS_APP_TARGET
  ? "min-h-(--app-content-height)"
  : "min-h-[calc(100svh-4rem)]"

function WorkNavCard({
  entry,
}: {
  entry: NonNullable<ReturnType<typeof getWorkEntry>>
}) {
  const navLinks = entry.wikiAgencyName
    ? [{ label: "剧情站", href: getWorkDestination(entry) }]
    : (entry.navLinks ?? [])
  const hasNav = navLinks.length > 0
  const hasLinks = (entry.links?.length ?? 0) > 0

  if (!hasNav && !hasLinks) return null

  return (
    <>
      {/* Wide desktop: keep navigation in-flow so it cannot cover copy. */}
      <Card
        data-testid="work-nav-card"
        className="sticky top-24 hidden w-56 shrink-0 self-start border-border/60 shadow-lg 2xl:block"
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">探索 {entry.title}</CardTitle>
          <CardDescription className="text-xs">相关入口与资源</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {navLinks.map((navLink) => (
            <Button
              key={navLink.href}
              variant="ghost"
              size="sm"
              className="justify-start"
              render={<NavigationLink to={navLink.href} />}
              nativeButton={false}
            >
              {navLink.label}
            </Button>
          ))}
          {hasLinks ? <hr className="my-1 border-border/60" /> : null}
          {entry.links?.map((link) => (
            <Button
              key={link.href}
              variant="ghost"
              size="sm"
              className="justify-start"
              render={<NavigationLink href={link.href} />}
              nativeButton={false}
            >
              {link.label}
              <ArrowUpRightIcon data-icon="inline-end" />
            </Button>
          ))}
          <hr className="my-1 border-border/60" />
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            render={<NavigationLink to="/works" />}
            nativeButton={false}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            返回作品中心
          </Button>
        </CardContent>
      </Card>

      {/* Smaller viewports: give navigation its own full-width row. */}
      <div className="flex w-full basis-full flex-wrap gap-2 2xl:hidden">
        {navLinks.map((navLink) => (
          <Button
            key={navLink.href}
            variant="outline"
            size="sm"
            render={<NavigationLink to={navLink.href} />}
            nativeButton={false}
          >
            {navLink.label}
          </Button>
        ))}
        {entry.links?.map((link) => (
          <Button
            key={link.href}
            variant="outline"
            size="sm"
            render={<NavigationLink href={link.href} />}
            nativeButton={false}
          >
            {link.label}
            <ArrowUpRightIcon data-icon="inline-end" />
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          render={<NavigationLink to="/works" />}
          nativeButton={false}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          返回作品中心
        </Button>
      </div>
    </>
  )
}

function FranchiseDetail({
  entry,
}: {
  entry: NonNullable<ReturnType<typeof getWorkEntry>>
}) {
  return (
    <section
      className={cn(
        "relative mx-auto flex w-full max-w-400 flex-col items-center gap-8 overflow-hidden px-6 py-8 sm:py-12 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between lg:px-12.5 lg:py-16 xl:py-20",
        workDetailMinHeight
      )}
      data-testid="work-detail-franchise"
    >
      {/* On narrow screens, mirror About's ambient artwork treatment. */}
      <div className="pointer-events-none absolute inset-y-0 right-[-12%] w-[72%] overflow-hidden sm:right-[-8%] sm:w-[60%] lg:relative lg:inset-auto lg:flex lg:w-auto lg:flex-1 lg:justify-center lg:overflow-visible">
        {entry.characterImage ? (
          <img
            src={entry.characterImage}
            alt={`${entry.title} 角色立绘`}
            className="size-full object-contain object-bottom opacity-15 sm:opacity-20 lg:h-auto lg:max-w-125 lg:opacity-100"
            loading="lazy"
          />
        ) : null}
      </div>

      {/* Text content — right side */}
      <div
        data-testid="work-detail-copy"
        className="relative z-10 w-full flex-[1.2] lg:pt-2"
      >
        {/* Gradient titles — first line always "THE IDOLM@STER" */}
        <h1
          className="leading-none font-bold"
          style={{
            fontFamily:
              "'idolFont', 'Georgia', 'Noto Serif SC', 'PingFang SC', serif",
            fontSize:
              entry.slug === "765"
                ? "clamp(14px, 5vw, 65px)"
                : "clamp(8px, 5vw, 30px)",
            backgroundImage: `linear-gradient(${entry.gradient})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          THE IDOLM@STER
        </h1>
        {/* Second line: franchise name (765 has no second title in original) */}
        {entry.slug !== "765" ? (
          <h1
            className="mt-1 leading-none font-bold"
            style={{
              fontFamily:
                "'idolFont', 'Georgia', 'Noto Serif SC', 'PingFang SC', serif",
              fontSize: "clamp(14px, 5vw, 65px)",
              backgroundImage: `linear-gradient(${entry.gradient})`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {entry.title}
          </h1>
        ) : null}

        {/* Japanese name */}
        <p
          className="mt-2 leading-none font-bold text-[#807C7B]"
          style={{ fontSize: "clamp(10px, 5vw, 25px)" }}
        >
          {entry.japaneseName}
        </p>

        {/* Tagline — skewed pills */}
        <div className="mt-6 flex flex-col gap-1.5">
          {entry.tagline.map((line) => (
            <span
              key={line}
              className="inline-block w-fit skew-x-[-10deg] px-4 py-2.5 font-bold text-white"
              style={{
                backgroundImage: `linear-gradient(${entry.gradient})`,
                fontSize: "clamp(15px, 5vw, 28px)",
              }}
            >
              <span className="inline-block skew-x-10">{line}</span>
            </span>
          ))}
        </div>

        {/* Since */}
        <div className="mt-8">
          <p
            className="font-bold italic"
            style={{
              fontSize: "clamp(10px, 5vw, 42px)",
              color: entry.gradient
                ? `${entry.gradient.split(",")[1]?.trim()}80`
                : undefined,
            }}
          >
            Since {entry.since}
          </p>
        </div>

        {/* 企划概要 */}
        <div className="mt-8">
          <h2
            className="text-center font-bold"
            style={{
              fontSize: "clamp(10px, 5vw, 25px)",
              color: "#6C575C",
            }}
          >
            企划概要
          </h2>
          <div className="mt-3 flex flex-col gap-1.5">
            {entry.description.map((paragraph) => (
              <span
                key={paragraph}
                className="inline-block rounded-md px-4 py-2.5 leading-relaxed font-bold"
                style={{
                  backgroundColor: entry.introBg || undefined,
                  color: "#817C7D",
                  fontSize: "clamp(6px, 5vw, 18px)",
                }}
              >
                {paragraph}
              </span>
            ))}
          </div>
        </div>
      </div>

      <WorkNavCard entry={entry} />
    </section>
  )
}

export default function WorkDetailPage({ params }: Route.ComponentProps) {
  const entry = getWorkEntry(params.workSlug)

  if (!entry) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-4xl px-6 py-20">
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-3 text-3xl font-semibold">没有找到这个作品专题</h1>
        <p className="mt-4 text-muted-foreground">
          链接可能已经调整，或专题尚未完成迁移。
        </p>
        <Button
          className="mt-8"
          variant="outline"
          render={<NavigationLink to="/works" />}
          nativeButton={false}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          返回作品中心
        </Button>
      </main>
    )
  }

  const isFranchise = entry.category === "official"

  return (
    <main
      id="main-content"
      className={cn(
        "relative isolate scroll-mt-16 overflow-x-clip",
        workDetailMinHeight
      )}
    >
      {/* Idol font */}
      <style>{`
        @font-face {
          font-family: "idolFont";
          src: url("${IDOL_FONT_URL}") format("truetype");
          font-display: swap;
        }
      `}</style>

      <div
        className={cn("relative z-10", workDetailMinHeight)}
        data-testid="work-detail-surface"
      >
        {isFranchise ? (
          <FranchiseDetail entry={entry} />
        ) : (
          <section className="mx-auto w-full max-w-5xl px-6 py-14">
            <p className="text-sm font-semibold tracking-[0.2em] text-primary uppercase">
              {entry.eyebrow}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              {entry.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg/8 text-muted-foreground">
              {entry.summary}
            </p>
            <div className="mt-10 space-y-5 text-base/8">
              {entry.description.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <WorkNavCard entry={entry} />
          </section>
        )}
      </div>
    </main>
  )
}
