import { Gamepad2Icon, MapPinIcon, UsersIcon } from "lucide-react"
import { Link } from "react-router"

import { Card, CardContent } from "~/components/ui/card"

const communitySections = [
  {
    to: "/community/cards",
    icon: UsersIcon,
    title: "制作人名片墙",
    description: "浏览和上传制作人名片，展示你的担当与收藏。",
  },
  {
    to: "/producer-map",
    icon: MapPinIcon,
    title: "全国支部地图",
    description: "各地偶像大师社群一览，找到你身边的制作人同伴。",
  },
  {
    href: "/runninggame/",
    icon: Gamepad2Icon,
    title: "板板大暴走",
    description: "偶像大师同人游戏 — 板板大暴走，Unity WebGL 版。",
  },
] as const

export function meta() {
  return [{ title: "制作人社区 | IMSWeb" }]
}

export default function Community() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl px-6 py-16">
      <h1 className="text-3xl font-semibold">制作人社区</h1>
      <p className="mt-4 leading-7 text-muted-foreground">
        浏览制作人社群、名片与共同创作的社区内容。
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {communitySections.map((section) => {
          const content = (
            <Card className="group h-full transition-colors hover:border-foreground/25 hover:bg-muted/30">
              <CardContent className="flex items-start gap-4 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                  <section.icon className="size-5" aria-hidden="true" />
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

          if ("href" in section) {
            return (
              <a
                key={section.href}
                href={section.href}
                className="focus-visible:ring-3 block rounded-md focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {content}
              </a>
            )
          }

          return (
            <Link
              key={section.to}
              to={section.to}
              className="focus-visible:ring-3 block rounded-md focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {content}
            </Link>
          )
        })}
      </div>
    </main>
  )
}
