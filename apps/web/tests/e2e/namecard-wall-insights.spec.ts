import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "./fixtures/test"
import {
  mockNamecardBrowsing,
  mockWallContributors,
  expectNamecardNoOverflow,
} from "./fixtures/namecard-browsing"

for (const theme of ["light", "dark"] as const) {
  test(`maintenance progress and complete contributor dialog ${theme} @mobile`, async ({
    page,
    api,
  }, testInfo) => {
    await page.addInitScript((theme) => {
      localStorage.setItem("imsweb.wall-insights.collapsed", "0")
      localStorage.setItem("theme", theme)
    }, theme)
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" })
    const contributors = Array.from({ length: 26 }, (_, index) => ({
      accountId: `contributor-${index}`,
      displayName:
        index === 0
          ? "ZheiZhei"
          : index === 1
            ? "TexasOct"
            : `一起维护名片的制作人 ${index + 1}`,
      points: 52 - index,
      cards: 26 - index,
    }))
    await mockNamecardBrowsing(
      page,
      api,
      12,
      undefined,
      { cards: 1, reactionReads: 12, reactionWrites: 0 },
      {
        guestTotal: 831,
        ownerless: 830,
        ownerlessMissingSeries: 827,
        claimed: 1,
        claimsPending: 0,
        supplemented: 4,
        supplementsPending: 0,
        contributors: contributors.slice(0, 5),
        viewer: {
          accountId: "contributor-1",
          displayName: "TexasOct",
          points: 51,
          rank: 2,
        },
      }
    )
    mockWallContributors(api, contributors)
    await page.goto("/community/cards")
    const panel = page.getByRole("region", { name: "名片墙维护进度" })
    await expect(panel.getByText("0.1%", { exact: true })).toBeVisible()
    await expect(panel.getByText("0.5%", { exact: true })).toBeVisible()
    await expect(panel.getByRole("listitem")).toHaveCount(3)
    await expectNamecardNoOverflow(page)
    await expect(page.locator("html")).toHaveClass(new RegExp(theme))
    await page.screenshot({
      path: testInfo.outputPath(`panel-${theme}.png`),
      fullPage: false,
    })
    const trigger = panel.getByRole("button", { name: "完整榜单" })
    await trigger.click()
    const dialog = page.getByRole("dialog", { name: "名片墙贡献榜" })
    await expect(dialog.getByRole("listitem")).toHaveCount(25)
    await expect(dialog.getByText("共 26 位 · 1 / 2 页")).toBeVisible()
    const accessibility = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze()
    expect(accessibility.violations).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`dialog-${theme}.png`) })
    await dialog.getByRole("button", { name: "下一页" }).click()
    await expect(dialog.getByText("一起维护名片的制作人 26")).toBeVisible()
    await expect(dialog.getByRole("listitem")).toHaveCount(1)
    await expect(dialog.getByRole("button", { name: "下一页" })).toBeDisabled()
    await page.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
  })
}
