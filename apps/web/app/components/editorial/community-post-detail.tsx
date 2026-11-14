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

function articleBody(value: string) {
  const html = textValue(value)
  if (!html) return null
  // This only detects empty editor output; HTML sanitization remains API-owned.
  const text = html
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:nbsp|#0*160|#x0*a0);/gi, " ")
    .trim()
  return text || /<(?:img|hr)\b/i.test(html) ? html : null
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
    // The editorial API sanitizes body_html with an allowlist before it crosses
    // this shared public and admin-preview boundary.
    <div
      data-testid="editorial-article-body"
      className="max-w-full min-w-0 text-base/8 tracking-normal wrap-anywhere text-foreground/90 **:max-w-full *:first:mt-0 *:last:mb-0 sm:text-[17px]/8 [&_a]:font-medium [&_a]:break-all [&_a]:text-primary [&_a]:underline [&_a]:decoration-primary/45 [&_a]:underline-offset-4 [&_a]:transition-colors hover:[&_a]:decoration-primary [&_a:focus-visible]:rounded-sm [&_a:focus-visible]:ring-3 [&_a:focus-visible]:ring-ring/50 [&_a:focus-visible]:outline-none [&_blockquote]:my-6 [&_blockquote]:rounded-r-lg [&_blockquote]:border-l-2 [&_blockquote]:border-primary/45 [&_blockquote]:bg-muted/60 [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-muted-foreground [&_blockquote_p]:my-2 [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.875em] [&_code]:break-all [&_code]:whitespace-pre-wrap [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:scroll-mt-24 [&_h2]:text-xl/8 [&_h2]:font-semibold [&_h2]:text-foreground sm:[&_h2]:text-2xl/9 [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:scroll-mt-24 [&_h3]:text-lg/7 [&_h3]:font-semibold [&_h3]:text-foreground [&_hr]:my-8 [&_hr]:border-border [&_img]:mx-auto [&_img]:my-6 [&_img]:block [&_img]:size-auto [&_img]:rounded-lg [&_img]:object-contain sm:[&_img]:my-8 [&_li]:pl-1 [&_li_p]:my-2 [&_li::marker]:text-muted-foreground [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_ol_ol]:my-2 [&_ol_ul]:my-2 [&_p]:my-5 sm:[&_p]:my-6 [&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-sm/6 [&_pre]:whitespace-pre [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:break-normal [&_pre_code]:whitespace-pre [&_pre_code]:text-inherit [&_strong]:font-semibold [&_strong]:text-foreground [&_table]:my-6 [&_table]:block [&_table]:border-collapse [&_table]:overflow-x-auto [&_table]:text-sm/6 [&_td]:border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_ul]:my-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ul_ol]:my-2 [&_ul_ul]:my-2"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function RelatedLink({
  link,
  primary = false,
}: {
  link: EditorialRelatedLink
  primary?: boolean
}) {
  const className = `inline-flex min-h-11 min-w-0 w-full items-center justify-center gap-2 break-all rounded-md border px-4 py-2.5 text-center text-sm/6 font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${primary ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-muted"}`
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
      <ExternalLinkIcon aria-hidden="true" className="size-4 shrink-0" />
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
  const bodyHtml = articleBody(article.body_html)
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
  const isLinkOnly = !bodyHtml && links.length > 0
  const hasAsideLinks = !isLinkOnly && links.length > 0
  const hasAside = hasEventFacts || hasAsideLinks

  return (
    <article
      className={`mx-auto w-full min-w-0 lg:grid lg:items-start lg:gap-x-10 ${hasAside ? "max-w-6xl lg:grid-cols-[minmax(0,1fr)_18rem]" : "max-w-3xl"}`}
    >
      <div className="contents">
        <header className="min-w-0 lg:col-start-1">
          {showBackLink ? (
            <NavigationLink
              href="/events"
              className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              返回社区动态
            </NavigationLink>
          ) : null}
          <div className={showBackLink ? "mt-5 sm:mt-6" : ""}>
            <Badge>{kind === "event" ? "具体活动" : "社区动态"}</Badge>
            <h1 className="mt-3 text-2xl/snug font-semibold tracking-normal wrap-anywhere sm:text-[2rem]/snug">
              {title}
            </h1>
            {publisher || publishedAt ? (
              <p className="mt-4 flex flex-col gap-x-4 gap-y-1 text-sm/6 text-muted-foreground sm:flex-row sm:flex-wrap">
                {publisher ? (
                  <span className="inline-flex min-w-0 items-center gap-1.5 wrap-anywhere">
                    <UserRoundIcon
                      aria-hidden="true"
                      className="size-3.5 shrink-0"
                    />
                    发布者：{publisher}
                  </span>
                ) : null}
                {publishedAt ? (
                  <span>发布于 {formatDateTime(publishedAt)}</span>
                ) : null}
              </p>
            ) : null}
            {summary ? (
              <p className="mt-5 border-l-2 border-primary/30 pl-4 text-base/8 wrap-anywhere text-muted-foreground">
                {summary}
              </p>
            ) : null}
          </div>
        </header>

        <section className="mt-6 min-w-0 rounded-xl border border-border/60 bg-card/95 p-4 sm:mt-8 sm:p-8 lg:col-start-1 lg:row-start-2">
          {isLinkOnly ? (
            <section
              aria-labelledby="article-links-heading"
              className={
                coverUrl
                  ? "mb-5 border-b border-border/60 pb-5 sm:mb-6 sm:pb-6"
                  : undefined
              }
            >
              <h2
                id="article-links-heading"
                className="text-sm font-medium text-muted-foreground"
              >
                查看详情
              </h2>
              <div
                className={`mt-3 grid gap-2 ${links.length > 1 ? "sm:grid-cols-2" : ""}`}
              >
                {links.map((link, index) => (
                  <RelatedLink
                    key={`${link.url}-${index}`}
                    link={link}
                    primary={index === 0}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {coverUrl ? (
            <CoverImagePreview
              src={coverUrl}
              alt={`${title}封面`}
              previewLabel="文章封面"
              loading="eager"
              className="w-full rounded-lg bg-muted"
              imageClassName="h-auto w-full object-contain"
            />
          ) : null}

          {!isLinkOnly ? (
            <div className={coverUrl ? "mt-6 sm:mt-8" : undefined}>
              {bodyHtml ? (
                <EditorialArticleBody html={bodyHtml} />
              ) : (
                <Empty className="min-h-40 border bg-muted/20">
                  <EmptyHeader>
                    <EmptyTitle>暂无更多介绍</EmptyTitle>
                    <EmptyDescription>
                      管理员尚未补充正文内容。
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          ) : null}
        </section>
      </div>

      {hasAside ? (
        <aside className="mt-6 min-w-0 rounded-xl border border-border/60 bg-card/95 p-5 sm:mt-8 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-2">
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
                    <span className="break-all">{contact}</span>
                  </EventFact>
                ) : null}
              </dl>
            </section>
          ) : null}

          {hasAsideLinks ? (
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
