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
} from "lucide-react"
import { useEffect } from "react"
import { Link, NavLink, Outlet, useNavigate } from "react-router"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { getAdminSession, logoutAdmin } from "~/features/admin/api"
import { cn } from "~/lib/utils"

const navigation = [
  { to: "/admin", label: "工作台", icon: HomeIcon, end: true },
  {
    to: "/admin/information",
    label: "活动内容",
    icon: CalendarDaysIcon,
  },
  {
    to: "/admin/recommendations",
    label: "向您推荐",
    icon: NewspaperIcon,
  },
  { to: "/admin/stories", label: "剧情内容", icon: BookOpenTextIcon },
  { to: "/admin/chronicle", label: "活动纪年", icon: HistoryIcon },
]

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    "group flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors hover:bg-muted",
    isActive ? "bg-muted text-primary" : "text-muted-foreground"
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
      <main className="flex min-h-svh items-center justify-center bg-muted/20">
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
    <div className="min-h-svh bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-[96rem] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/admin" className="flex min-w-0 items-center gap-3">
            <img
              src="/brand/imsweb-logo.png"
              width="545"
              height="188"
              alt="偶像大师交流站"
              className="h-8 w-auto max-w-36 object-contain"
            />
            <span className="hidden border-l pl-3 text-xs font-semibold text-muted-foreground sm:inline">
              管理工作台
            </span>
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:block">
              {data.user.producername || data.user.username}
            </span>
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

      <div className="mx-auto grid w-full max-w-[96rem] grid-cols-[minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="min-w-0 border-b bg-background lg:min-h-[calc(100svh-4rem)] lg:border-r lg:border-b-0">
          <nav
            className="flex max-w-full min-w-0 gap-1 overflow-x-auto p-3 lg:sticky lg:top-0 lg:flex-col lg:p-4"
            aria-label="管理业务"
          >
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={navClass}
              >
                <item.icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">{item.label}</span>
                <ChevronRightIcon
                  className="ml-auto hidden size-3 opacity-0 transition-opacity group-hover:opacity-100 lg:block"
                  aria-hidden="true"
                />
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
