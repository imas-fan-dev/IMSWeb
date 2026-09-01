import {
  CalendarDaysIcon,
  ContactRoundIcon,
  ExternalLinkIcon,
  MapPinIcon,
  UserRoundIcon,
} from "lucide-react"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { CoverImagePreview } from "~/components/shared/cover-image-preview"
import { Badge } from "~/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty"
import type { EditorialArticle, EditorialRelatedLink } from "~/lib/api"

const eventStatusLabels = {
  scheduled: "已排期",
  ongoing: "进行中",
  ended: "已结束",
  cancelled: "已取消",
} as const

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function legacyLinks(article: EditorialArticle): EditorialRelatedLink[] {
  const links = [
    article.registration_url
      ? { label: "报名 / 查看链接", url: article.registration_url }
      : null,
    article.source_url
      ? { label: "查看原页面", url: article.source_url }
      : null,
  ].filter((link): link is EditorialRelatedLink => Boolean(link))
  return links.filter(
    (link, index) => links.findIndex((item) => item.url === link.url) === index
  )
}

function EventFact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 gap-3">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="mt-1 text-sm/6 font-medium wrap-break-word">
          {children}
        </dd>
      </div>
    </div>
  )
}

function EditorialArticleBody({ html }: { html: string }) {
  return (
    <div
      className="text-[15px]/8 text-foreground sm:text-base [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:decoration-primary/45 [&_a]:underline-offset-3 [&_a]:transition-colors hover:[&_a]:decoration-primary [&_a:focus-visible]:rounded-sm [&_a:focus-visible]:ring-3 [&_a:focus-visible]:ring-ring/50 [&_a:focus-visible]:outline-none [&_blockquote]:my-7 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/60 [&_blockquote]:bg-muted/45 [&_blockquote]:px-5 [&_blockquote]:py-4 [&_blockquote]:text-muted-foreground [&_h2]:mt-12 [&_h2]:mb-5 [&_h2]:scroll-mt-24 [&_h2]:border-b [&_h2]:pb-3 [&_h2]:text-2xl/8 [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mt-9 [&_h3]:mb-4 [&_h3]:scroll-mt-24 [&_h3]:text-lg/7 [&_h3]:font-semibold [&_hr]:my-10 [&_hr]:border-border [&_img]:my-8 [&_img]:h-auto [&_img]:w-full [&_img]:rounded-xl [&_img]:border [&_img]:bg-muted [&_img]:object-contain [&_li]:pl-1 [&_ol]:my-6 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_p]:my-5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-6 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function RelatedLink({ link }: { link: EditorialRelatedLink }) {
  const className =
    "inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
  if (link.url.startsWith("/") && !link.url.startsWith("//")) {
    return (
      <NavigationLink href={link.url} className={className}>
        {link.label}
      </NavigationLink>
    )
  }
  return (
    <NavigationLink
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className={className}
    >
      {link.label}
      <ExternalLinkIcon aria-hidden="true" className="size-4" />
    </NavigationLink>
  )
}

export function CommunityPostDetail({
  article,
  showBackLink = false,
}: {
  article: EditorialArticle
  showBackLink?: boolean
}) {
  const kind = article.kind === "event" ? "event" : "notice"
  const title = article.title || "未命名社区动态"
  const summary = textValue(article.summary)
  const publisher = textValue(article.name)
  const publishedAt =
    textValue(article.published_at) ?? textValue(article.created_at)
  const coverUrl = textValue(article.cover_url) ?? textValue(article.image_url)
  const bodyHtml = textValue(article.body_html)
  const startAt = textValue(article.start_at)
  const endAt = textValue(article.end_at)
  const venueName = textValue(article.venue_name)
  const address = textValue(article.address)
  const contact = textValue(article.contact)
  const eventStatus = textValue(article.event_status)
  const statusLabel = eventStatus
    ? (eventStatusLabels[eventStatus as keyof typeof eventStatusLabels] ??
      eventStatus)
    : null
  const links = article.related_links.length
    ? article.related_links
    : legacyLinks(article)
  const hasEventFacts =
    kind === "event" &&
    Boolean(statusLabel || startAt || endAt || venueName || address || contact)
  const hasAside = hasEventFacts || links.length > 0

  return (
    <article className="mx-auto w-full max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-x-10">
      <div className="contents">
        <header className="lg:col-start-1">
          {showBackLink ? (
            <NavigationLink
              href="/events"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              返回社区动态
            </NavigationLink>
          ) : null}
          <div className={showBackLink ? "mt-7" : ""}>
            <Badge>{kind === "event" ? "具体活动" : "社区动态"}</Badge>
            <h1 className="mt-4 text-3xl/tight font-semibold tracking-tight sm:text-5xl">
              {title}
            </h1>
            {publisher || publishedAt ? (
              <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {publisher ? (
                  <span className="inline-flex items-center gap-1.5">
                    <UserRoundIcon aria-hidden="true" className="size-3.5" />
                    发布者：{publisher}
                  </span>
                ) : null}
                {publishedAt ? (
                  <span>发布于 {formatDateTime(publishedAt)}</span>
                ) : null}
              </p>
            ) : null}
            {summary ? (
              <p className="mt-6 max-w-4xl text-base/8 text-muted-foreground sm:text-lg/8">
                {summary}
              </p>
            ) : null}
          </div>
        </header>

        <section className="mt-9 min-w-0 rounded-xl border bg-card/85 p-4 shadow-sm sm:p-6 lg:col-start-1 lg:row-start-2">
          {coverUrl ? (
            <CoverImagePreview
              src={coverUrl}
              alt={`${title}封面`}
              previewLabel="文章封面"
              loading="eager"
              className="w-full rounded-lg border bg-muted"
              imageClassName="h-auto w-full object-contain"
            />
          ) : null}

          <div className={coverUrl ? "mt-8 px-1 sm:px-2" : "px-1 sm:px-2"}>
            {bodyHtml ? (
              <EditorialArticleBody html={bodyHtml} />
            ) : (
              <Empty className="min-h-40 border bg-muted/20">
                <EmptyHeader>
                  <EmptyTitle>暂无更多介绍</EmptyTitle>
                  <EmptyDescription>管理员尚未补充正文内容。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </section>
      </div>

      {hasAside ? (
        <aside className="mt-8 rounded-xl border bg-card/85 p-5 shadow-sm lg:sticky lg:top-24 lg:col-start-2 lg:row-start-2 lg:mt-9">
          {hasEventFacts ? (
            <section aria-labelledby="event-details-heading">
              <h2
                id="event-details-heading"
                className="text-base font-semibold"
              >
                活动信息
              </h2>
              <dl className="mt-5 space-y-5">
                {statusLabel ? (
                  <EventFact
                    icon={
                      <CalendarDaysIcon aria-hidden="true" className="size-4" />
                    }
                    label="活动状态"
                  >
                    {statusLabel}
                  </EventFact>
                ) : null}
                {startAt || endAt ? (
                  <EventFact
                    icon={
                      <CalendarDaysIcon aria-hidden="true" className="size-4" />
                    }
                    label={startAt ? "活动时间" : "结束时间"}
                  >
                    {startAt ? formatDateTime(startAt) : null}
                    {startAt && endAt ? <br /> : null}
                    {endAt
                      ? `${startAt ? "至 " : ""}${formatDateTime(endAt)}`
                      : null}
                  </EventFact>
                ) : null}
                {venueName || address ? (
                  <EventFact
                    icon={<MapPinIcon aria-hidden="true" className="size-4" />}
                    label="活动地点"
                  >
                    {[venueName, address].filter(Boolean).join("，")}
                  </EventFact>
                ) : null}
                {contact ? (
                  <EventFact
                    icon={
                      <ContactRoundIcon aria-hidden="true" className="size-4" />
                    }
                    label="联系方式"
                  >
                    <span className="wrap-break-word">{contact}</span>
                  </EventFact>
                ) : null}
              </dl>
            </section>
          ) : null}

          {links.length ? (
            <section
              className={hasEventFacts ? "mt-6 border-t pt-5" : ""}
              aria-labelledby="article-links-heading"
            >
              <h2
                id="article-links-heading"
                className="text-base font-semibold"
              >
                相关链接
              </h2>
              <div className="mt-4 space-y-2">
                {links.map((link, index) => (
                  <RelatedLink key={`${link.url}-${index}`} link={link} />
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      ) : null}
    </article>
  )
}
