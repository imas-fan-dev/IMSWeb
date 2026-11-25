import { api, expect, test } from "./fixtures/test"
import type { Locator, Page } from "@playwright/test"

import { makeCardPage } from "../../mocks/data/namecards"
import { installAdminAuthMock } from "./fixtures/admin-auth"
import { makeCharacterCatalog } from "./fixtures/fudaba-characters"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { installPlatformOAuthProvidersMock } from "./fixtures/platform-auth"

const FRONT_IMAGE = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
const BACK_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIABAAAAAP///ywAAAAAAQABAAACAkQBADs="

/** 墙与详情只认页面行：正/反/中间由页序推导。 */
function namecardPages(front: string, back: string) {
  return [
    makeCardPage({ pageId: "page-front", role: "front", order: 1, url: front }),
    makeCardPage({ pageId: "page-back", role: "back", order: 2, url: back }),
  ]
}

async function waitForNextPaint(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
}

const seriesCatalog = {
  items: [
    { id: 1, code: "765", displayName: "765PRO", color: "#f34e6c" },
    { id: 2, code: "cg", displayName: "灰姑娘女孩", color: "#2581c7" },
  ].map((item, displayOrder) => ({
    ...item,
    displayOrder,
    iconUrl: null,
    imageTransform: {
      fit: "cover",
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
      rotation: 0,
    },
    activeOfficeCount: 0,
  })),
}

const favoriteCharacter = { id: 1, name: "天海春香", seriesCode: "765" }

async function mockAnonymousPlatformSession() {
  await api.mockRoute(
    "**/api/platform/auth/session",
    async (route) => {
      await route.fulfill({
        status: 401,
        json: { success: false, code: "PLATFORM_AUTH_REQUIRED" },
      })
    },
    "GET",
    0
  )
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
  await api.mockRoute(
    "**/api/platform/auth/session",
    async (route) => {
      await route.fulfill({
        json: {
          success: true,
          account: { id: "platform-claimant", status: "active" },
          profile: {
            uid: 1,
            displayName: "认领测试制作人",
            avatarUrl: null,
            homeCity: "上海",
            bio: "",
          },
        },
      })
    },
    "GET"
  )
}

test.describe("anonymous namecard submission", () => {
  for (const enabled of [false, true]) {
    test(`the wall create button ${enabled ? "opens the guest form" : "requires login"}`, async ({
      page,
      api,
    }) => {
      installEmptyWikiCatalogMock(api)
      await mockAnonymousPlatformSession()
      await api.mockRoute(
        "**/api/cards**",
        async (route) => {
          await route.fulfill({ json: { list: [], total: 0, totalPage: 0 } })
        },
        "GET"
      )
      await api.mockRoute(
        "**/api/community/exchange/cards/guest-submission",
        async (route) => {
          await route.fulfill({ json: { success: true, enabled } })
        },
        "GET"
      )
      if (!enabled) {
        installPlatformOAuthProvidersMock(api)
        await page.goto("/community/cards")
        await page.getByRole("button", { name: "新建名片" }).click()
        await expect(page).toHaveURL(/\/account\/login$/)
        return
      }

      await api.mockRoute(
        "**/api/community/exchange/series",
        async (route) => {
          await route.fulfill({ json: seriesCatalog })
        },
        "GET",
        { min: 1, max: 2 }
      )
      let submitted:
        | { header: string | undefined; body: string | null }
        | undefined
      await api.mockRoute(
        "**/api/community/exchange/cards",
        async (route) => {
          submitted = {
            header: route.request().headers()["x-namecard-guest-submission"],
            body: route.request().postData(),
          }
          await route.fulfill({ status: 201, json: { success: true } })
        },
        "POST"
      )
      await page.goto("/community/cards")
      await page.getByRole("button", { name: "新建名片" }).click()
      const dialog = page.getByRole("dialog", { name: "匿名投稿名片" })
      await dialog
        .getByRole("textbox", { name: "制作人名称", exact: true })
        .fill("访客制作人")
      await dialog.getByRole("checkbox", { name: "765PRO" }).click()
      await dialog.locator("input[aria-label='选择名片图片']").setInputFiles({
        name: "front.gif",
        mimeType: "image/gif",
        buffer: Buffer.from(FRONT_IMAGE.split(",")[1], "base64"),
      })
      await dialog.getByRole("button", { name: "提交审核" }).click()
      await expect(dialog).not.toBeVisible()
      expect(submitted?.header).toBe("1")
      expect(submitted?.body).toContain('name="front"; filename="front.gif"')
      expect(submitted?.body).toContain('name="producerName"')
      expect(submitted?.body).toContain('name="seriesCodes"')
    })
  }
})

test.describe("namecard claim workflow", () => {
  test("anonymous visitors do not see the legacy-card claim action", async ({
    page,
    api,
  }) => {
    installEmptyWikiCatalogMock(api)
    await mockAnonymousPlatformSession()
    await api.mockRoute(
      "**/api/cards**",
      async (route) => {
        await route.fulfill({
          json: {
            list: [
              {
                id: 42,
                cardId: "card-42",
                cardNumber: 42,
                revision: 1,
                producerName: "天海春香",
                producerReading: null,
                groupName: null,
                madeOn: null,
                isOriginal: false,
                madeWithAi: false,
                bio: null,
                tradeNote: null,
                exchangeMode: "manual",
                accent: null,
                seriesCodes: ["765"],
                credits: [],
                pages: namecardPages(FRONT_IMAGE, BACK_IMAGE),
                canEdit: false,
                hasOwner: false,
                seriesCode: "765",
                favoriteCharacters: [favoriteCharacter],
                claimStatus: "unclaimed",
                supplementPending: false,
                viewerClaimState: null,
                claimerName: null,
                claimerUid: null,
                status: "approved",
                created_at: "2026-08-16T19:30:00.000Z",
              },
            ],
            total: 1,
            totalPage: 1,
          },
        })
      },
      "GET"
    )
    await api.mockRoute(
      "**/api/reactions**",
      async (route) => {
        await route.fulfill({ json: {} })
      },
      "GET"
    )

    await page.goto("/community/cards")
    await expect(
      page.getByRole("button", { name: "查看制作人名片 42 正面" })
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "认领" })).toHaveCount(0)
  })

  test("registered user submits a legacy-card claim from the public wall", async ({
    page,
  }, testInfo) => {
    await mockPlatformSession(page)
    installEmptyWikiCatalogMock(api)
    const consoleErrors: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    page.on("pageerror", (error) => consoleErrors.push(error.message))

    await api.mockRoute(
      "**/api/community/exchange/me/series",
      async (route) => {
        await route.fulfill({ json: seriesCatalog })
      },
      "GET"
    )
    await api.mockRoute(
      "**/api/community/exchange/characters",
      async (route) => {
        await route.fulfill({ json: makeCharacterCatalog() })
      },
      "GET"
    )
    await api.mockRoute(
      "**/api/community/exchange/me/cards",
      async (route) => {
        await route.fulfill({ json: { items: [] } })
      },
      "GET"
    )
    await api.mockRoute(
      "**/api/cards**",
      async (route) => {
        await route.fulfill({
          json: {
            list: [
              {
                id: 42,
                cardId: "card-42",
                cardNumber: 42,
                revision: 1,
                producerName: "天海春香",
                producerReading: null,
                groupName: null,
                madeOn: null,
                isOriginal: false,
                madeWithAi: false,
                bio: null,
                tradeNote: null,
                exchangeMode: "manual",
                accent: null,
                seriesCodes: ["765"],
                credits: [],
                pages: namecardPages(FRONT_IMAGE, BACK_IMAGE),
                canEdit: false,
                hasOwner: false,
                seriesCode: "765",
                favoriteCharacters: [favoriteCharacter],
                claimStatus: "unclaimed",
                supplementPending: false,
                viewerClaimState: null,
                claimerName: null,
                claimerUid: null,
                status: "approved",
                created_at: "2026-08-16T19:30:00.000Z",
              },
            ],
            total: 1,
            totalPage: 1,
          },
        })
      },
      "GET"
    )
    await api.mockRoute(
      "**/api/reactions**",
      async (route) => {
        await route.fulfill({ json: {} })
      },
      "GET"
    )

    let submitted:
      | { body: Record<string, unknown>; csrf: string | undefined }
      | undefined
    await api.mockRoute(
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
              payload: { producerName: "天海春香（认领）" },
              favoriteCharacters: [favoriteCharacter],
              state: "pending",
              message: "",
              reviewNote: "",
              revision: 0,
              createdAt: "2026-08-16T19:30:00.000Z",
              updatedAt: "2026-08-16T19:30:00.000Z",
              reviewedAt: null,
            },
          },
        })
      },
      "POST"
    )

    await page.goto("/community/cards")
    await page.getByRole("button", { name: "查看制作人名片 42 正面" }).click()
    const detail = page.getByRole("dialog", { name: /制作人名片\s*\d+/ }).last()
    await detail.getByRole("button", { name: "认领" }).click()
    const dialog = page.getByRole("dialog", { name: "认领名片 #42" })
    await expect(dialog).toBeVisible()
    // 绑定方式是内联单选列表（不开浮层，点击不会关掉下层的详情窗）。
    await expect(
      dialog
        .getByRole("radiogroup", { name: "绑定方式" })
        .getByRole("radio", { name: /创建一张可管理的注册名片/ })
    ).toHaveAttribute("aria-checked", "true")
    // 认领不再要求相对墙上名片有改动，只拦必填项缺失。
    await dialog.getByLabel("制作人名称").fill("天海春香（认领）")
    await dialog.getByRole("button", { name: "提交认领审核" }).click()

    await expect(dialog).not.toBeVisible()
    await expect(detail.getByText("认领审核中", { exact: true })).toBeVisible()
    await expect(
      page
        .locator("[data-namecard-item]")
        .getByText("认领审核中", { exact: true })
    ).toBeVisible()
    expect(submitted?.csrf).toBe("claim-workflow-csrf")
    expect(submitted?.body).toMatchObject({
      targetCardId: null,
      // 只提交改过的那一个字段，其余保持墙上名片的值。
      payload: { producerName: "天海春香（认领）" },
    })
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth
      )
    ).toBe(false)
    expect(consoleErrors).toEqual([])
    await waitForNextPaint(page)
    await expect(detail).toBeVisible()
    await detail.getByRole("button", { name: "Close" }).click()
    await expect(detail).not.toBeVisible()
    await page.screenshot({
      path: `/tmp/imsweb-namecard-claim-${testInfo.project.name}.png`,
      fullPage: true,
    })
  })

  test("submits only the field the visitor changed", async ({ page }) => {
    await mockClaimSurface(page)
    let submitted: Record<string, unknown> | undefined
    await api.mockRoute(
      "**/api/community/exchange/legacy-cards/42/claims",
      async (route) => {
        submitted = route.request().postDataJSON() as Record<string, unknown>
        await route.fulfill({
          status: 201,
          json: {
            success: true,
            claim: {
              id: "claim-bare",
              legacyCardId: 42,
              targetCardId: null,
              seriesCode: "765",
              payload: { groupName: "765PRO" },
              favoriteCharacters: [],
              state: "pending",
              message: "",
              reviewNote: "",
              revision: 0,
              createdAt: "2026-08-16T19:30:00.000Z",
              updatedAt: "2026-08-16T19:30:00.000Z",
              reviewedAt: null,
            },
          },
        })
      },
      "POST"
    )

    const { dialog } = await openClaimDialog(page)
    // 企划 and 担当角色 are left alone: the server derives a series for the
    // claim record from the bound card, the idols, or the legacy card itself.
    await dialog.getByLabel("团体名称").fill("765PRO")
    await dialog.getByRole("button", { name: "提交认领审核" }).click()

    await expect(dialog).not.toBeVisible()
    expect(submitted).toMatchObject({
      targetCardId: null,
      payload: { groupName: "765PRO" },
    })
  })

  // The claim dialog is the long-form case for a phone: the whole panel used to
  // scroll, so 提交认领审核 and the ✕ could leave the viewport. The pinned layout
  // keeps both in place and scrolls only the body.
  async function mockClaimSurface(page: Page) {
    await mockPlatformSession(page)
    installEmptyWikiCatalogMock(api)
    await api.mockRoute(
      "**/api/community/exchange/me/series",
      async (route) => {
        await route.fulfill({ json: seriesCatalog })
      },
      "GET"
    )
    await api.mockRoute(
      "**/api/community/exchange/characters",
      async (route) => {
        await route.fulfill({ json: makeCharacterCatalog() })
      },
      "GET"
    )
    await api.mockRoute(
      "**/api/community/exchange/me/cards",
      async (route) => {
        await route.fulfill({ json: { items: [] } })
      },
      "GET"
    )
    await api.mockRoute(
      "**/api/cards**",
      async (route) => {
        await route.fulfill({
          json: {
            list: [
              {
                id: 42,
                cardId: "card-42",
                cardNumber: 42,
                revision: 1,
                producerName: "天海春香",
                producerReading: null,
                groupName: null,
                madeOn: null,
                isOriginal: false,
                madeWithAi: false,
                bio: null,
                tradeNote: null,
                exchangeMode: "manual",
                accent: null,
                seriesCodes: ["765"],
                credits: [],
                pages: namecardPages(FRONT_IMAGE, BACK_IMAGE),
                canEdit: false,
                hasOwner: false,
                seriesCode: "765",
                favoriteCharacters: [favoriteCharacter],
                claimStatus: "unclaimed",
                supplementPending: false,
                viewerClaimState: null,
                claimerName: null,
                claimerUid: null,
                status: "approved",
                created_at: "2026-08-16T19:30:00.000Z",
              },
            ],
            total: 1,
            totalPage: 1,
          },
        })
      },
      "GET"
    )
    await api.mockRoute(
      "**/api/reactions**",
      async (route) => {
        await route.fulfill({ json: {} })
      },
      "GET"
    )
  }

  async function openClaimDialog(page: Page) {
    await page.goto("/community/cards")
    await page.getByRole("button", { name: "查看制作人名片 42 正面" }).click()
    const detail = page.getByRole("dialog", { name: /制作人名片\s*\d+/ }).last()
    await expect(detail).toBeVisible()
    // 打开详情本身可能已经把页面滚到名片处；以认领弹窗打开前的位置为基准，
    // 断言弹窗不会再次移动页面。
    const pageScrollBefore = await page.evaluate(
      () => document.scrollingElement?.scrollTop ?? 0
    )
    await detail.getByRole("button", { name: "认领" }).click()
    const dialog = page.getByRole("dialog", { name: "认领名片 #42" })
    await expect(dialog).toBeVisible()
    await settleDialog(dialog)
    return { dialog, pageScrollBefore }
  }

  // The popup opens with a 100ms zoom-in, so measuring straight after `toBeVisible`
  // returns scaled geometry (a 44px target reads as 43.45px). Let the finite
  // animations finish, allowing cancellation, before any box is read.
  async function settleDialog(dialog: Locator) {
    await dialog.evaluate((node) =>
      Promise.allSettled(
        node
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished)
      )
    )
  }

  function expectSameBox(
    before: { x: number; y: number } | null,
    after: { x: number; y: number } | null
  ) {
    expect(before).not.toBeNull()
    expect(after).not.toBeNull()
    expect(
      Math.abs((after as { y: number }).y - (before as { y: number }).y)
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs((after as { x: number }).x - (before as { x: number }).x)
    ).toBeLessThanOrEqual(1)
  }

  test.describe("claim dialog mobile constraints @mobile", () => {
    test.use({ viewport: { width: 375, height: 667 }, hasTouch: true })

    test("keeps the dialog and its primary action inside the phone viewport", async ({
      page,
    }) => {
      await mockClaimSurface(page)
      const { dialog, pageScrollBefore } = await openClaimDialog(page)

      const viewport = await page.evaluate(() => ({
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
      }))
      const panel = await dialog.boundingBox()
      const submit = await dialog
        .getByRole("button", { name: "提交认领审核" })
        .boundingBox()

      expect(panel).not.toBeNull()
      expect(submit).not.toBeNull()
      expect(panel!.x).toBeGreaterThanOrEqual(-1)
      expect(panel!.y).toBeGreaterThanOrEqual(-1)
      expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport.height + 1)
      // Reachable without scrolling anything: the footer is not below the fold.
      expect(submit!.y).toBeGreaterThanOrEqual(0)
      expect(submit!.y + submit!.height).toBeLessThanOrEqual(
        viewport.height + 1
      )
      // 弹窗本身不能再滚动页面：与打开前的滚动位置保持一致。
      expect(
        await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)
      ).toBe(pageScrollBefore)

      // Touch targets: the close button and every option row.
      const close = await dialog
        .locator('[data-slot="dialog-close"]')
        .boundingBox()
      expect(close!.width).toBeGreaterThanOrEqual(44)
      expect(close!.height).toBeGreaterThanOrEqual(44)
      const rowHeights = await dialog
        .locator('[aria-label="担当角色候选"] label')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getBoundingClientRect().height)
        )
      expect(rowHeights.length).toBeGreaterThan(0)
      expect(rowHeights.filter((height) => height < 44)).toEqual([])
    })

    test("keeps the footer and close button fixed while only the body scrolls", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 568 })
      await mockClaimSurface(page)
      const { dialog } = await openClaimDialog(page)

      const body = dialog.locator('[data-slot="dialog-body"]')
      const footer = dialog.locator('[data-slot="dialog-footer"]')
      const close = dialog.locator('[data-slot="dialog-close"]')
      await expect(body).toBeVisible()

      const overflow = await body.evaluate((node) => ({
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
      }))
      expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight)

      // 打开弹窗本身可能让页面滚动到卡片所在位置；要断言的是「滚动弹窗 body 不会带动页面」，
      // 因此以打开后的页面滚动位置为基准，而不是硬编码 0。
      const pageScrollBefore = await page.evaluate(
        () => document.scrollingElement?.scrollTop ?? 0
      )
      const footerBefore = await footer.boundingBox()
      const closeBefore = await close.boundingBox()
      await body.evaluate((node) => {
        node.scrollTop = node.scrollHeight
      })
      await waitForNextPaint(page)

      expect(await body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
      expectSameBox(footerBefore, await footer.boundingBox())
      expectSameBox(closeBefore, await close.boundingBox())
      expect(
        await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)
      ).toBe(pageScrollBefore)
    })
  })

  const pendingSubmission = {
    id: 42,
    status: "pending",
    revision: 1,
    producerName: "注册制作人",
    producerReading: null,
    origin: "exchange",
    lockReason: null,
    reviewStatus: null,
    reviewReason: null,
    pageCount: 2,
  }

  const pendingClaim = {
    id: "claim-admin-e2e",
    legacyCardId: 42,
    targetCardId: null,
    targetCardNumber: null,
    seriesCode: "765",
    payload: { producerName: "认领测试制作人" },
    favoriteCharacters: [favoriteCharacter],
    state: "pending" as const,
    message: "旧活动现场交换所得",
    reviewNote: "",
    revision: 2,
    createdAt: "2026-08-16T19:31:00.000Z",
    updatedAt: "2026-08-16T19:31:00.000Z",
    reviewedAt: null,
    claimant: { id: "platform-claimant", displayName: "认领测试制作人" },
    legacyCard: {
      id: 42,
      pages: namecardPages(FRONT_IMAGE, BACK_IMAGE),
    },
  }

  test.describe("same-ID match inbox", () => {
    test.use({
      inboxNotifications: [
        {
          id: "legacy-envelope-1",
          kind: "legacy-card-match",
          cardNumber: 42,
          exchangeId: null,
          title: "这张旧名片是您的吗？",
          body: "名片墙上有一张无主名片 #42，制作人名称是「认领测试制作人」。",
          readAt: null,
          createdAt: "2026-08-16T19:30:00.000Z",
        },
      ],
    })

    test("links a same-ID match straight to the wall card", async ({
      page,
    }) => {
      await mockPlatformSession(page)
      installEmptyWikiCatalogMock(api)
      // 消息页属于帐号工作台，进来时会并行读会话资料与几份「我的」列表。
      await api.mockRoute(
        "/api/platform/me",
        async (route) => {
          await route.fulfill({
            json: {
              success: true,
              account: { id: "platform-claimant", status: "active" },
              profile: {
                uid: 1,
                displayName: "认领测试制作人",
                avatarUrl: null,
                homeCity: "上海",
                bio: "",
                updatedAt: 1,
                pageSlug: null,
              },
              capabilities: { fudabaWrite: true },
            },
          })
        },
        "GET",
        { min: 0, max: 12 }
      )
      for (const path of [
        "/api/community/exchange/me/series",
        "/api/community/exchange/me/office-series",
        "/api/community/exchange/me/cards",
        "/api/community/exchange/me/offices",
      ]) {
        await api.mockRoute(
          path,
          async (route) => {
            await route.fulfill({ json: { items: [] } })
          },
          "GET",
          { min: 0, max: 12 }
        )
      }
      await api.mockRoute(
        "**/api/community/exchange/me/notifications/read",
        async (route) => {
          await route.fulfill({ json: { success: true, updated: 1 } })
        },
        "POST",
        { min: 0, max: 12 }
      )
      await api.mockRoute(
        "**/api/cards**",
        async (route) => {
          await route.fulfill({
            json: {
              list: [
                {
                  id: 42,
                  cardId: "card-42",
                  cardNumber: 42,
                  revision: 1,
                  producerName: "认领测试制作人",
                  producerReading: null,
                  groupName: null,
                  madeOn: null,
                  isOriginal: false,
                  madeWithAi: false,
                  bio: null,
                  tradeNote: null,
                  exchangeMode: "manual",
                  accent: null,
                  seriesCodes: ["765"],
                  credits: [],
                  pages: namecardPages(FRONT_IMAGE, BACK_IMAGE),
                  canEdit: false,
                  hasOwner: false,
                  seriesCode: "765",
                  favoriteCharacters: [favoriteCharacter],
                  claimStatus: "unclaimed",
                  supplementPending: false,
                  viewerClaimState: null,
                  claimerName: null,
                  claimerUid: null,
                  status: "approved",
                  created_at: "2026-08-16T19:30:00.000Z",
                },
              ],
              total: 1,
              totalPage: 1,
            },
          })
        },
        "GET"
      )
      await api.mockRoute(
        "**/api/reactions**",
        async (route) => {
          await route.fulfill({ json: {} })
        },
        "GET"
      )

      await page.goto("/account/me/claims")
      await expect(page.getByRole("heading", { name: /^消息/ })).toBeVisible()
      await expect(page.getByText("这张旧名片是您的吗？")).toBeVisible()

      await page.getByRole("link", { name: "去认领" }).click()
      await page.waitForURL(/\/community\/cards\?card=42$/)
      // The deep link opens the detail dialog for that card on the wall.
      await expect(
        page.getByRole("dialog", { name: /制作人名片/ }).last()
      ).toBeVisible()
    })
  })

  test("administrator reviews submissions and claims from two tabs", async ({
    page,
    api,
  }, testInfo) => {
    await installAdminAuthMock(page, api, {
      csrfToken: "claim-admin-csrf",
      user: {
        username: "claim-reviewer",
        producername: "认领审核员",
      },
    })

    let submissionPending = true
    let claimPending = true
    const reviews: Array<{
      kind: "registered" | "claim"
      body: Record<string, unknown>
      csrf: string | undefined
    }> = []

    // 投稿审核页签仍是原来的名片列表接口。
    await api.mockRoute(
      "**/api/admin/cards",
      async (route) => {
        await route.fulfill({
          json: {
            success: true,
            data: submissionPending ? [pendingSubmission] : [],
            pageInfo: {
              page: 1,
              pageSize: 20,
              total: submissionPending ? 1 : 0,
              totalPages: submissionPending ? 1 : 0,
              hasNextPage: false,
            },
          },
        })
      },
      "GET",
      { min: 1, max: 20 }
    )
    await api.mockRoute(
      `/api/admin/cards/approve/${pendingSubmission.id}`,
      async (route) => {
        reviews.push({
          kind: "registered",
          body: route.request().postDataJSON() as Record<string, unknown>,
          csrf: route.request().headers()["x-csrftoken"],
        })
        submissionPending = false
        await route.fulfill({ json: { success: true, revision: 2 } })
      },
      "POST"
    )

    await api.mockRoute(
      "**/api/community/exchange/characters",
      async (route) => {
        await route.fulfill({ json: makeCharacterCatalog() })
      },
      "GET",
      { min: 0, max: 12 }
    )
    // 旧名片认领页签按审核类型取数，结构与投稿审核一致。
    await api.mockRoute(
      "**/api/admin/community/exchange/review-queue",
      async (route) => {
        await route.fulfill({
          json: {
            success: true,
            data: claimPending
              ? [
                  {
                    type: "claim",
                    submittedAt: "2026-08-16T19:31:00.000Z",
                    claim: pendingClaim,
                  },
                ]
              : [],
            pageInfo: {
              page: 1,
              pageSize: 20,
              total: claimPending ? 1 : 0,
              totalPages: claimPending ? 1 : 0,
              hasNextPage: false,
            },
          },
        })
      },
      "GET",
      { min: 1, max: 20 }
    )
    await api.mockRoute(
      "/api/admin/community/exchange/card-claims/claim-admin-e2e",
      async (route) => {
        reviews.push({
          kind: "claim",
          body: route.request().postDataJSON() as Record<string, unknown>,
          csrf: route.request().headers()["x-csrftoken"],
        })
        claimPending = false
        await route.fulfill({ json: { success: true, revision: 3 } })
      },
      "PUT"
    )

    await api.mockRoute(
      "/api/admin/cards/guest-submission",
      async (route) => {
        await route.fulfill({ json: { success: true, enabled: false } })
      },
      "GET"
    )
    const changes: boolean[] = []
    await api.mockRoute(
      "/api/admin/cards/guest-submission",
      async (route) => {
        const { enabled } = route.request().postDataJSON() as {
          enabled: boolean
        }
        expect(route.request().headers()["x-csrftoken"]).toBe(
          "claim-admin-csrf"
        )
        changes.push(enabled)
        await route.fulfill({ json: { success: true, enabled } })
      },
      "PUT",
      2
    )
    await page.goto("/admin/cards")
    await page.getByRole("button", { name: "允许匿名投稿" }).click()
    await page.getByRole("button", { name: "关闭匿名投稿" }).click()
    await expect(
      page.getByRole("button", { name: "允许匿名投稿" })
    ).toBeEnabled()
    expect(changes).toEqual([true, false])
    await expect(page.getByRole("tab", { name: "投稿审核" })).toBeVisible()
    await expect(page.getByText("注册制作人")).toBeVisible()

    // 归属筛选落在制作人名称与审核状态之间，选中账号后写进请求与地址栏。
    const [nameControl, ownerControl, statusControl] = await Promise.all([
      page.getByPlaceholder("搜索制作人名称").boundingBox(),
      page.getByPlaceholder("按昵称检索用户").boundingBox(),
      page.getByRole("combobox").first().boundingBox(),
    ])
    expect(nameControl!.x).toBeLessThan(ownerControl!.x)
    expect(ownerControl!.x).toBeLessThan(statusControl!.x)

    await api.mockRoute(
      "**/api/admin/platform/users**",
      async (route) => {
        await route.fulfill({
          json: {
            success: true,
            users: [
              {
                id: "owner-e2e",
                status: "active",
                displayName: "归属用户",
                uid: 7,
                pageSlug: null,
                email: null,
                hasPassword: false,
                activeSessionCount: 0,
                lastLoginAt: null,
                createdAt: 1,
                updatedAt: 1,
              },
            ],
            pageInfo: {
              page: 1,
              pageSize: 6,
              total: 1,
              totalPages: 1,
              hasNextPage: false,
            },
          },
        })
      },
      "GET"
    )
    await page.getByPlaceholder("按昵称检索用户").fill("归属")
    await page.getByRole("button", { name: /归属用户/ }).click()
    await page.waitForURL(/owner=owner-e2e/)
    await page.getByRole("button", { name: "取消所属用户筛选" }).click()
    await page.waitForURL((url) => !url.searchParams.has("owner"))

    await page.getByRole("button", { name: "通过", exact: true }).click()
    await page.getByRole("button", { name: "确认通过" }).click()
    await expect(page.getByText("注册制作人")).toHaveCount(0)

    // 认领页签：同一套卡片结构，筛选换成审核类型。
    await page.getByRole("tab", { name: "旧名片认领" }).click()
    await expect(page.getByText("名片 #42").first()).toBeVisible()
    // 卡片上的类型徽标（页签与标题也叫这个名字，需要限定在卡片内）。
    await expect(
      page.locator("article").getByText("名片认领", { exact: true })
    ).toBeVisible()
    await page.getByRole("button", { name: "通过", exact: true }).click()
    await page.getByRole("button", { name: "确认通过" }).click()
    await expect(page.getByText("没有待审核的认领或补充")).toBeVisible()

    expect(reviews).toEqual([
      {
        kind: "registered",
        body: { expected_revision: 1 },
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
    await waitForNextPaint(page)
    await expect(page.getByRole("dialog")).not.toBeVisible()
    await page.screenshot({
      path: `/tmp/imsweb-namecard-admin-review-${testInfo.project.name}.png`,
      fullPage: true,
    })
  })
})
