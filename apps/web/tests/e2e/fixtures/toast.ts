import type { Page } from "@playwright/test"

import { expect } from "./test"

/**
 * Dismiss every mounted sonner toast and wait until none remain.
 *
 * The `Toaster` is pinned to the top-right on Web and to a full-width top strip
 * on narrow App viewports, so a toast thrown by the action just performed can
 * cover the account trigger or the App back button. A click that lands while
 * the toast is mounting is silently swallowed, which then surfaces much later
 * as a misleading "element not found" failure.
 *
 * Clicking the close button instead of waiting out sonner's 4s auto-dismiss
 * timer keeps the call well inside the zero-retry E2E budget; the App account
 * scenario used to spend roughly 8s of its 20s budget on two of those timers.
 *
 * One action can overlap an earlier toast: the exchange profile flow removes
 * the avatar and then saves the profile within a second, so the "avatar
 * removed" and "profile saved" toasts share the screen. Every toast is closed
 * here, because dismissing only the front one would leave the earlier toast to
 * fall back on the auto-dismiss timer it exists to avoid.
 *
 * A toast that is already leaving keeps its element for one exit animation and
 * is marked `data-removed`, so only live toasts are clicked. The close button
 * exists because the app `Toaster` sets `closeButton`; sonner renders none for
 * loading or custom-jsx toasts, so introducing one would fail here rather than
 * silently leave an overlay on screen.
 *
 * Call this only after the action that raises the toast has completed,
 * otherwise the call can pass during the window before the toast mounts.
 */
export async function settleToasts(page: Page): Promise<void> {
  const liveToasts = page.locator(
    '[data-sonner-toast]:not([data-removed="true"])'
  )

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await liveToasts.count()) === 0) break
    await liveToasts
      .first()
      .getByRole("button", { name: "Close toast" })
      .click()
  }

  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0)
}
