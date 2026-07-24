import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

test("admin login is usable and accessible", async ({ page }) => {
  await page.goto("/admin/login")

  await expect(
    page.getByRole("heading", { name: "内容管理工作台" })
  ).toBeVisible()
  await expect(page.getByRole("heading", { name: "管理登录" })).toBeVisible()

  const password = page.getByLabel("密码", { exact: true })
  await expect(password).toHaveAttribute("type", "password")
  await page.getByRole("button", { name: "显示密码" }).click()
  await expect(password).toHaveAttribute("type", "text")
  await expect(page.getByRole("button", { name: "隐藏密码" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )

  const results = await new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()

  expect(results.violations).toEqual([])
})
