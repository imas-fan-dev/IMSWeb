import { useCallback } from "react"
import { useNavigate, type NavigateOptions } from "react-router"
import { toast } from "sonner"

import type { NavigationTarget } from "~/lib/navigation/navigation-target"
import { resolveNavigation } from "~/lib/navigation/resolve-navigation"
import {
  openSystemUrl,
  shouldUseSystemOpener,
} from "~/lib/navigation/system-opener"

export interface NavigationFunction {
  (to: NavigationTarget, options?: NavigateOptions): void
  (delta: number): void
}

export function useNavigation(): NavigationFunction {
  const routerNavigate = useNavigate()
  const navigate = useCallback(
    (target: NavigationTarget | number, options?: NavigateOptions): void => {
      if (typeof target === "number") {
        routerNavigate(target)
        return
      }

      const decision = resolveNavigation(target)
      if (decision.kind === "router") {
        routerNavigate(decision.to, options)
        return
      }
      if (decision.kind === "unavailable") return

      if (decision.kind === "system" && shouldUseSystemOpener()) {
        void openSystemUrl(decision.href).catch(() => {
          toast.error("无法打开链接，请检查系统浏览器设置后重试。")
        })
        return
      }

      if (options?.replace) {
        window.location.replace(decision.href)
      } else {
        window.location.assign(decision.href)
      }
    },
    [routerNavigate]
  )

  return navigate as NavigationFunction
}
