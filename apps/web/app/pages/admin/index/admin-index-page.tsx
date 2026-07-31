import {
  ArrowRightIcon,
  BookOpenTextIcon,
  CalendarDaysIcon,
  HistoryIcon,
  InfoIcon,
  LayoutDashboardIcon,
  MapPinnedIcon,
  NewspaperIcon,
  PackageOpenIcon,
} from "lucide-react"
import { Link } from "react-router"

import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { cn } from "~/lib/utils"
import { AdminPageHeader } from "~/pages/admin/components/admin-ui"

const workspaces = [
  {
    title: "首页板块",
    description: "维护首页导航、友情链接与网站支持",
    to: "/admin/homepage",
    icon: LayoutDashboardIcon,
    accent: "bg-franchise-sc",
    scope: ["站点导航", "友情链接", "网站支持"],
  },
  {
    title: "关于本站",
    description: "站点介绍、宣言与贡献名单",
    to: "/admin/about",
    icon: InfoIcon,
    accent: "bg-primary",
    scope: ["品牌信息", "站点概要", "贡献名单"],
  },
  {
    title: "制作人地图",
    description: "地区资料与制作人社群名录",
    to: "/admin/producer-map",
    icon: MapPinnedIcon,
    accent: "bg-franchise-sidem",
    scope: ["地图地区", "社群条目", "联络入口"],
  },
  {
    title: "活动内容",
    description: "外链、站内 HTML 与托管图片",
    to: "/admin/information",
    icon: CalendarDaysIcon,
    accent: "bg-franchise-cg",
    scope: ["外部链接", "站内 HTML", "图片托管"],
  },
  {
    title: "向您推荐",
    description: "首页推荐与封面",
    to: "/admin/recommendations",
    icon: NewspaperIcon,
    accent: "bg-franchise-ml",
    scope: ["推荐条目", "封面素材"],
  },
  {
    title: "页面包",
    description: "第三方 HTML 页面版本与发布",
    to: "/admin/site-packages",
    icon: PackageOpenIcon,
    accent: "bg-franchise-sidem",
    scope: ["隔离预览", "版本发布", "历史回滚"],
  },
  {
    title: "剧情内容",
    description: "原版剧情档案录入界面",
    to: "/admin/stories",
    icon: BookOpenTextIcon,
    accent: "bg-franchise-sc",
    scope: ["事务所", "角色素材", "对象存储"],
  },
  {
    title: "活动纪年",
    description: "活动图片审核",
    to: "/admin/chronicle",
    icon: HistoryIcon,
    accent: "bg-franchise-gk",
    scope: ["投稿审核", "活动图片"],
  },
]

export function meta() {
  return [{ title: "管理工作台 | IMSWeb" }]
}

export default function AdminIndex() {
  return (
    <div className="flex flex-col gap-7">
      <AdminPageHeader
        eyebrow="OPERATIONS"
        title="管理工作台"
        description="管理 IMSWeb 的公开内容与共同创作业务。"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{workspaces.length} 个业务入口</Badge>
        <Badge variant="outline">内容运营权限</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {workspaces.map((workspace) => (
          <Link
            key={workspace.to}
            to={workspace.to}
            className="group rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Card className="relative h-full min-h-52 transition-[box-shadow,transform] group-hover:-translate-y-0.5 group-hover:shadow-md">
              <span
                className={cn("absolute inset-x-0 top-0 h-1", workspace.accent)}
                aria-hidden="true"
              />
              <CardHeader>
                <span className="mb-2 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <workspace.icon className="size-5" aria-hidden="true" />
                </span>
                <CardTitle>{workspace.title}</CardTitle>
                <CardDescription className="leading-5">
                  {workspace.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {workspace.scope.map((item) => (
                  <Badge key={item} variant="outline">
                    {item}
                  </Badge>
                ))}
              </CardContent>
              <CardFooter className="mt-auto justify-between text-xs font-medium text-muted-foreground group-hover:text-foreground">
                进入工作区
                <ArrowRightIcon
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </CardFooter>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
