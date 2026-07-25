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
import { cn } from "~/lib/utils"
import { getWorkEntry } from "~/pages/works/works-content"

interface WorkDetailProps {
  params: { workSlug: string }
}

export function meta({ params }: WorkDetailProps) {
  const entry = getWorkEntry(params.workSlug)
  return [{ title: `${entry?.title ?? "作品专题"} | IMSWeb` }]
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
        >
          <ArrowLeftIcon data-icon="inline-start" />
          返回作品中心
        </Button>
      </main>
    )
  }

  return (
    <main id="main-content">
      <section className="relative overflow-hidden border-b">
        <span
          className={cn("absolute inset-x-0 top-0 h-1.5", entry.accent)}
          aria-hidden="true"
        />
        <div className="mx-auto w-full max-w-5xl px-6 py-16">
          <Button variant="ghost" size="sm" render={<Link to="/works" />}>
            <ArrowLeftIcon data-icon="inline-start" />
            返回作品中心
          </Button>
          <p className="mt-10 text-sm font-semibold tracking-[0.2em] text-primary uppercase">
            {entry.eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            {entry.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            {entry.summary}
          </p>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-14 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-5 text-base leading-8">
          {entry.description.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>继续探索</CardTitle>
            <CardDescription>
              相关角色、剧情和卡片资料继续由 IMSWeb 资料库提供。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button render={<a href="/wiki/" />}>
              打开资料库
              <ArrowUpRightIcon data-icon="inline-end" />
            </Button>
            {entry.links?.map((link) => (
              <Button
                key={link.href}
                variant="outline"
                render={<a href={link.href} />}
              >
                {link.label}
                <ArrowUpRightIcon data-icon="inline-end" />
              </Button>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
