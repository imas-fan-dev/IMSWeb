import AxeBuilder from "@axe-core/playwright"
import {
  catalogBirthdaysSchema,
  adminCatalogHttpErrorSchema,
} from "@imsweb/contracts/catalog"
import { createCatalogBirthdays } from "../../mocks/data/catalog"
import {
  homeSeededApis,
  installSeededPublicApis,
} from "./fixtures/public-content"
import { expect, test } from "./fixtures/test"

test("homepage birthday calendar and today notice render current role data without a style change @mobile", async ({
  page,
  api,
}, testInfo) => {
  await page.clock.install({ time: new Date("2026-07-23T12:00:00+08:00") })
  installSeededPublicApis(
    api,
    homeSeededApis.filter((r) => r.path !== "/api/birthdays")
  )
  const data = createCatalogBirthdays()
  data.items = data.items.filter((p) => p.month === 7 && p.day === 23)
  data.items[0].name = "档案中的最新姓名"
  api.expect({
    method: "GET",
    path: "/api/birthdays",
    responses: { 200: catalogBirthdaysSchema },
    handle: () => ({ json: data }),
  })
  await page.goto("/")
  await expect(page.getByLabel("今日生日")).toContainText("档案中的最新姓名")
  await expect(page.getByText("档案中的最新姓名", { exact: true })).toHaveCount(
    2
  )
  const calendar = page.locator('section[aria-labelledby="birthday-heading"]')
  await calendar.scrollIntoViewIfNeeded()
  await expect(page.getByText("已收录 2 位偶像")).toHaveText("已收录 2 位偶像")
  expect(await calendar.getAttribute("class")).toBe("border-y bg-muted/20")
  await expect(
    page.getByRole("button", { name: "7 月 23 日，2 位偶像生日" })
  ).toBeVisible()
  const axe = await new AxeBuilder({ page })
    .include('section[aria-labelledby="birthday-heading"]')
    .analyze()
  expect(
    axe.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    )
  ).toEqual([])
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
  ).toBe(false)
  await page.screenshot({
    path: testInfo.outputPath("catalog-birthday-calendar.png"),
    fullPage: false,
  })
})

test("birthday data can retry a failed request without displaying static fallback names @mobile", async ({
  page,
  api,
}) => {
  installSeededPublicApis(
    api,
    homeSeededApis.filter((r) => r.path !== "/api/birthdays")
  )
  let requests = 0
  api.expect({
    method: "GET",
    path: "/api/birthdays",
    responses: {
      200: catalogBirthdaysSchema,
      500: adminCatalogHttpErrorSchema,
    },
    times: 2,
    handle: () =>
      ++requests === 1
        ? { status: 500, json: { success: false, message: "unavailable" } }
        : { json: { success: true, items: [] } },
  })
  await page.goto("/")
  await page.getByRole("button", { name: "重试生日资料" }).click()
  await expect(page.getByText("已收录 0 位偶像")).toHaveText("已收录 0 位偶像")
  await expect(page.getByLabel("今日生日")).toHaveCount(0)
  await expect(page.getByText("这一天暂无收录的偶像生日。")).toBeVisible()
})
