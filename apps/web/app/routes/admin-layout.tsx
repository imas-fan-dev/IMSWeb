import { useRequest } from "alova/client"
import {
  BookOpenTextIcon,
  CalendarDaysIcon,
  ChevronRightIcon,
  HistoryIcon,
  HomeIcon,
  LoaderCircleIcon,
  LogOutIcon,
  NewspaperIcon,
  PackageOpenIcon,
  UserRoundIcon,
} from "lucide-react"
import { useEffect } from "react"
import { Link, NavLink, Outlet, useNavigate } from "react-router"
import { toast } from "sonner"

import { Badge } from "~/components/ui/badge"
import { BrandWordmark } from "~/components/shared/brand-wordmark"
import { Button } from "~/components/ui/button"
import { getAdminSession, logoutAdmin } from "~/features/admin/api"
import { cn } from "~/lib/utils"

const navigation = [
  {
    to: "/admin",
    label: "工作台",
    description: "业务入口总览",
    icon: HomeIcon,
    accent: "bg-franchise-765",
    end: true,
  },
  {
    to: "/admin/information",
    label: "活动内容",
    description: "活动资讯与同人活动",
    icon: CalendarDaysIcon,
    accent: "bg-franchise-cg",
  },
  {
    to: "/admin/recommendations",
    label: "向您推荐",
    description: "首页推荐与封面",
    icon: NewspaperIcon,
    accent: "bg-franchise-ml",
  },
  {
    to: "/admin/site-packages",
    label: "页面包",
    description: "页面版本与发布",
    icon: PackageOpenIcon,
    accent: "bg-franchise-sidem",
  },
  {
    to: "/admin/stories",
    label: "剧情内容",
    description: "剧情角色素材",
    icon: BookOpenTextIcon,
    accent: "bg-franchise-sc",
  },
  {
    to: "/admin/chronicle",
    label: "活动纪年",
    description: "活动图片审核",
    icon: HistoryIcon,
    accent: "bg-franchise-gk",
  },
]

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    "group relative flex min-h-12 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none lg:min-h-14",
    isActive
      ? "bg-admin-ink-muted text-admin-ink-foreground"
      : "text-admin-ink-subtle hover:bg-admin-ink-muted hover:text-admin-ink-foreground"
  )
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const { data, loading, error, onError } = useRequest(getAdminSession())
  onError(() => undefined)

  useEffect(() => {
    if (error) {
      void navigate("/admin/login", { replace: true })
    }
  }, [error, navigate])

  if (loading || !data) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-5 bg-background">
        <div
          className="grid h-1 w-32 grid-cols-6 overflow-hidden rounded-full"
          aria-hidden="true"
        >
          <span className="bg-franchise-765" />
          <span className="bg-franchise-cg" />
          <span className="bg-franchise-ml" />
          <span className="bg-franchise-sidem" />
          <span className="bg-franchise-sc" />
          <span className="bg-franchise-gk" />
        </div>
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircleIcon
            className="size-4 animate-spin"
            aria-hidden="true"
          />
          正在验证管理会话
        </span>
      </main>
    )
  }

  async function logout() {
    try {
      await logoutAdmin().send()
    } catch {
      // Clear the local view even if the already-expired server session rejects.
    }
    toast.success("已退出管理工作台")
    void navigate("/admin/login", { replace: true })
  }

  return (
    <div className="min-h-svh bg-background">
      <div className="grid h-1 grid-cols-6" aria-hidden="true">
        <span className="bg-franchise-765" />
        <span className="bg-franchise-cg" />
        <span className="bg-franchise-ml" />
        <span className="bg-franchise-sidem" />
        <span className="bg-franchise-sc" />
        <span className="bg-franchise-gk" />
      </div>
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[100rem] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/admin" className="flex min-w-0 items-center gap-3">
            <BrandWordmark className="text-lg" />
            <span className="hidden border-l pl-3 text-xs font-semibold text-muted-foreground sm:inline">
              内容运营台
            </span>
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <Badge variant="outline" className="hidden max-w-52 sm:flex">
              <UserRoundIcon data-icon="inline-start" aria-hidden="true" />
              <span className="truncate">
                {data.user.producername || data.user.username}
              </span>
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void logout()}
            >
              <LogOutIcon data-icon="inline-start" />
              退出
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[100rem] grid-cols-[minmax(0,1fr)] lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="min-w-0 border-b bg-admin-ink text-admin-ink-foreground lg:min-h-[calc(100svh-4.25rem)] lg:border-r lg:border-b-0">
          <nav
            className="flex max-w-full min-w-0 gap-1 overflow-x-auto p-3 lg:sticky lg:top-16 lg:flex-col lg:gap-2 lg:p-5"
            aria-label="管理业务"
          >
            <div className="mb-3 hidden px-3 lg:block">
              <p className="text-[0.68rem] font-semibold text-admin-ink-subtle uppercase">
                IMSWEB OPERATIONS
              </p>
              <p className="mt-2 text-sm font-medium">内容中枢</p>
            </div>
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={navClass}
              >
                <span
                  className={cn(
                    "absolute inset-y-3 left-0 w-0.5 rounded-full opacity-0 transition-opacity group-aria-[current=page]:opacity-100",
                    item.accent
                  )}
                  aria-hidden="true"
                />
                <item.icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 whitespace-nowrap lg:flex lg:flex-col">
                  <span>{item.label}</span>
                  <span className="hidden text-[0.68rem] leading-4 font-normal text-admin-ink-subtle lg:block">
                    {item.description}
                  </span>
                </span>
                <ChevronRightIcon
                  className="ml-auto hidden size-3 opacity-50 transition-transform group-hover:translate-x-0.5 lg:block"
                  aria-hidden="true"
                />
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 bg-muted/20 px-4 py-7 sm:px-6 lg:px-8 lg:py-9 xl:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
