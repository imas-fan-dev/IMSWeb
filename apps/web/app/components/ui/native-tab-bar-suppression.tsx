import { useEffect } from "react"

import { suppressNativeTabBar } from "~/lib/native-tab-bar-suppression"

export function NativeTabBarSuppression() {
  useEffect(() => suppressNativeTabBar(), [])
  return null
}
