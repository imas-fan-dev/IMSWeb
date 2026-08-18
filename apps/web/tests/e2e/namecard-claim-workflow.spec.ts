import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

const FRONT_IMAGE = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
const BACK_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIABAAAAAP///ywAAAAAAQABAAACAkQBADs="

const catalog = {
  status: "success",
  agencies: [
    {
      id: 1,
      code: "765",
      name: "765PRO",
      color: "#f34e6c",
      bannerTitle: "765PRO",
      iconUrl: null,
      idolCount: 1,
      entryCount: 1,
      imageTransform: {
        fit: "cover",
        focalX: 0.5,
        focalY: 0.5,
        zoom: 1,
        rotation: 0,
      },
    },
    {
      id: 2,
      code: "cg",
      name: "灰姑娘女孩",
      color: "#2581c7",
      bannerTitle: "CINDERELLA GIRLS",
      iconUrl: null,
      idolCount: 1,
      entryCount: 1,
      imageTransform: {
        fit: "cover",
        focalX: 0.5,
        focalY: 0.5,
        zoom: 1,
        rotation: 0,
      },
    },
  ],
  searchEntries: [
    {
      id: 1,
      name: "天海春香",
      agencyId: 1,
      agencyCode: "765",
      agencyName: "765PRO",
      agencyColor: "#f34e6c",
      entryKind: "idol",
      entrySubtype: null,
    },
    {
      id: 2,
      name: "涩谷凛",
      agencyId: 2,
      agencyCode: "cg",
      agencyName: "灰姑娘女孩",
      agencyColor: "#2581c7",
      entryKind: "idol",
      entrySubtype: null,
    },
  ],
  selection: null,
}

const favoriteIdol = { id: 1, name: "天海春香", seriesCode: "765" }

async function mockAnonymousPlatformSession(page: Page) {
  await page.route("**/api/platform/auth/session", async (route) => {
    await route.fulfill({
      status: 401,
      json: { success: false, code: "PLATFORM_AUTH_REQUIRED" },
    })
  })
}

async function mockPlatformSession(page: Page) {
  await page.context().addCookies([
    {
      name: "ims_platform_csrf",
      value: "claim-workflow-csrf",
      domain: "127.0.0.1",
      path: "/",
    },
  ])
  await page.route("**/api/platform/auth/session", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        account: { id: "platform-claimant", status: "active" },
        profile: {
          displayName: "认领测试制作人",
          avatarUrl: null,
          homeCity: "上海",
          bio: "",
        },
      },
    })
  })
}

test("anonymous visitors do not see the legacy-card claim action", async ({
  page,
}) => {
  await mockAnonymousPlatformSession(page)
  await page.route("**/api/cards**", async (route) => {
    await route.fulfill({
      json: {
        list: [
          {
            id: 42,
            seriesCode: "765",
            favoriteIdols: [favoriteIdol],
            claimStatus: "unclaimed",
            viewerClaimState: null,
            image1_url: FRONT_IMAGE,
            image2_url: BACK_IMAGE,
            image1_thumbnail_url: FRONT_IMAGE,
            image2_thumbnail_url: BACK_IMAGE,
            status: "approved",
            created_at: "2026-08-16T19:30:00.000Z",
          },
        ],
        total: 1,
        totalPage: 1,
      },
    })
  })
  await page.route("**/api/reactions**", async (route) => {
    await route.fulfill({ json: {} })
  })

  await page.goto("/community/cards")
  await expect(
    page.getByRole("button", { name: "查看制作人名片 42 正面" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "认领这张旧名片" })
  ).toHaveCount(0)
})

test("registered user submits a legacy-card claim from the public wall", async ({
  page,
}, testInfo) => {
  await mockPlatformSession(page)
  const consoleErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("pageerror", (error) => consoleErrors.push(error.message))

  await page.route("**/api/wiki/catalog**", async (route) => {
    await route.fulfill({ json: catalog })
  })
  await page.route("**/api/community/exchange/me/cards", async (route) => {
    await route.fulfill({ json: { items: [] } })
  })
  await page.route("**/api/cards**", async (route) => {
    await route.fulfill({
      json: {
        list: [
          {
            id: 42,
            seriesCode: "765",
            favoriteIdols: [favoriteIdol],
            claimStatus: "unclaimed",
            viewerClaimState: null,
            image1_url: FRONT_IMAGE,
            image2_url: BACK_IMAGE,
            image1_thumbnail_url: FRONT_IMAGE,
            image2_thumbnail_url: BACK_IMAGE,
            status: "approved",
            created_at: "2026-08-16T19:30:00.000Z",
          },
        ],
        total: 1,
        totalPage: 1,
      },
    })
  })
  await page.route("**/api/reactions**", async (route) => {
    await route.fulfill({ json: {} })
  })

  let submitted:
    | { body: Record<string, unknown>; csrf: string | undefined }
    | undefined
  await page.route(
    "**/api/community/exchange/legacy-cards/42/claims",
    async (route) => {
      submitted = {
        body: route.request().postDataJSON() as Record<string, unknown>,
        csrf: route.request().headers()["x-csrftoken"],
      }
      await route.fulfill({
        status: 201,
        json: {
          success: true,
          claim: {
            id: "claim-e2e",
            legacyCardId: 42,
            targetCardId: null,
            seriesCode: "765",
            favoriteIdols: [favoriteIdol],
            state: "pending",
            message: "旧活动现场交换所得",
            reviewNote: "",
            revision: 0,
            createdAt: "2026-08-16T19:30:00.000Z",
            updatedAt: "2026-08-16T19:30:00.000Z",
            reviewedAt: null,
          },
        },
      })
    }
  )

  await page.goto("/community/cards")
  await page.getByRole("button", { name: "认领这张旧名片" }).click()
  const dialog = page.getByRole("dialog", { name: "认领历史名片 #42" })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("checkbox", { name: /天海春香/ }).click()
  await dialog.getByLabel("认领说明").fill("旧活动现场交换所得")
  await dialog.getByRole("button", { name: "提交认领审核" }).click()

  await expect(dialog).not.toBeVisible()
  await expect(page.getByText("认领审核中")).toBeVisible()
  expect(submitted).toEqual({
    body: {
      targetCardId: null,
      seriesCode: "765",
      favoriteIdolIds: [1],
      message: "旧活动现场交换所得",
    },
    csrf: "claim-workflow-csrf",
  })
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
  ).toBe(false)
  expect(consoleErrors).toEqual([])
  await page.waitForTimeout(500)
  await expect(page.getByRole("dialog")).not.toBeVisible()
  await page.screenshot({
    path: `/tmp/imsweb-namecard-claim-${testInfo.project.name}.png`,
    fullPage: true,
  })
})

const registeredCard = {
  id: "registered-card-e2e",
  producerName: "注册制作人",
  displayName: "待审核注册名片",
  seriesCode: "765",
  favoriteIdol: "天海春香",
  favoriteIdols: [favoriteIdol],
  frontImageUrl: FRONT_IMAGE,
  backImageUrl: BACK_IMAGE,
  accent: "#f34e6c",
  bio: "",
  tradeNote: "",
  available: true,
  mediaRightsStatus: "unknown",
  publicationStatus: "pending",
  revision: 1,
  createdAt: "2026-08-16T19:30:00.000Z",
  updatedAt: "2026-08-16T19:30:00.000Z",
}

test("same-ID envelope asks the owner before submitting an admin-reviewed claim", async ({
  page,
}) => {
  await mockPlatformSession(page)
  await page.route("**/api/platform/me", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        account: { id: "platform-claimant", status: "active" },
        capabilities: { fudabaWrite: true },
        profile: {
          displayName: "认领测试制作人",
          avatarUrl: null,
          homeCity: "上海",
          bio: "",
          updatedAt: 10,
        },
      },
    })
  })
  await page.route("**/api/community/exchange/me/series", async (route) => {
    await route.fulfill({
      json: {
        items: [
          {
            id: 1,
            code: "765",
            displayName: "765PRO",
            color: "#f34e6c",
            iconUrl: null,
            imageTransform: {
              fit: "cover",
              focalX: 0.5,
              focalY: 0.5,
              zoom: 1,
              rotation: 0,
            },
            displayOrder: 0,
            activeOfficeCount: 0,
          },
        ],
      },
    })
  })
  await page.route("**/api/wiki/catalog**", async (route) => {
    await route.fulfill({ json: catalog })
  })
  await page.route("**/api/community/exchange/me/cards", async (route) => {
    await route.fulfill({
      json: { items: [{ ...registeredCard, id: "42" }] },
    })
  })
  await page.route("**/api/community/exchange/me/offices", async (route) => {
    await route.fulfill({ json: { items: [] } })
  })

  const envelope = {
    id: "1",
    legacyCardId: 42,
    cardId: "42",
    kind: "legacy-card-match",
    title: "这张旧名片是您的吗？",
    body: "确认后将提交管理员审核。",
    actionState: "pending",
    claimId: null,
    revision: 0,
    readAt: null,
    actedAt: null,
    createdAt: "2026-08-16T19:30:00.000Z",
  }
  let responseBody: Record<string, unknown> | undefined
  let csrf: string | undefined
  await page.route(
    "**/api/community/exchange/me/claim-envelopes**",
    async (route) => {
      if (route.request().method() === "PUT") {
        responseBody = route.request().postDataJSON() as Record<string, unknown>
        csrf = route.request().headers()["x-csrftoken"]
        await route.fulfill({
          json: {
            success: true,
            envelope: {
              ...envelope,
              actionState: "confirmed",
              claimId: "same-id-claim-e2e",
              revision: 1,
              actedAt: "2026-08-16T19:31:00.000Z",
            },
            claim: {
              id: "same-id-claim-e2e",
              legacyCardId: 42,
              targetCardId: "42",
              seriesCode: "765",
              favoriteIdols: [favoriteIdol],
              state: "pending",
              message: "同 ID 旧名片身份确认",
              reviewNote: "",
              revision: 0,
              createdAt: "2026-08-16T19:31:00.000Z",
              updatedAt: "2026-08-16T19:31:00.000Z",
              reviewedAt: null,
            },
          },
        })
        return
      }
      await route.fulfill({ json: { items: [envelope] } })
    }
  )

  await page.goto("/community/exchange/me")
  await expect(page.getByText("1 封待确认")).toBeVisible()
  await expect(page.getByText("历史名片 #42")).toBeVisible()
  await page.getByRole("button", { name: "是本人名片", exact: true }).click()
  await expect(page.getByText("当前没有待确认信封。")).toBeVisible()
  expect(responseBody).toEqual({ decision: "confirm", expectedRevision: 0 })
  expect(csrf).toBe("claim-workflow-csrf")
})

const pendingClaim = {
  id: "claim-admin-e2e",
  legacyCardId: 42,
  targetCardId: null,
  seriesCode: "765",
  favoriteIdols: [favoriteIdol],
  state: "pending",
  message: "旧活动现场交换所得",
  reviewNote: "",
  revision: 2,
  createdAt: "2026-08-16T19:30:00.000Z",
  updatedAt: "2026-08-16T19:30:00.000Z",
  reviewedAt: null,
  claimant: { id: "platform-claimant", displayName: "认领测试制作人" },
  legacyCard: {
    id: 42,
    frontImageUrl: FRONT_IMAGE,
    backImageUrl: BACK_IMAGE,
  },
}

test("administrator reviews registered cards and legacy-card claims", async ({
  context,
  page,
}, testInfo) => {
  await context.addCookies([
    {
      name: "ims_admin_csrf",
      value: "claim-admin-csrf",
      domain: "127.0.0.1",
      path: "/",
    },
  ])
  await page.route("**/api/admin/auth/session", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        user: {
          id: 1,
          username: "claim-reviewer",
          producername: "认领审核员",
          dept: "op",
          adminRole: "admin",
        },
      },
    })
  })
  await page.route("**/api/admin/cards**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: [],
        pageInfo: {
          page: 1,
          pageSize: 10,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
        },
      },
    })
  })

  let registeredPending = true
  let claimPending = true
  const reviews: Array<{
    kind: "registered" | "claim"
    body: Record<string, unknown>
    csrf: string | undefined
  }> = []
  await page.route(
    "**/api/admin/community/exchange/card-reviews**",
    async (route) => {
      const request = route.request()
      if (request.method() === "PUT") {
        reviews.push({
          kind: "registered",
          body: request.postDataJSON() as Record<string, unknown>,
          csrf: request.headers()["x-csrftoken"],
        })
        registeredPending = false
        await route.fulfill({ json: { success: true, revision: 2 } })
        return
      }
      await route.fulfill({
        json: {
          items: registeredPending
            ? [
                {
                  card: registeredCard,
                  owner: {
                    id: "registered-owner-e2e",
                    displayName: "注册制作人",
                  },
                },
              ]
            : [],
        },
      })
    }
  )
  await page.route(
    "**/api/admin/community/exchange/card-claims**",
    async (route) => {
      const request = route.request()
      if (request.method() === "PUT") {
        reviews.push({
          kind: "claim",
          body: request.postDataJSON() as Record<string, unknown>,
          csrf: request.headers()["x-csrftoken"],
        })
        claimPending = false
        await route.fulfill({ json: { success: true, revision: 3 } })
        return
      }
      await route.fulfill({
        json: { items: claimPending ? [pendingClaim] : [] },
      })
    }
  )

  await page.goto("/admin/cards")
  await page.getByRole("tab", { name: "注册用户投稿" }).click()
  await expect(page.getByText("待审核注册名片")).toBeVisible()
  await page.getByRole("button", { name: "通过" }).click()
  await page.getByRole("button", { name: "确认通过" }).click()
  await expect(page.getByText("没有待审核注册名片")).toBeVisible()

  await page.getByRole("tab", { name: "旧名片认领" }).click()
  await expect(page.getByText("历史名片 #42")).toBeVisible()
  await page.getByRole("button", { name: "通过" }).click()
  await page.getByRole("button", { name: "确认认领" }).click()
  await expect(page.getByText("没有待审核认领")).toBeVisible()

  expect(reviews).toEqual([
    {
      kind: "registered",
      body: { decision: "approve", expectedRevision: 1, note: "" },
      csrf: "claim-admin-csrf",
    },
    {
      kind: "claim",
      body: {
        decision: "approve",
        expectedRevision: 2,
        note: "已核对历史名片与申请资料",
      },
      csrf: "claim-admin-csrf",
    },
  ])
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
  ).toBe(false)
  await page.waitForTimeout(500)
  await expect(page.getByRole("dialog")).not.toBeVisible()
  await page.screenshot({
    path: `/tmp/imsweb-namecard-admin-review-${testInfo.project.name}.png`,
    fullPage: true,
  })
})
