import { expect, type Page, type TestInfo } from "@playwright/test"

export async function mockNamecardBrowsing(
  page: Page,
  total = 26,
  initialReactions: Record<number, Record<string, number>> = {
    2: { "👍": 2, "🎮": 4, "🌹": 3, "🍔": 5, "🍭": 6, "🔨": 7 },
  }
) {
  const pictures = await page.evaluate(() => {
    return [false, true].map((portrait) => {
      const canvas = document.createElement("canvas")
      canvas.width = portrait ? 400 : 600
      canvas.height = portrait ? 600 : 400
      const context = canvas.getContext("2d")!
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, canvas.width, canvas.height)
      const colors = ["#e64065", "#2581c7", "#11a880", "#efb51c"]
      colors.forEach((color, index) => {
        context.fillStyle = color
        context.fillRect(
          index % 2 ? canvas.width - 32 : 0,
          index > 1 ? canvas.height - 32 : 0,
          32,
          32
        )
      })
      context.fillStyle = portrait ? "#2581c7" : "#e64065"
      context.fillRect(32, 60, 8, canvas.height - 120)
      context.fillStyle = "#202124"
      context.font = "bold 30px sans-serif"
      context.fillText("PRODUCER CARD", 60, 112)
      context.font = "20px sans-serif"
      context.fillText(
        portrait ? "BACK / 400 x 600" : "FRONT / 600 x 400",
        60,
        160
      )
      context.fillText("完整图像检查", 60, 210)
      context.fillStyle = "#e6e8eb"
      for (let y = 250; y < canvas.height - 60; y += 36) {
        context.fillRect(60, y, canvas.width - 120, 6)
      }
      return canvas.toDataURL("image/png").split(",")[1]!
    })
  })
  const requests: number[] = []
  let failingPage: number | null = null
  let heldPage: number | null = null
  let releaseHeld: (() => void) | undefined
  let held: Promise<void> | undefined

  await page.route("**/__namecard-qa/**", async (route) => {
    const back = route.request().url().includes("back")
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from(pictures[back ? 1 : 0]!, "base64"),
    })
  })
  await page.route("**/api/cards?**", async (route) => {
    const url = new URL(route.request().url())
    const currentPage = Number(url.searchParams.get("page"))
    const size = Number(url.searchParams.get("size"))
    requests.push(currentPage)
    if (heldPage === currentPage) await held
    if (failingPage === currentPage) {
      failingPage = null
      await route.fulfill({ status: 503, json: { error: "Unavailable" } })
      return
    }
    const offset = (currentPage - 1) * size
    await route.fulfill({
      json: {
        list: Array.from(
          { length: Math.max(0, Math.min(size, total - offset)) },
          (_, index) => {
            const id = offset + index + 1
            return {
              id,
              seriesCode: null,
              favoriteIdols: [],
              claimStatus: "unclaimed",
              viewerClaimState: null,
              image1_url: `/__namecard-qa/front-${id}.png`,
              image2_url: `/__namecard-qa/back-${id}.png`,
              image1_thumbnail_url: `/__namecard-qa/front-thumb-${id}.png`,
              image2_thumbnail_url: `/__namecard-qa/back-thumb-${id}.png`,
              status: "approved",
              created_at: "2026-09-01T08:00:00.000Z",
            }
          }
        ),
        total,
        totalPage: Math.ceil(total / size),
      },
    })
  })
  const reactions = new Map<number, Record<string, number>>(
    Object.entries(initialReactions).map(([id, counts]) => [Number(id), counts])
  )
  const reactionHolds = new Map<number, Promise<void>>()
  await page.route("**/api/reactions?**", async (route) => {
    const id = Number(new URL(route.request().url()).searchParams.get("id"))
    await reactionHolds.get(id)
    await route.fulfill({ json: reactions.get(id) ?? { "👍": 2 } })
  })
  await page.route("**/api/reactions", async (route) => {
    const { id, emoji } = route.request().postDataJSON() as {
      id: number
      emoji: string
    }
    const counts = reactions.get(id) ?? { "👍": 2 }
    reactions.set(id, { ...counts, [emoji]: (counts[emoji] ?? 0) + 1 })
    await route.fulfill({ json: { ok: true } })
  })
  await page.route("**/api/platform/auth/session", (route) =>
    route.fulfill({
      status: 401,
      json: { success: false, code: "PLATFORM_AUTH_REQUIRED" },
    })
  )
  await page.route("**/api/admin/auth/session**", (route) =>
    route.fulfill({ status: 401, json: { success: false } })
  )
  return {
    requests,
    holdReactions(id: number) {
      let release: () => void = () => undefined
      reactionHolds.set(
        id,
        new Promise<void>((resolve) => {
          release = resolve
        })
      )
      return () => {
        reactionHolds.delete(id)
        release()
      }
    },
    failOnce(currentPage: number) {
      failingPage = currentPage
    },
    hold(currentPage: number) {
      heldPage = currentPage
      held = new Promise<void>((resolve) => {
        releaseHeld = resolve
      })
    },
    release() {
      heldPage = null
      releaseHeld?.()
    },
  }
}

export async function applyNamecardSafeArea(page: Page) {
  await expect
    .poll(async () => {
      try {
        await page.evaluate(() => {
          const landscape = innerWidth > innerHeight
          const insets = landscape
            ? { top: 0, right: 47, bottom: 21, left: 47 }
            : { top: 47, right: 0, bottom: 34, left: 0 }
          for (const [side, value] of Object.entries(insets)) {
            document.documentElement.style.setProperty(
              `--safe-area-${side}`,
              `${value}px`,
              "important"
            )
          }
        })
        return true
      } catch {
        return false
      }
    })
    .toBe(true)
}

export async function expectNamecardNoOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    )
    .toBe(true)
}

export async function expectNamecardGalleryGeometry(page: Page) {
  const cards = page.locator('[data-slot="card"]').filter({
    has: page.getByRole("button", { name: /查看制作人名片 \d+ 正面/ }),
  })
  await expect(cards).toHaveCount(12)
  const mobile = page.viewportSize()!.width < 768
  if (mobile) {
    await expect
      .poll(() =>
        cards.evaluateAll((elements) => {
          const boxes = elements.map((element) =>
            element.getBoundingClientRect()
          )
          return boxes.every((box, index) => {
            if (index < 2) return true
            const gap = box.top - boxes[index - 2]!.bottom
            return gap >= 11.5 && gap <= 13.5
          })
        })
      )
      .toBe(true)
  }
  const geometry = await cards.evaluateAll((elements) => {
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect()
      return {
        x: box.x,
        y: box.y,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      }
    }
    return elements.map((element) => ({
      box: rect(element),
      background: getComputedStyle(element).backgroundColor,
      radius: getComputedStyle(element).borderTopLeftRadius,
      nestedCards: element.querySelectorAll('[data-slot="card"]').length,
      images: Array.from(
        element.querySelectorAll<HTMLButtonElement>(
          'button[aria-label^="查看制作人名片"]'
        )
      ).map((button) => ({
        ...rect(button),
        label: button.getAttribute("aria-label"),
        fit: getComputedStyle(button.querySelector("img")!).objectFit,
      })),
    }))
  })
  const [first, second, third, fourth] = geometry
  expect(first!.box.width).toBeCloseTo(second!.box.width, 0)
  expect(second!.box.x).toBeGreaterThanOrEqual(first!.box.right + 7)
  expect(second!.box.y - first!.box.y).toBeCloseTo(0, 0)
  if (!mobile || Math.abs(first!.box.height - second!.box.height) < 0.1) {
    expect(fourth!.box.y - third!.box.y).toBeCloseTo(0, 0)
  }
  expect(third!.box.x).toBeCloseTo(first!.box.x, 0)
  expect(fourth!.box.x).toBeCloseTo(second!.box.x, 0)
  expect(third!.box.y).toBeGreaterThanOrEqual(first!.box.bottom + 7)
  expect(fourth!.box.y).toBeGreaterThanOrEqual(second!.box.bottom + 7)
  for (const card of geometry) {
    expect(card.images).toHaveLength(2)
    const [front, back] = card.images
    for (const image of card.images) {
      expect(image.width).toBeGreaterThanOrEqual(44)
      expect(image.height).toBeGreaterThanOrEqual(44)
      expect(image.x).toBeGreaterThanOrEqual(card.box.x)
      expect(image.right).toBeLessThanOrEqual(card.box.right + 1)
    }
    if (mobile) {
      expect(card.background).not.toBe("rgba(0, 0, 0, 0)")
      expect(Number.parseFloat(card.radius)).toBe(8)
      expect(card.nestedCards).toBe(0)
      expect(back!.x).toBeCloseTo(front!.x, 0)
      expect(back!.y).toBeGreaterThanOrEqual(front!.bottom)
      expect(front!.fit).toBe("contain")
      expect(back!.fit).toBe("contain")
    } else {
      expect(back!.x).toBeGreaterThanOrEqual(front!.right)
      expect(back!.y).toBeCloseTo(front!.y, 0)
    }
  }
  const pagination = await page
    .getByRole("button", { name: "上一页", exact: true })
    .boundingBox()
  expect(pagination).not.toBeNull()
  expect(
    Math.max(...geometry.map((card) => card.box.bottom))
  ).toBeLessThanOrEqual(pagination!.y)
  const viewport = page.viewportSize()!
  if (viewport.width === 390 && viewport.height === 844) {
    const availableBottom = await page.evaluate(() => {
      const shell = document.querySelector("[data-app-shell]")
      const bottom = Array.from(shell?.querySelectorAll("nav") ?? [])
        .find(
          (nav) =>
            getComputedStyle(nav).position === "fixed" &&
            nav.getBoundingClientRect().top > innerHeight / 2
        )
        ?.getBoundingClientRect().top
      return bottom && bottom > innerHeight / 2 ? bottom : innerHeight
    })
    expect(first!.images[1]!.bottom).toBeLessThanOrEqual(availableBottom)
    expect(second!.images[1]!.bottom).toBeLessThanOrEqual(availableBottom)
    expect(third!.images[0]!.y).toBeLessThan(availableBottom)
  }
  await expectNamecardNoOverflow(page)
}

export async function expectNamecardPaginationGeometry(page: Page) {
  const pagination = page.getByRole("navigation", { name: "名片分页" })
  await pagination.scrollIntoViewIfNeeded()
  const controls = await pagination.evaluate((element) =>
    Array.from(element.querySelectorAll("button,#namecard-target-page"))
      .filter((control) => control.getClientRects().length > 0)
      .map((control) => {
        const box = control.getBoundingClientRect()
        return {
          x: box.x,
          y: box.y,
          right: box.right,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
        }
      })
  )
  expect(controls).toHaveLength(5)
  for (const [index, control] of controls.entries()) {
    expect(control.width).toBeGreaterThanOrEqual(43.5)
    expect(control.height).toBeGreaterThanOrEqual(43.5)
    expect(control.x).toBeGreaterThanOrEqual(0)
    expect(control.right).toBeLessThanOrEqual(page.viewportSize()!.width)
    for (const other of controls.slice(index + 1)) {
      const overlap =
        Math.min(control.right, other.right) - Math.max(control.x, other.x) >
          0.5 &&
        Math.min(control.bottom, other.bottom) - Math.max(control.y, other.y) >
          0.5
      expect(overlap).toBe(false)
    }
  }
  if (page.viewportSize()!.width < 768) {
    const input = await pagination
      .getByRole("spinbutton", { name: "跳至" })
      .boundingBox()
    for (const name of ["上一页", "跳转", "下一页"]) {
      const button = await pagination
        .getByRole("button", { name, exact: true })
        .boundingBox()
      expect(button!.y).toBeCloseTo(input!.y, 0)
    }
    const size = await pagination
      .getByRole("combobox", { name: "每页显示" })
      .boundingBox()
    expect(size!.y).toBeGreaterThanOrEqual(input!.y + input!.height + 7)
    expect((await pagination.boundingBox())!.height).toBeLessThanOrEqual(120)
  }
  await expectNamecardNoOverflow(page)
}

export async function expectNamecardPaginationHitTargets(page: Page) {
  const pagination = page.getByRole("navigation", { name: "名片分页" })
  await pagination.scrollIntoViewIfNeeded()
  await expect(page.locator("[data-app-floating-actions]")).toBeHidden()
  await expect
    .poll(() =>
      pagination.evaluate((element) =>
        Array.from(
          element.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
            "button,#namecard-target-page"
          )
        )
          .filter((control) => !control.disabled)
          .filter((control) => {
            const box = control.getBoundingClientRect()
            return [0.25, 0.5, 0.75].some((x) =>
              [0.25, 0.5, 0.75].some((y) => {
                const hit = document.elementFromPoint(
                  box.x + box.width * x,
                  box.y + box.height * y
                )
                return !hit || !control.contains(hit)
              })
            )
          })
          .map((control) => control.getAttribute("aria-label") ?? control.id)
      )
    )
    .toEqual([])
}

export async function expectNamecardReactionDensity(page: Page) {
  const groups = page.locator('[data-namecard-item] [aria-label="名片反应"]')
  await expect(groups.first()).toBeVisible()
  await expect
    .poll(() =>
      groups.evaluateAll((elements) => {
        const mobile = !matchMedia("(min-width: 48rem)").matches
        return elements.every((group) => {
          const card = group.closest("[data-namecard-item]")!
          const cardBox = card.getBoundingClientRect()
          const date = card.querySelector("time")?.getBoundingClientRect()
          const back = card
            .querySelectorAll("button")[1]!
            .getBoundingClientRect()
          if (
            date &&
            (date.top < back.bottom - 0.5 ||
              date.bottom > group.getBoundingClientRect().top + 0.5 ||
              date.left < cardBox.left ||
              date.right > cardBox.right)
          )
            return false
          const rows = new Map<number, number>()
          return Array.from(group.querySelectorAll("button")).every(
            (button) => {
              const box = button.getBoundingClientRect()
              const row = Math.round(box.y)
              rows.set(row, (rows.get(row) ?? 0) + 1)
              const image = button.querySelector("img")
              const imageBox = image?.getBoundingClientRect()
              return (
                (!mobile || rows.get(row)! <= 4) &&
                box.width >= 43.5 &&
                box.height >= 43.5 &&
                box.left >= cardBox.left - 0.5 &&
                box.right <= cardBox.right + 0.5 &&
                button.scrollWidth <= button.clientWidth &&
                (!image ||
                  (image.complete &&
                    image.naturalWidth > 0 &&
                    Math.abs(imageBox!.width - (mobile ? 16 : 20)) < 0.1 &&
                    Math.abs(imageBox!.height - (mobile ? 16 : 20)) < 0.1 &&
                    getComputedStyle(button).fontSize ===
                      (mobile ? "12px" : "14px")))
              )
            }
          )
        })
      })
    )
    .toBe(true)
  await expectNamecardNoOverflow(page)
}

export async function expectNamecardReactionGraphics(page: Page) {
  const buttons = page.getByRole("button", { name: /，添加反应$/ })
  const images = buttons.locator("img")
  await expect(images).toHaveCount(46)
  await expect
    .poll(() =>
      images.evaluateAll((elements) =>
        elements.every((element) => {
          const image = element as HTMLImageElement
          const box = image.getBoundingClientRect()
          return (
            image.complete &&
            image.naturalWidth > 0 &&
            image.getAttribute("src")?.startsWith("/emoji/twemoji/") &&
            Math.abs(box.width - 20) < 0.1 &&
            Math.abs(box.height - 20) < 0.1 &&
            image.alt === "" &&
            image.parentElement?.textContent?.trim() === ""
          )
        })
      )
    )
    .toBe(true)
}

export async function expectNamecardPreviewGeometry(page: Page) {
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.evaluate(async (element) => {
    await Promise.allSettled(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished)
    )
  })
  const geometry = await dialog.evaluate((element) => {
    const root = getComputedStyle(document.documentElement)
    const inset = (side: string) =>
      Number.parseFloat(root.getPropertyValue(`--safe-area-${side}`)) || 0
    const buttons = Array.from(element.querySelectorAll("button"))
      .filter((button) => button.getClientRects().length > 0)
      .map((button) => {
        const box = button.getBoundingClientRect()
        return {
          label: button.getAttribute("aria-label") ?? button.textContent,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        }
      })
    return {
      buttons,
      left: inset("left"),
      top: inset("top"),
      right: innerWidth - inset("right"),
      bottom: innerHeight - inset("bottom"),
      overflow: element.scrollWidth > element.clientWidth,
    }
  })
  expect(geometry.overflow).toBe(false)
  for (const button of geometry.buttons) {
    expect(button.width, button.label ?? "button").toBeGreaterThanOrEqual(43.5)
    expect(button.height, button.label ?? "button").toBeGreaterThanOrEqual(43.5)
    expect(button.x).toBeGreaterThanOrEqual(geometry.left - 1)
    expect(button.y).toBeGreaterThanOrEqual(geometry.top - 1)
    expect(button.x + button.width).toBeLessThanOrEqual(geometry.right + 1)
    expect(button.y + button.height).toBeLessThanOrEqual(geometry.bottom + 1)
  }
  for (let i = 0; i < geometry.buttons.length; i += 1) {
    for (const other of geometry.buttons.slice(i + 1)) {
      const button = geometry.buttons[i]!
      const overlap =
        button.x < other.x + other.width - 1 &&
        button.x + button.width > other.x + 1 &&
        button.y < other.y + other.height - 1 &&
        button.y + button.height > other.y + 1
      expect(overlap, `${button.label} overlaps ${other.label}`).toBe(false)
    }
  }
  await expectNamecardNoOverflow(page)
}

export async function attachNamecardScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string
) {
  await expect
    .poll(() =>
      page.locator("main img, [role=dialog] img").evaluateAll((images) =>
        images
          .filter((image) => {
            const box = image.getBoundingClientRect()
            return (
              box.width > 0 &&
              box.height > 0 &&
              box.bottom > 0 &&
              box.y < innerHeight
            )
          })
          .every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0
          )
      )
    )
    .toBe(true)
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: false })
  await testInfo.attach(name, { path, contentType: "image/png" })
}
