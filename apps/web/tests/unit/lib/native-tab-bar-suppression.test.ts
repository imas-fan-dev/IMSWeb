import { describe, expect, it } from "vitest"

import {
  isNativeTabBarSuppressed,
  nativeTabBarSuppressed,
  NATIVE_TAB_BAR_SUPPRESSION_EVENT,
  suppressNativeTabBar,
} from "~/lib/native-tab-bar-suppression"

describe("native tab bar suppression", () => {
  it("waits for every modal surface before restoring the tab bar", () => {
    const suppressionStates: boolean[] = []
    const handleSuppression = (event: Event) => {
      const suppressed = nativeTabBarSuppressed(event)
      if (suppressed !== null) suppressionStates.push(suppressed)
    }
    window.addEventListener(NATIVE_TAB_BAR_SUPPRESSION_EVENT, handleSuppression)

    const releaseFirst = suppressNativeTabBar()
    const releaseSecond = suppressNativeTabBar()
    expect(isNativeTabBarSuppressed()).toBe(true)

    releaseFirst()
    expect(isNativeTabBarSuppressed()).toBe(true)
    releaseSecond()
    releaseSecond()

    expect(isNativeTabBarSuppressed()).toBe(false)
    expect(suppressionStates).toEqual([true, false])
    window.removeEventListener(
      NATIVE_TAB_BAR_SUPPRESSION_EVENT,
      handleSuppression
    )
  })
})
