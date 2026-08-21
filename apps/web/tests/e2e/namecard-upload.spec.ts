import { expect, test } from "@playwright/test"
import type { Locator, Page } from "@playwright/test"

const FRONT_IMAGE = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
const BACK_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIABAAAAAP///ywAAAAAAQABAAACAkQBADs="
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xz5WAAAAAElFTkSuQmCC",
  "base64"
)

type BoundingBox = {
  x: number
  y: number
  width: number
  height: number
}

async function mockNamecardApi(page: Page, cardCount = 12) {
  await page.context().addCookies([
    {
      name: "ims_admin_csrf",
      value: "namecard-upload-e2e",
      domain: "127.0.0.1",
      path: "/",
    },
  ])
  await page.route("**/api/admin/auth/session**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        user: {
          id: 1,
          username: "namecard-upload-qa",
          producername: "名片上传检查",
          dept: "op",
          adminRole: "admin",
        },
      },
    })
  })

  await page.route("**/api/wiki/catalog**", async (route) => {
    await route.fulfill({
      json: {
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
        ],
        selection: null,
      },
    })
  })

  await page.route("**/api/cards**", async (route) => {
    await route.fulfill({
      json: {
        list: Array.from({ length: cardCount }, (_, index) => ({
          id: index + 1,
          image1_url: FRONT_IMAGE,
          image2_url: BACK_IMAGE,
          image1_thumbnail_url: FRONT_IMAGE,
          image2_thumbnail_url: BACK_IMAGE,
          status: "approved",
          created_at: null,
        })),
        total: cardCount,
        totalPage: cardCount === 0 ? 0 : 1,
      },
    })
  })

  await page.route("**/api/reactions**", async (route) => {
    await route.fulfill({ json: {} })
  })

  await page.route("**/api/uploadNameCard", async (route) => {
    await route.fulfill({
      json: {
        msg: "名片已提交审核",
        submission: { id: 1, status: "pending", revision: 0 },
        withdrawalToken: "a".repeat(64),
      },
    })
  })
}

async function requireBoundingBox(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  if (!box) throw new Error("Expected the element to have a bounding box")
  return box
}

function boxesOverlap(first: BoundingBox, second: BoundingBox) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  )
}

test("uploads both sides from the dialog and restores trigger focus", async ({
  page,
}) => {
  await mockNamecardApi(page, 0)
  await page.goto("/community/cards")

  const uploadTrigger = page.getByRole("button", { name: "上传名片" })
  const uploadDialog = page.getByRole("dialog", {
    name: "提交制作人名片",
  })
  await expect(
    page.getByRole("heading", { name: "制作人名片墙" })
  ).toBeVisible()
  await expect(page.getByText("还没有公开名片")).toBeVisible()
  const footer = page.getByRole("contentinfo")
  await footer.scrollIntoViewIfNeeded()
  await expect(footer).toBeVisible()
  await expect(uploadTrigger).toBeVisible()
  await expect(uploadDialog).not.toBeVisible()
  await expect(page.getByLabel("名片正面", { exact: true })).not.toBeVisible()
  await expect(page.getByLabel("名片背面", { exact: true })).not.toBeVisible()

  await uploadTrigger.click()

  await expect(uploadDialog).toBeVisible()
  const frontInput = uploadDialog.getByLabel("名片正面", { exact: true })
  const backInput = uploadDialog.getByLabel("名片背面", { exact: true })
  const submitButton = uploadDialog.getByRole("button", { name: "提交审核" })
  await expect(frontInput).toHaveAttribute("type", "file")
  await expect(backInput).toHaveAttribute("type", "file")
  await expect(submitButton).toBeDisabled()
  await expect(uploadDialog.getByRole("button", { name: "取消" })).toBeVisible()
  await uploadDialog.getByRole("checkbox", { name: /天海春香/ }).click()

  await frontInput.setInputFiles({
    name: "namecard-front.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  })
  await backInput.setInputFiles({
    name: "namecard-back.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  })

  await expect(uploadDialog.getByText("namecard-front.png")).toBeVisible()
  await expect(uploadDialog.getByText("namecard-back.png")).toBeVisible()
  await expect(submitButton).toBeEnabled()

  const uploadRequestPromise = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/api/uploadNameCard" &&
      request.method() === "POST"
  )
  await submitButton.click()
  const uploadRequest = await uploadRequestPromise
  const multipartBody = uploadRequest.postDataBuffer()?.toString("utf8") ?? ""

  expect(multipartBody.match(/name="images"/g)).toHaveLength(2)
  expect(multipartBody).toContain('name="seriesCode"')
  expect(multipartBody).toContain('name="favoriteIdolIds"')
  expect(multipartBody).toContain("[1]")
  expect(multipartBody).toContain('filename="namecard-front.png"')
  expect(multipartBody).toContain('filename="namecard-back.png"')
  await expect(uploadDialog).toBeVisible()
  await expect(uploadDialog.getByText("请保存投稿管理链接")).toBeVisible()
  await expect(
    uploadDialog.getByRole("link", { name: "管理这次投稿" })
  ).toBeVisible()
  await uploadDialog.getByRole("button", { name: "取消" }).click()
  await expect(uploadDialog).not.toBeVisible()
  await expect(uploadTrigger).toBeFocused()
})

test("keeps the responsive upload action and dialog inside the viewport", async ({
  page,
}) => {
  await mockNamecardApi(page)
  await page.goto("/community/cards")

  const uploadTrigger = page.getByRole("button", { name: "上传名片" })
  const uploadLabel = uploadTrigger.getByText("上传名片", { exact: true })
  const backToTop = page.getByRole("button", { name: "返回顶部" })
  const adminShortcut = page.getByRole("link", { name: "返回管理工作台" })
  await expect(uploadTrigger).toBeVisible()
  await expect(adminShortcut).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollHeight > window.innerHeight
      )
    )
    .toBe(true)

  const triggerStyle = await uploadTrigger.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    let fixedAncestor = element.parentElement
    while (
      fixedAncestor &&
      getComputedStyle(fixedAncestor).position !== "fixed"
    ) {
      fixedAncestor = fixedAncestor.parentElement
    }
    return {
      borderRadius: Number.parseFloat(style.borderTopLeftRadius),
      hasFixedAncestor: fixedAncestor !== null,
      height: rect.height,
      width: rect.width,
    }
  })
  const viewport = page.viewportSize()
  if (!viewport) throw new Error("Expected Playwright to provide a viewport")

  expect(triggerStyle.hasFixedAncestor).toBe(true)
  if (viewport.width < 640) {
    await expect(uploadLabel).toBeHidden()
    expect(
      Math.abs(triggerStyle.width - triggerStyle.height)
    ).toBeLessThanOrEqual(1)
    expect(triggerStyle.borderRadius).toBeGreaterThanOrEqual(
      triggerStyle.width / 2 - 1
    )
  } else {
    await expect(uploadLabel).toBeVisible()
    expect(triggerStyle.width).toBeGreaterThan(triggerStyle.height + 24)
    expect(triggerStyle.borderRadius).toBeLessThan(triggerStyle.height / 2)
  }

  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  )
  await expect(backToTop).toBeVisible()

  const [uploadBox, backToTopBox, adminBox] = await Promise.all([
    requireBoundingBox(uploadTrigger),
    requireBoundingBox(backToTop),
    requireBoundingBox(adminShortcut),
  ])
  expect(boxesOverlap(uploadBox, backToTopBox)).toBe(false)
  expect(boxesOverlap(uploadBox, adminBox)).toBe(false)
  expect(boxesOverlap(backToTopBox, adminBox)).toBe(false)

  expect(uploadBox.x).toBeGreaterThanOrEqual(viewport.width / 2)
  expect(uploadBox.y).toBeGreaterThan(viewport.height / 2)
  for (const box of [uploadBox, backToTopBox, adminBox]) {
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
  }

  await uploadTrigger.click()
  const uploadDialog = page.getByRole("dialog", {
    name: "提交制作人名片",
  })
  await expect(uploadDialog).toBeVisible()
  const dialogBox = await requireBoundingBox(uploadDialog)

  expect(dialogBox.x).toBeGreaterThanOrEqual(-1)
  expect(dialogBox.y).toBeGreaterThanOrEqual(-1)
  expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(
    viewport.height + 1
  )

  const overflow = await uploadDialog.evaluate((element) => ({
    dialog: element.scrollWidth > element.clientWidth,
    document:
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  }))
  expect(overflow.dialog).toBe(false)
  expect(overflow.document).toBe(false)
})

test("keeps the upload action on the trailing-slash route", async ({
  page,
}) => {
  await mockNamecardApi(page, 0)

  await page.goto("/community/cards/")

  await expect(page.getByRole("button", { name: "上传名片" })).toBeVisible()
  await expect(page.getByText("还没有公开名片")).toBeVisible()
})
