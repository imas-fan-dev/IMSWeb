import { ArrowLeftIcon, ArrowUpRightIcon } from "lucide-react"
import { Link } from "react-router"

import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { getWorkEntry } from "~/pages/works/works-content"

interface WorkDetailProps {
  params: { workSlug: string }
}

export function meta({ params }: WorkDetailProps) {
  const entry = getWorkEntry(params.workSlug)
  return [{ title: `${entry?.title ?? "作品专题"} | IMSWeb` }]
}

function WorkNavCard({ entry }: { entry: NonNullable<ReturnType<typeof getWorkEntry>> }) {
  const hasNav = (entry.navLinks?.length ?? 0) > 0
  const hasLinks = (entry.links?.length ?? 0) > 0

  if (!hasNav && !hasLinks) return null

  return (
    <>
      {/* Desktop: floating card */}
      <Card className="hidden lg:block fixed bottom-8 right-8 z-30 w-56 shadow-lg border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">探索 {entry.title}</CardTitle>
          <CardDescription className="text-xs">相关入口与资源</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {entry.navLinks?.map((navLink) => (
            <Button
              key={navLink.href}
              variant="ghost"
              size="sm"
              className="justify-start"
              render={<Link to={navLink.href} />}
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
              render={<a href={link.href} />}
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
            render={<Link to="/works" />}
            nativeButton={false}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            返回作品中心
          </Button>
        </CardContent>
      </Card>

      {/* Mobile: inline button group */}
      <div className="lg:hidden mt-10 flex flex-wrap gap-2">
        {entry.navLinks?.map((navLink) => (
          <Button
            key={navLink.href}
            variant="outline"
            size="sm"
            render={<Link to={navLink.href} />}
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
            render={<a href={link.href} />}
            nativeButton={false}
          >
            {link.label}
            <ArrowUpRightIcon data-icon="inline-end" />
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          render={<Link to="/works" />}
          nativeButton={false}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          返回作品中心
        </Button>
      </div>
    </>
  )
}

function FranchiseDetail({ entry }: { entry: NonNullable<ReturnType<typeof getWorkEntry>> }) {
  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col items-center gap-8 px-6 py-8 lg:flex-row lg:items-start lg:justify-between lg:px-[50px] lg:py-[100px]">
      {/* Character illustration — left side */}
      <div className="flex-1 flex justify-center">
        {entry.characterImage ? (
          <img
            src={entry.characterImage}
            alt={`${entry.title} 角色立绘`}
            className="w-full max-w-[250px] sm:max-w-[350px] lg:max-w-[500px] h-auto"
            loading="lazy"
          />
        ) : null}
      </div>

      {/* Text content — right side */}
      <div className="flex-[1.2] w-full lg:-translate-y-[8vw]">
        {/* Gradient titles — first line always "THE IDOLM@STER" */}
        <h1
          className="font-bold leading-none"
          style={{
            fontFamily: "'idolFont', 'Georgia', 'Noto Serif SC', 'PingFang SC', serif",
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
            className="font-bold leading-none mt-1"
            style={{
              fontFamily: "'idolFont', 'Georgia', 'Noto Serif SC', 'PingFang SC', serif",
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
          className="font-bold text-[#807C7B] leading-none mt-2"
          style={{ fontSize: "clamp(10px, 5vw, 25px)" }}
        >
          {entry.japaneseName}
        </p>

        {/* Tagline — skewed pills */}
        <div className="mt-6 flex flex-col gap-1.5">
          {entry.tagline.map((line) => (
            <span
              key={line}
              className="inline-block w-fit -skew-x-[10deg] px-4 py-2.5 font-bold text-white"
              style={{
                backgroundImage: `linear-gradient(${entry.gradient})`,
                fontSize: "clamp(15px, 5vw, 28px)",
              }}
            >
              <span className="inline-block skew-x-[10deg]">
                {line}
              </span>
            </span>
          ))}
        </div>

        {/* Since */}
        <div className="mt-8 lg:translate-y-[3vw]">
          <p
            className="italic font-bold"
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
        <div className="mt-4 lg:translate-y-[5vw]">
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
                className="inline-block rounded-md px-4 py-2.5 font-bold leading-relaxed"
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
    </section>
  )
}

export default function WorkDetailPage({ params }: WorkDetailProps) {
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
          render={<Link to="/works" />}
          nativeButton={false}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          返回作品中心
        </Button>
      </main>
    )
  }

  const isFranchise = entry.gradient !== ""

  return (
    <main id="main-content">
      {/* Idol font */}
      <style>{`
        @font-face {
          font-family: "idolFont";
          src: url("/assets/font/IrisIdol.ttf") format("truetype");
        }
      `}</style>

      {isFranchise ? (
        <>
          <FranchiseDetail entry={entry} />
          <section className="mx-auto w-full max-w-5xl px-6">
            <WorkNavCard entry={entry} />
          </section>
        </>
      ) : (
        <section className="mx-auto w-full max-w-5xl px-6 py-14">
          <p className="text-sm font-semibold tracking-[0.2em] text-primary uppercase">
            {entry.eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            {entry.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            {entry.summary}
          </p>
          <div className="mt-10 space-y-5 text-base leading-8">
            {entry.description.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <WorkNavCard entry={entry} />
        </section>
      )}
    </main>
  )
}
