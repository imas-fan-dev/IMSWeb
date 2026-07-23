import {
  ArrowRightIcon,
  BookOpenTextIcon,
  CalendarDaysIcon,
  HistoryIcon,
  NewspaperIcon,
} from "lucide-react"
import { Link } from "react-router"

import { AdminPageHeader } from "~/features/admin/admin-ui"

const workspaces = [
  {
    title: "活动内容",
    description: "外链、站内 HTML 与托管图片",
    to: "/admin/information",
    icon: CalendarDaysIcon,
    accent: "bg-info",
  },
  {
    title: "向您推荐",
    description: "首页推荐与封面",
    to: "/admin/recommendations",
    icon: NewspaperIcon,
    accent: "bg-warning",
  },
  {
    title: "剧情内容",
    description: "原版剧情档案录入界面",
    to: "/admin/stories",
    icon: BookOpenTextIcon,
    accent: "bg-success",
  },
  {
    title: "活动纪年",
    description: "活动图片审核",
    to: "/admin/chronicle",
    icon: HistoryIcon,
    accent: "bg-pending",
  },
]

export function meta() {
  return [{ title: "管理工作台 | IMSWeb" }]
}

export default function AdminIndex() {
  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="OPERATIONS"
        title="管理工作台"
        description="管理 IMSWeb 的公开内容与共同创作业务。"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {workspaces.map((workspace) => (
          <Link
            key={workspace.to}
            to={workspace.to}
            className="group relative flex min-h-32 items-center gap-5 overflow-hidden rounded-md border bg-card px-5 py-6 transition-colors hover:border-foreground/25 hover:bg-muted/25 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span
              className={`absolute inset-y-0 left-0 w-1 ${workspace.accent}`}
              aria-hidden="true"
            />
            <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted">
              <workspace.icon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{workspace.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {workspace.description}
              </span>
            </span>
            <ArrowRightIcon
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </div>
  )
}
