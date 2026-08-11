import { Link } from "react-router"

import { Card, CardContent } from "~/components/ui/card"
import { cn } from "~/lib/utils"
import {
  getWorkDestination,
  officialEntries,
  fanEntries,
} from "./works-content"

export function meta() {
  return [{ title: "系列作品 | IMSWeb" }]
}

export default function Works() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl px-6 py-16">
      <h1 className="text-3xl font-semibold">系列作品</h1>
      <p className="mt-4 leading-7 text-muted-foreground">
        偶像大师系列官方企划介绍，以及由制作人创作和维护的游戏与专题内容。
      </p>

      {/* 系列主要作品 */}
      <section aria-labelledby="official-heading" className="mt-10">
        <h2 id="official-heading" className="text-xl font-semibold">
          系列主要作品
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {officialEntries.map((entry) => (
            <Link
              key={entry.slug}
              to={getWorkDestination(entry)}
              aria-label={
                entry.wikiAgencyName
                  ? "进入剧情站"
                  : `查看 ${entry.title} 作品专题`
              }
              className="block rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Card className="group h-full transition-colors hover:border-foreground/25 hover:bg-muted/30">
                <div
                  className={cn("h-1 w-full rounded-t-xl", entry.accent)}
                  aria-hidden="true"
                />
                <CardContent className="p-5">
                  <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    {entry.eyebrow}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">{entry.title}</h2>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                    {entry.summary}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* TODO: 同人作品板块后续需支持独立提交、审核与展示逻辑 */}
      <section aria-labelledby="fan-heading" className="mt-12">
        <h2 id="fan-heading" className="text-xl font-semibold">
          同人作品
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          由制作人社区创作和维护的游戏、工具与专题内容。
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fanEntries.map((entry) => (
            <Link
              key={entry.slug}
              to={getWorkDestination(entry)}
              aria-label={
                entry.wikiAgencyName
                  ? "进入剧情站"
                  : `查看 ${entry.title} 作品专题`
              }
              className="block rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Card className="group h-full transition-colors hover:border-foreground/25 hover:bg-muted/30">
                <div
                  className={cn("h-1 w-full rounded-t-xl", entry.accent)}
                  aria-hidden="true"
                />
                <CardContent className="p-5">
                  <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    {entry.eyebrow}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">{entry.title}</h2>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                    {entry.summary}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
