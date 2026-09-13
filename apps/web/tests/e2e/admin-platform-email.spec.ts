import AxeBuilder from "@axe-core/playwright"

import { expect, test } from "./fixtures/test"
import { installAdminAuthMock } from "./fixtures/admin-auth"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"

const settings = {
  success: true,
  settings: {
    enabled: false,
    configured: true,
    host: "smtp.qiye.163.com",
    port: 465,
    security: "tls",
    usernameMasked: "ma***@texasoct.tech",
    passwordConfigured: true,
    fromAddress: "mail@texasoct.tech",
    fromName: "IMSWeb",
    resendCooldownSeconds: 60,
    updatedAt: 1_000,
  },
}

test.beforeEach(async ({ page, api }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
  })
  installEmptyWikiCatalogMock(api)
  await installAdminAuthMock(page, api, {
    user: {
      username: "super-operator",
      producername: "Super Operator",
      adminRole: "super_admin",
    },
  })
  await api.mockRoute(
    "**/api/admin/platform/email",
    (route) => route.fulfill({ status: 200, json: settings }),
    "GET"
  )
})

test("managed email policy is accessible without viewport overflow", async ({
  page,
}, testInfo) => {
  await page.goto("/admin/platform/email")

  await expect(
    page.getByRole("heading", { name: "邮件服务配置", exact: true })
  ).toBeVisible()
  const resendCooldown = page.getByRole("spinbutton", {
    name: "验证码重发间隔（秒）",
  })
  await expect(resendCooldown).toHaveValue("60")
  await expect(resendCooldown).toHaveAttribute("min", "30")
  await expect(resendCooldown).toHaveAttribute("max", "600")
  await expect(resendCooldown).toHaveAttribute("step", "1")
  await expect(page.getByText("当前密码已加密保存")).toBeVisible()

  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth > window.innerWidth,
    controls: [...document.querySelectorAll("input, button, [role='combobox']")]
      .filter((element) => {
        const style = window.getComputedStyle(element)
        return (
          element.getClientRects().length > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0 &&
          element.getAttribute("aria-hidden") !== "true" &&
          element.scrollWidth - element.clientWidth > 1
        )
      })
      .map((element) => element.id || element.textContent?.trim() || element.tagName),
  }))
  expect(overflow).toEqual({ page: false, controls: [] })

  const accessibility = await new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  expect(accessibility.violations).toEqual([])

  if (process.env.CAPTURE_PLATFORM_EMAIL_QA === "1") {
    await page.screenshot({
      path: `/tmp/imsweb-platform-email-${testInfo.project.name}.png`,
      fullPage: true,
    })
  }
})
