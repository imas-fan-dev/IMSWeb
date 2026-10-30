import { useEffect } from "react"

import {
  blockNativeTabBarInteraction,
  suppressNativeTabBar,
} from "~/lib/native-tab-bar-suppression"

export function NativeTabBarSuppression({
  behavior = "hide",
}: {
  behavior?: "hide" | "block-interaction"
}) {
  useEffect(
    () =>
      behavior === "hide"
        ? suppressNativeTabBar()
        : blockNativeTabBarInteraction(),
    [behavior]
  )
  return null
}
