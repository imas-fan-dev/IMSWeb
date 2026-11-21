import { useRequest } from "alova/client"
import { LayoutDashboardIcon } from "lucide-react"

import { getAdminSession, hasBackofficeSessionHint } from "~/lib/api"
import { buttonVariants } from "~/components/ui/button"
import { NavigationLink } from "~/components/navigation/navigation-link"

export function AdminReturnShortcut() {
  const shouldValidateSession = hasBackofficeSessionHint()
  const { data, error, onError } = useRequest(getAdminSession(), {
    immediate: shouldValidateSession,
  })
  onError(() => undefined)

  if (!shouldValidateSession || error || data?.user.dept !== "op") {
    return null
  }

  return (
    <NavigationLink
      to="/admin"
      className={buttonVariants({
        variant: "outline",
        size: "icon",
        className: "xl:w-auto xl:gap-1.5 xl:px-2.5",
      })}
      aria-label="返回管理工作台"
      title="返回管理工作台"
    >
      <LayoutDashboardIcon className="size-4" aria-hidden="true" />
      <span className="hidden xl:inline">管理工作台</span>
    </NavigationLink>
  )
}
