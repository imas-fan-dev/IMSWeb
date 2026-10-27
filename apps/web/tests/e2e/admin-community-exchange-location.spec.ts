import AxeBuilder from "@axe-core/playwright"
import type { AdminOfficeReview, UpdateFudabaOfficeInput } from "~/lib/api"
import {
  makeAdminOfficeReview,
  makeFudabaOwnerOffice,
  makeFudabaSeries,
} from "../../mocks/data/fudaba"
import { expect, test } from "./fixtures/test"
import { installAdminAuthMock } from "./fixtures/admin-auth"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"

function pending(): AdminOfficeReview {
  return makeAdminOfficeReview({
    office: makeFudabaOwnerOffice({
      id: "office-e2e",
      name: "成都交换事务所",
      city: "成都市",
      address: "天府二街123号",
      revision: 2,
      location: {
        latitude: 30.552371337165454,
        longitude: 104.04275126443116,
        precision: "exact",
      },
      coverUrl: null,
      pendingCoverUrl: null,
    }),
    owner: {
      id: "platform-owner-e2e",
      email: "producer@ims.test",
      displayName: "提交人昵称",
    },
  })
}

test.beforeEach(async ({ page, api }) => {
  await installEmptyWikiCatalogMock(api, { min: 0, max: 8 })
  await page.addInitScript(() =>
    localStorage.setItem("imsweb.language", "zh-CN")
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
  await installAdminAuthMock(page, api, {
    csrfToken: "office-review-e2e",
    sessionTimes: { min: 1, max: 3 },
    user: {
      id: 17,
      username: "review-admin",
      producername: "审核员昵称",
      adminRole: "super_admin",
    },
  })
})

test.describe("admin whole-office review", () => {
  test("edits a shared office dialog, checks an exact map, approves a revision and locates its user @mobile", async ({
    page,
    api,
  }, info) => {
    let current = pending()
    const updates: UpdateFudabaOfficeInput[] = [],
      decisions: unknown[] = []
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await api.mock(
      {
        method: "GET",
        path: "/api/admin/community/exchange/offices",
        times: { min: 1, max: 5 },
      },
      (route) => {
        const state = new URL(route.request().url()).searchParams.get("state")
        return route.fulfill({
          json: {
            items: current.office.reviewState === state ? [current] : [],
          },
        })
      }
    )
    await api.mock(
      {
        method: "GET",
        path: "/api/admin/community/exchange/offices/office-e2e",
        times: 1,
      },
      (route) => route.fulfill({ json: { item: current } })
    )
    await api.mock(
      {
        method: "GET",
        path: "/api/admin/community/exchange/office-series",
        times: 1,
      },
      (route) => route.fulfill({ json: { items: [makeFudabaSeries()] } })
    )
    await api.mock(
      {
        method: "GET",
        path: "/api/admin/community/exchange/map/config",
        times: 1,
      },
      (route) =>
        route.fulfill({
          json: {
            provider: "maplibre",
            search: { provider: "nominatim" },
            styleUrl: "/maps/exchange-test-style.json",
          },
        })
    )
    await api.mock(
      {
        method: "PUT",
        path: "/api/admin/community/exchange/offices/office-e2e",
        times: 1,
      },
      (route) => {
        const body = route.request().postDataJSON() as UpdateFudabaOfficeInput
        updates.push(body)
        expect(body.expectedRevision).toBe(2)
        expect(route.request().headers()["x-csrftoken"]).toBe(
          "office-review-e2e"
        )
        current = {
          ...current,
          reviewer: null,
          office: {
            ...current.office,
            name: body.name,
            intro: body.intro,
            city: body.city,
            address: body.address,
            accent: body.accent,
            isOpen: body.isOpen,
            seriesCodes: body.seriesCodes,
            location: {
              latitude: body.latitude,
              longitude: body.longitude,
              precision: "exact",
            },
            reviewState: "pending",
            revision: 3,
            reviewedBy: null,
            reviewedAt: null,
            reviewNote: "",
          },
        }
        return route.fulfill({ json: { success: true, item: current } })
      }
    )
    await api.mock(
      {
        method: "PUT",
        path: "/api/admin/community/exchange/offices/office-e2e/review",
        times: 2,
      },
      (route) => {
        const body = route.request().postDataJSON()
        decisions.push(body)
        const withdrawing = decisions.length === 2
        expect(body).toEqual(
          withdrawing
            ? { decision: "withdraw", expectedRevision: 5, note: "" }
            : {
                decision: "publish",
                expectedRevision: 3,
                note: "信息与地图已核对",
              }
        )
        current = {
          ...current,
          office: {
            ...current.office,
            reviewState: withdrawing ? "pending" : "published",
            revision: withdrawing ? 7 : 5,
            reviewedBy: withdrawing ? null : 17,
            reviewedAt: withdrawing ? null : "2026-10-27T01:00:00.000Z",
            reviewNote: body.note,
          },
          reviewer: withdrawing
            ? null
            : {
                id: 17,
                username: "review-admin",
                displayName: "审核员昵称",
              },
        }
        return route.fulfill({ json: { success: true, item: current } })
      }
    )
    const user = {
      id: current.owner.id,
      displayName: current.owner.displayName!,
      email: current.owner.email,
      status: "active",
      hasPassword: true,
      activeSessionCount: 1,
      lastLoginAt: null,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    }
    await api.mock(
      { method: "GET", path: `/api/admin/platform/users/${user.id}`, times: 1 },
      (route) =>
        route.fulfill({
          json: {
            success: true,
            user: {
              ...user,
              oauthLinks: [
                {
                  provider: "github",
                  providerName: "GitHub",
                  enabled: true,
                  accountName: "producer",
                  avatarUrl: null,
                  linkedAt: 1700000000000,
                  removable: true,
                },
              ],
            },
          },
        })
    )
    await api.mock(
      { method: "GET", path: "/api/admin/platform/users", times: 1 },
      (route) => {
        const query = new URL(route.request().url()).searchParams
        expect(query.get("field")).toBe("id")
        expect(query.get("query")).toBe(user.id)
        expect(query.has("highlight")).toBe(false)
        return route.fulfill({
          json: {
            success: true,
            users: [user],
            pageInfo: {
              page: 1,
              pageSize: 20,
              total: 1,
              totalPages: 1,
              hasNextPage: false,
            },
          },
        })
      }
    )
    await page.goto("/admin/community/exchange")
    await expect(
      page.getByRole("heading", { name: "事务所审核", exact: true })
    ).toBeVisible()
    await expect(page.getByRole("textbox", { name: "事务所名称" })).toHaveCount(
      0
    )
    await expect(
      page.getByRole("link", { name: "producer@ims.test" })
    ).toBeVisible()
    expect(
      (
        await new AxeBuilder({ page })
          .setLegacyMode()
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze()
      ).violations
    ).toEqual([])
    await page.screenshot({
      path: info.outputPath("admin-office-entries.png"),
      fullPage: true,
    })
    await page.getByRole("button", { name: "查看详情" }).click()
    const dialog = page.getByRole("dialog", { name: /事务所详情|编辑资料/ })
    await expect(dialog.getByRole("textbox", { name: "详细地址" })).toHaveCount(
      0
    )
    await expect(dialog.getByText(/天府二街123号/)).toBeVisible()
    await expect(
      dialog.getByText("30.552371337165454", { exact: true })
    ).toBeVisible()
    await dialog.screenshot({
      path: info.outputPath("admin-office-details.png"),
    })
    const userHref = (await dialog
      .getByRole("link", { name: /用户管理/ })
      .getAttribute("href"))!
    await dialog.getByRole("button", { name: "producer@ims.test" }).click()
    await expect(page.getByText("GitHub", { exact: true })).toBeVisible()
    await expect(
      page.getByRole("button", { name: "解绑", exact: true })
    ).toHaveCount(0)
    await page.getByRole("button", { name: "关闭", exact: true }).click()
    await dialog.getByRole("button", { name: "编辑资料" }).click()
    await dialog
      .getByRole("textbox", { name: "事务所名称" })
      .fill("后台修订事务所")
    await dialog.getByRole("textbox", { name: "详细地址" }).fill("新街道456号")
    await dialog.getByRole("textbox", { name: "纬度" }).fill("30.552916273641")
    await expect(
      dialog.getByRole("button", { name: "通过并发布" })
    ).toHaveCount(0)
    await dialog
      .getByRole("textbox", { name: "详细地址" })
      .scrollIntoViewIfNeeded()
    await dialog.screenshot({
      path: info.outputPath("admin-office-shared-editor.png"),
    })
    await dialog.getByRole("button", { name: "保存并提交审核" }).click()
    await expect(dialog.getByText(/修改已保存并进入待审核/)).toBeVisible()
    await dialog.getByRole("button", { name: "在地图中查看" }).click()
    const map = page.getByRole("dialog", { name: "事务所坐标预览" })
    await expect(map.locator("[data-map-state=ready]")).toBeVisible()
    await expect(map.locator(".maplibregl-marker")).toHaveCount(1)
    await expect(map.locator("[data-map-point-picker]")).toHaveCount(0)
    await expect(map.getByText(/30\.552916273641/)).toBeVisible()
    await expect(map.getByText(/新街道456号/)).toBeVisible()
    await map.screenshot({
      path: info.outputPath("admin-office-exact-map.png"),
    })
    await map.getByRole("button", { name: "关闭地图" }).click()
    await dialog
      .getByRole("textbox", { name: /审核备注/ })
      .fill("信息与地图已核对")
    await dialog.getByRole("button", { name: "通过并发布" }).click()
    await expect(dialog.getByText(/整体审核已通过/)).toBeVisible()
    await dialog
      .getByText("review-admin", { exact: true })
      .scrollIntoViewIfNeeded()
    await dialog.screenshot({
      path: info.outputPath("admin-office-reviewed-identity.png"),
    })
    expect(updates).toHaveLength(1)
    expect(decisions).toHaveLength(1)
    await expect(
      dialog.getByRole("button", { name: "通过并发布" })
    ).toHaveCount(0)
    await dialog.getByRole("button", { name: "撤回发布" }).click()
    await expect(dialog.getByText("确认撤回发布？")).toBeVisible()
    expect(decisions).toHaveLength(1)
    await dialog.getByRole("button", { name: "确认撤回" }).click()
    await expect(dialog.getByText(/已撤回发布，事务所已停止公开/)).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: "通过并发布" })
    ).toBeEnabled()
    await dialog.screenshot({
      path: info.outputPath("admin-office-withdrawn.png"),
    })
    expect(decisions).toHaveLength(2)
    await dialog.getByRole("button", { name: "关闭", exact: true }).click()
    await page.goto(userHref)
    const row = page.locator('tr[data-highlighted="true"]')
    await expect(row).toContainText("提交人昵称")
    await expect(row).toContainText("producer@ims.test")
    await page.screenshot({
      path: info.outputPath("admin-office-linked-user.png"),
      fullPage: true,
    })
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    ).toBe(true)
    expect(errors).toEqual([])
  })

  test("keeps conflicting edits until latest reload and rejects with a fresh reason @mobile", async ({
    page,
    api,
  }, info) => {
    let current = pending()
    let saveCount = 0
    current.owner.email = null
    await api.mock(
      {
        method: "GET",
        path: "/api/admin/community/exchange/offices",
        times: { min: 1, max: 3 },
      },
      (route) =>
        route.fulfill({
          json: {
            items: current.office.reviewState === "pending" ? [current] : [],
          },
        })
    )
    await api.mock(
      {
        method: "GET",
        path: "/api/admin/community/exchange/offices/office-e2e",
        times: 2,
      },
      (route) => route.fulfill({ json: { item: current } })
    )
    await api.mock(
      {
        method: "GET",
        path: "/api/admin/community/exchange/office-series",
        times: 2,
      },
      (route) => route.fulfill({ json: { items: [makeFudabaSeries()] } })
    )
    await api.mock(
      {
        method: "PUT",
        path: "/api/admin/community/exchange/offices/office-e2e",
        times: 2,
      },
      (route) => {
        saveCount += 1
        if (saveCount === 2) {
          const body = route.request().postDataJSON() as UpdateFudabaOfficeInput
          expect(body.expectedRevision).toBe(5)
          expect(body.address).toBe("补全后的地址123号")
          current = {
            ...current,
            reviewer: null,
            office: {
              ...current.office,
              address: body.address,
              reviewState: "pending",
              revision: 6,
              reviewedBy: null,
              reviewedAt: null,
              reviewNote: "",
            },
          }
          return route.fulfill({ json: { success: true, item: current } })
        }
        current = {
          ...current,
          office: {
            ...current.office,
            address: "其他窗口的新地址",
            revision: 3,
          },
        }
        return route.fulfill({
          status: 409,
          json: { success: false, code: "FUDABA_OFFICE_CONFLICT", revision: 3 },
        })
      }
    )
    await api.mock(
      {
        method: "PUT",
        path: "/api/admin/community/exchange/offices/office-e2e/review",
        times: 1,
      },
      (route) => {
        expect(route.request().postDataJSON()).toEqual({
          decision: "reject",
          expectedRevision: 3,
          note: "门牌信息不全",
        })
        current = {
          ...current,
          reviewer: { id: 17, username: null, displayName: "审核员昵称" },
          office: {
            ...current.office,
            reviewState: "rejected",
            reviewedBy: 17,
            reviewedAt: "2026-10-27T01:00:00.000Z",
            reviewNote: "门牌信息不全",
            revision: 5,
          },
        }
        return route.fulfill({ json: { success: true, item: current } })
      }
    )
    await page.goto("/admin/community/exchange")
    await page.getByRole("button", { name: "编辑", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: /事务所详情|编辑资料/ })
    await dialog
      .getByRole("textbox", { name: "详细地址" })
      .fill("保留的手工地址")
    await dialog.getByRole("button", { name: "保存并提交审核" }).click()
    await expect(dialog.getByText(/输入已保留/)).toBeVisible()
    await expect(dialog.getByRole("textbox", { name: "详细地址" })).toHaveValue(
      "保留的手工地址"
    )
    await expect(
      dialog.getByRole("button", { name: "通过并发布" })
    ).toHaveCount(0)
    await dialog.getByRole("button", { name: "载入最新事务所" }).click()
    await expect(dialog.getByRole("textbox", { name: "详细地址" })).toHaveValue(
      "其他窗口的新地址"
    )
    await dialog.getByRole("button", { name: "取消编辑" }).click()
    await dialog.getByRole("button", { name: "拒绝", exact: true }).click()
    await expect(
      dialog.getByText("拒绝事务所时必须填写审核理由。")
    ).toBeVisible()
    await dialog.getByRole("textbox", { name: /审核备注/ }).fill("门牌信息不全")
    await dialog.getByRole("button", { name: "拒绝", exact: true }).click()
    await expect(dialog.getByText("事务所已拒绝，当前不公开。")).toBeVisible()
    await expect(dialog.getByText("审核员昵称", { exact: true })).toBeVisible()
    await dialog
      .getByText("审核未通过", { exact: true })
      .scrollIntoViewIfNeeded()
    await dialog.screenshot({
      path: info.outputPath("admin-office-rejection.png"),
    })
    await expect(
      dialog.getByRole("button", { name: "通过并发布" })
    ).toHaveCount(0)
    await dialog.getByRole("button", { name: "修改并重新提交" }).click()
    await dialog
      .getByRole("textbox", { name: "详细地址" })
      .fill("补全后的地址123号")
    await dialog.getByRole("button", { name: "保存并提交审核" }).click()
    await expect(dialog.getByText(/修改已保存并进入待审核/)).toBeVisible()
    await expect(dialog.getByText("待审核", { exact: true })).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: "通过并发布" })
    ).toBeEnabled()
    await dialog.screenshot({
      path: info.outputPath("admin-office-resubmitted.png"),
    })
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    ).toBe(true)
  })
})
