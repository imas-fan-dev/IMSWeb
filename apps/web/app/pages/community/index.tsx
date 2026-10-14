import { useEffect, useState } from "react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { PageShell } from "~/components/shared/page-shell"
import { Card, CardContent } from "~/components/ui/card"
import {
  getCommunityContent,
  getFudabaSeries,
  isApiError,
  resolveSafeMediaUrl,
  type CommunityContent,
} from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"
import { Button } from "~/components/ui/button"
import { ConfigurableLucideIcon } from "~/components/lucide-icon"
import { cn } from "~/lib/utils"

export function meta() {
  return [{ title: "制作人社区 | IMSWeb" }]
}

export default function Community() {
  const [content, setContent] = useState<CommunityContent | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [exchangeAvailability, setExchangeAvailability] = useState("checking")
  useEffect(() => {
    let active = true
    void getCommunityContent()
      .send()
      .then((value) => {
        if (active) setContent(value)
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [attempt])
  const sections =
    content?.entries.filter(
      (entry) =>
        entry.enabled &&
        (entry.audience === "all" ||
          entry.audience === (IS_APP_TARGET ? "app" : "web"))
    ) ?? []
  const needsExchange = sections.some(
    (entry) => entry.availability === "exchange"
  )
  useEffect(() => {
    if (!needsExchange) return
    let active = true
    void getFudabaSeries()
      .send()
      .then(() => {
        if (active) setExchangeAvailability("available")
      })
      .catch((error: unknown) => {
        if (active)
          setExchangeAvailability(
            isApiError(error) &&
              error.status === 404 &&
              error.payload === "Not Found"
              ? "closed"
              : "error"
          )
      })
    return () => {
      active = false
    }
  }, [needsExchange])
  const visibleSections = sections.filter(
    (entry) =>
      entry.availability !== "exchange" ||
      exchangeAvailability === "available" ||
      exchangeAvailability === "error"
  )
  return (
    <PageShell width="default">
      <h1
        className={cn(
          "font-semibold wrap-anywhere",
          IS_APP_TARGET ? "text-2xl" : "text-3xl"
        )}
      >
        {content?.title}
      </h1>
      <p
        className={cn(
          "leading-7 wrap-anywhere text-muted-foreground",
          IS_APP_TARGET ? "mt-2" : "mt-4"
        )}
      >
        {content?.introduction}
      </p>
      {needsExchange && exchangeAvailability === "checking" ? (
        <span role="status" className="sr-only">
          正在确认名片交换事务所
        </span>
      ) : null}

      {error ? (
        <div role="alert">
          无法读取社区内容。
          <Button
            onClick={() => {
              setError(false)
              setAttempt((value) => value + 1)
            }}
          >
            重试
          </Button>
        </div>
      ) : !content ? (
        <p role="status">正在读取社区内容</p>
      ) : null}
      <div
        className={cn(
          "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
          IS_APP_TARGET ? "mt-6" : "mt-10"
        )}
      >
        {visibleSections.map((section) => {
          const content = (
            <Card className="group h-full transition-colors hover:border-foreground/25 hover:bg-muted/30">
              <CardContent className="flex items-start gap-4 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                  {section.imageUrl ? (
                    <img
                      src={resolveSafeMediaUrl(section.imageUrl) ?? undefined}
                      alt=""
                      className="size-10 object-contain"
                    />
                  ) : (
                    <ConfigurableLucideIcon
                      name={section.icon}
                      className="size-5"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{section.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {section.description}
                  </span>
                </span>
              </CardContent>
            </Card>
          )

          return (
            <NavigationLink
              key={section.id}
              href={section.href}
              className="block rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {content}
            </NavigationLink>
          )
        })}
      </div>
    </PageShell>
  )
}
