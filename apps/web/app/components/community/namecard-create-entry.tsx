import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import { Button } from "~/components/ui/button"
import { useNavigation } from "~/lib/navigation/use-navigation"

/**
 * 名片墙的「新建名片」入口。
 *
 * 名片墙本身是公开页面，但新建名片沿用个人中心的管理窗口：名片归属于当前帐号、
 * 审核通过后由本人维护，所以这里只做一次登录判断，游客引导去登录或注册。
 */
export function NamecardCreateEntry() {
  const platform = useOptionalPlatformSession()
  const navigate = useNavigation()

  function start() {
    if (platform.status === "authenticated") {
      navigate("/account/me/namecards?card=new")
      return
    }
    if (platform.status === "restricted") {
      toast.error("帐号当前受限，暂时无法新建名片")
      return
    }
    navigate("/account/login")
  }

  return (
    <Button
      type="button"
      size="icon"
      className="size-12 rounded-full shadow-lg shadow-primary/20 sm:w-auto sm:gap-2 sm:rounded-lg sm:px-5"
      aria-label="新建名片"
      title="新建名片"
      data-namecard-create-trigger
      onClick={start}
    >
      <PlusIcon className="size-5 sm:size-4" aria-hidden="true" />
      <span className="hidden sm:inline">新建名片</span>
    </Button>
  )
}
