import { expect, test } from "./fixtures/test"

import { installHomepageLinksMock } from "./fixtures/homepage"
import {
  homeSeededApis,
  installSeededPublicApis,
} from "./fixtures/public-content"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
  })
})

test(
  "work detail content stays below the sticky site header",
  {
    tag: "@mobile",
  },
  async ({ page, api, isMobile }) => {
    installSeededPublicApis(api, [{ path: "/api/wiki/catalog", times: 1 }])
    if (!isMobile) {
      await page.setViewportSize({ width: 1600, height: 900 })
    }
    await page.goto("/works/sc")

    const header = page.getByRole("banner")
    const title = page.getByRole("heading", {
      name: "THE IDOLM@STER",
      exact: true,
    })
    await expect(header).toBeVisible()
    await expect(title).toBeVisible()

    const headerBox = await header.boundingBox()
    const titleBox = await title.boundingBox()
    expect(headerBox).not.toBeNull()
    expect(titleBox).not.toBeNull()
    expect(titleBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height)

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    )
    expect(hasHorizontalOverflow).toBe(false)

    if (!isMobile) {
      const copyBox = await page.getByTestId("work-detail-copy").boundingBox()
      const navBox = await page.getByTestId("work-nav-card").boundingBox()
      const character = page.getByRole("img", {
        name: "SHINY COLORS 角色立绘",
      })
      expect(copyBox).not.toBeNull()
      expect(navBox).not.toBeNull()
      expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(navBox!.x)
      await expect(character).toHaveCSS("opacity", "1")
      await expect(character.locator("..")).toHaveCSS("position", "relative")
    }
  }
)

test("work detail keeps narrow-screen artwork behind the copy", async ({
  page,
  api,
}) => {
  installSeededPublicApis(api, [{ path: "/api/wiki/catalog", times: 1 }])
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto("/works/sc")

  const headerBox = await page.getByRole("banner").boundingBox()
  const titleBox = await page
    .getByRole("heading", { name: "THE IDOLM@STER", exact: true })
    .boundingBox()
  const copyBox = await page.getByTestId("work-detail-copy").boundingBox()
  const character = page.getByRole("img", {
    name: "SHINY COLORS 角色立绘",
  })

  expect(headerBox).not.toBeNull()
  expect(titleBox).not.toBeNull()
  expect(copyBox).not.toBeNull()
  expect(titleBox!.y).toBeLessThan(headerBox!.y + headerBox!.height + 160)
  expect(copyBox!.x).toBeGreaterThanOrEqual(0)
  expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(768)
  await expect(character).toHaveCSS("opacity", "0.2")
  await expect(character.locator("..")).toHaveCSS("position", "absolute")
})

test(
  "work detail carries the lightweight global series background",
  {
    tag: "@mobile",
  },
  async ({ page, api, isMobile }) => {
    installSeededPublicApis(api, [{ path: "/api/wiki/catalog", times: 1 }])
    await page.goto("/works/sc")

    const background = page.getByTestId("series-icon-background")
    const motifs = background.locator(".series-icon-motif")
    await expect(background).toBeVisible()
    await expect(motifs).toHaveCount(12)
    await expect(motifs.filter({ visible: true })).toHaveCount(
      isMobile ? 8 : 12
    )

    const visibleWidths = await motifs.evaluateAll((elements) =>
      elements
        .filter((element) => !(element as HTMLElement).hidden)
        .map((element) => Number.parseFloat(getComputedStyle(element).width))
    )
    const [minimumWidth, maximumWidth] = isMobile ? [50, 98] : [68, 136]
    expect(
      visibleWidths.every(
        (width) => width >= minimumWidth && width <= maximumWidth
      )
    ).toBe(true)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true)

    const firstMotif = motifs.first()
    await expect(firstMotif).toHaveCSS("filter", "none")
    await expect(firstMotif).toHaveCSS("will-change", "transform")
    const initialTransform = await firstMotif.evaluate(
      (element) => element.style.transform
    )
    await expect
      .poll(() => firstMotif.evaluate((element) => element.style.transform))
      .not.toBe(initialTransform)
  }
)

test("desktop navigation lens stays within its glass segment", async ({
  page,
  api,
  isMobile,
}) => {
  test.skip(isMobile, "desktop navigation is hidden on mobile")
  test.slow()
  installSeededPublicApis(api, [
    { path: "/api/wiki/random_idol", times: 2 },
    { path: "/api/wiki/catalog", times: 1 },
    { path: "/api/community-posts/spotlight", times: 2 },
    { path: "/api/homepage-links", times: 2 },
    { path: "/api/news", times: 3 },
    { path: "/api/events", times: 3 },
    { path: "/api/live-schedule", times: 1 },
    { path: "/api/community/exchange/series", times: 1 },
    { path: "/api/about", times: 2 },
  ])

  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto("/", { waitUntil: "domcontentloaded" })

  const navigation = page.getByRole("navigation", {
    name: /主导航|Main navigation/,
  })
  const lens = navigation.locator(".glass-lens")
  const segment = lens.locator("..")
  const skin = lens.locator(".glass-lens-skin")
  const links = navigation.getByRole("link")
  const interactiveHighlight = page.locator(
    ".glass-sheen, .glass-control, [data-glass-interactive]"
  )
  const ringOutset = 1
  const navigationPaths = [
    "/",
    "/events",
    "/recommendations",
    "/live",
    "/community",
    "/about",
  ]
  const expectedKeyframes = [
    { progress: 0, scaleX: 1, scaleY: 1 },
    { progress: 28, scaleX: 1.22, scaleY: 0.89 },
    { progress: 64, scaleX: 0.9384, scaleY: 1.044 },
    { progress: 100, scaleX: 1, scaleY: 1 },
  ]

  async function waitForMeasuredTarget(activeLink: typeof links) {
    await expect
      .poll(
        async () => {
          try {
            return await activeLink.evaluate((link) => {
              if (!(link instanceof HTMLElement)) return false

              const lensElement =
                link.parentElement?.querySelector(".glass-lens")
              if (!(lensElement instanceof HTMLElement)) return false
              if (lensElement.dataset.visible !== "true") return false

              return (
                Math.abs(
                  Number.parseFloat(lensElement.style.translate) -
                    link.offsetLeft
                ) <= 1 &&
                Math.abs(
                  Number.parseFloat(lensElement.style.width) - link.offsetWidth
                ) <= 1
              )
            })
          } catch {
            return false
          }
        },
        {
          message: "desktop navigation lens should measure its active link",
          timeout: 15_000,
        }
      )
      .toBe(true)
  }

  async function waitForMeasuredGeometry(activeLink: typeof links) {
    await waitForMeasuredTarget(activeLink)
    await expect
      .poll(
        async () => {
          try {
            return await activeLink.evaluate((link) => {
              const lensElement =
                link.parentElement?.querySelector(".glass-lens")
              if (!(lensElement instanceof HTMLElement)) return false

              const linkBounds = link.getBoundingClientRect()
              const lensBounds = lensElement.getBoundingClientRect()
              return (
                Math.abs(lensBounds.left - linkBounds.left) <= 1 &&
                Math.abs(lensBounds.width - linkBounds.width) <= 1
              )
            })
          } catch {
            return false
          }
        },
        {
          message: "desktop navigation lens should settle over its active link",
          timeout: 15_000,
        }
      )
      .toBe(true)
  }

  await expect(links).toHaveCount(6)
  await expect(interactiveHighlight).toHaveCount(0)
  await waitForMeasuredGeometry(links.first())
  await expect(lens).toHaveAttribute("data-visible", "true")
  await expect(lens).toHaveCSS("opacity", "1")

  const [segmentBounds, lensBounds] = await Promise.all([
    segment.boundingBox(),
    lens.boundingBox(),
  ])
  expect(segmentBounds).not.toBeNull()
  expect(lensBounds).not.toBeNull()
  const restingTopGap = lensBounds!.y - segmentBounds!.y
  const restingBottomGap =
    segmentBounds!.y +
    segmentBounds!.height -
    (lensBounds!.y + lensBounds!.height)
  expect(restingTopGap - ringOutset).toBeGreaterThanOrEqual(5)
  expect(restingBottomGap - ringOutset).toBeGreaterThanOrEqual(5)

  for (let index = 0; index < navigationPaths.length; index += 1) {
    if (index > 0) {
      await page.goto(navigationPaths[index], {
        waitUntil: "domcontentloaded",
      })
    }

    const activeLink = navigation.locator(`a[href="${navigationPaths[index]}"]`)
    await expect(activeLink).toHaveAttribute("aria-current", "page")
    await waitForMeasuredGeometry(activeLink)
    await expect(skin).toBeVisible()
    await skin.evaluate((element) => {
      for (const animation of element.getAnimations()) animation.finish()
    })

    const geometry = await activeLink.evaluate((link, ringWidth) => {
      const lensElement = link.parentElement?.querySelector(".glass-lens")
      const skinElement = lensElement?.querySelector(".glass-lens-skin")
      if (
        !(lensElement instanceof HTMLElement) ||
        !(skinElement instanceof HTMLElement)
      ) {
        throw new Error("desktop navigation lens geometry is unavailable")
      }

      const linkBounds = link.getBoundingClientRect()
      const lensBounds = lensElement.getBoundingClientRect()
      const skinBounds = skinElement.getBoundingClientRect()
      const textRange = document.createRange()
      textRange.selectNodeContents(link)
      const textBounds = textRange.getBoundingClientRect()
      const computedTransform = window.getComputedStyle(skinElement).transform
      const transform =
        computedTransform === "none"
          ? new DOMMatrixReadOnly()
          : new DOMMatrixReadOnly(computedTransform)
      const scaleX = Math.hypot(transform.a, transform.b)
      const paintedLeft = skinBounds.left - ringWidth * scaleX
      const paintedRight = skinBounds.right + ringWidth * scaleX

      return {
        link: {
          left: linkBounds.left,
          right: linkBounds.right,
          width: linkBounds.width,
          height: linkBounds.height,
        },
        lens: {
          left: lensBounds.left,
          right: lensBounds.right,
          width: lensBounds.width,
        },
        paintedLeft,
        paintedRight,
        paintedWidth: paintedRight - paintedLeft,
        paintedCenter: (paintedLeft + paintedRight) / 2,
        textWidth: textBounds.width,
      }
    }, ringOutset)

    expect(
      Math.abs(geometry.lens.left - geometry.link.left),
      `${navigationPaths[index]} lens frame should match its active link`
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(geometry.lens.width - geometry.link.width)
    ).toBeLessThanOrEqual(1)
    expect(
      geometry.paintedLeft,
      `${navigationPaths[index]} lens ring should stay inside the left frame edge`
    ).toBeGreaterThanOrEqual(geometry.lens.left - 0.5)
    expect(
      geometry.paintedRight,
      `${navigationPaths[index]} lens ring should stay inside the right frame edge`
    ).toBeLessThanOrEqual(geometry.lens.right + 0.5)
    expect(
      geometry.paintedWidth,
      `${navigationPaths[index]} selected material should support its text`
    ).toBeGreaterThanOrEqual(geometry.textWidth)
    expect(
      Math.abs(
        geometry.paintedCenter - (geometry.link.left + geometry.link.right) / 2
      )
    ).toBeLessThanOrEqual(1)
    expect(geometry.link.height).toBeCloseTo(36, 1)
  }

  const aboutLink = navigation.locator('a[href="/about"]')
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1600, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    await waitForMeasuredGeometry(aboutLink)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      ),
      `${viewport.width}px page should not overflow horizontally`
    ).toBe(true)
  }

  await page.goto("/", { waitUntil: "domcontentloaded" })
  await waitForMeasuredGeometry(navigation.locator('a[href="/"]'))
  await segment.evaluate((element) => {
    element.style.setProperty("--duration-ui", "10s", "important")
  })

  await aboutLink.click()
  await expect(page).toHaveURL(/\/about$/)
  await expect(aboutLink).toHaveAttribute("aria-current", "page")
  await waitForMeasuredTarget(aboutLink)

  await expect(skin).toBeVisible()
  const motionSamples = await skin.evaluate((element, ringWidth) => {
    const lensElement = element.parentElement
    const segmentElement = lensElement?.parentElement
    const animation = element.getAnimations().find((candidate) => {
      const effect = candidate.effect
      return (
        effect instanceof KeyframeEffect &&
        effect.target === element &&
        "animationName" in candidate &&
        candidate.animationName === "glass-lens-travel"
      )
    })
    const transition = lensElement?.getAnimations().find((candidate) => {
      const effect = candidate.effect
      return (
        effect instanceof KeyframeEffect &&
        effect.target === lensElement &&
        "transitionProperty" in candidate &&
        candidate.transitionProperty === "translate"
      )
    })
    if (!animation || !transition || !lensElement || !segmentElement) {
      throw new Error("desktop navigation lens animation is missing")
    }

    animation.pause()
    transition.pause()
    const animationDuration = animation.effect?.getComputedTiming().duration
    const transitionDuration = transition.effect?.getComputedTiming().duration
    if (
      typeof animationDuration !== "number" ||
      typeof transitionDuration !== "number"
    ) {
      throw new Error("desktop navigation lens duration is unavailable")
    }
    if (animationDuration !== 10_000 || transitionDuration !== 10_000) {
      throw new Error("desktop navigation lens duration override was lost")
    }

    return [0, 0.28, 0.64, 1].map((progress) => {
      animation.currentTime = animationDuration * progress
      transition.currentTime = transitionDuration * progress

      const segmentRect = segmentElement.getBoundingClientRect()
      const lensRect = lensElement.getBoundingClientRect()
      const skinRect = element.getBoundingClientRect()
      const computedTransform = window.getComputedStyle(element).transform
      const transform =
        computedTransform === "none"
          ? new DOMMatrixReadOnly()
          : new DOMMatrixReadOnly(computedTransform)
      const scaleX = Math.hypot(transform.a, transform.b)
      const scaleY = Math.hypot(transform.c, transform.d)
      const horizontalRingOutset = ringWidth * scaleX
      const verticalRingOutset = ringWidth * scaleY

      return {
        progress: Math.round(progress * 100),
        scaleX,
        scaleY,
        leftGap: skinRect.left - horizontalRingOutset - lensRect.left,
        rightGap: lensRect.right - (skinRect.right + horizontalRingOutset),
        topGap: skinRect.top - verticalRingOutset - segmentRect.top,
        bottomGap: segmentRect.bottom - (skinRect.bottom + verticalRingOutset),
      }
    })
  }, ringOutset)

  for (const [index, sample] of motionSamples.entries()) {
    expect(sample.progress).toBe(expectedKeyframes[index].progress)
    expect(sample.scaleX).toBeCloseTo(expectedKeyframes[index].scaleX, 3)
    expect(sample.scaleY).toBeCloseTo(expectedKeyframes[index].scaleY, 3)
    expect(
      sample.leftGap,
      `${sample.progress}% lens ring should stay inside the moving frame's left edge`
    ).toBeGreaterThanOrEqual(0)
    expect(
      sample.rightGap,
      `${sample.progress}% lens ring should stay inside the moving frame's right edge`
    ).toBeGreaterThanOrEqual(0)
    expect(sample.topGap).toBeGreaterThan(0)
    expect(sample.bottomGap).toBeGreaterThan(0)
  }
})

test("homepage directory uses compact responsive columns", async ({
  page,
  api,
}) => {
  installHomepageLinksMock(api)
  installSeededPublicApis(
    api,
    homeSeededApis
      .filter((registration) => registration.path !== "/api/homepage-links")
      .map((registration) =>
        registration.path === "/api/news" || registration.path === "/api/events"
          ? { ...registration, times: 2 }
          : registration
      )
  )
  await page.goto("/")

  const directory = page.getByRole("region", { name: "站点导航" })
  const grid = directory.getByTestId("portal-directory-grid")
  const description = directory.getByText("浏览近期活动与公开信息", {
    exact: true,
  })

  await expect(grid.locator('a[href="/community/exchange"]')).toBeVisible()

  for (const viewport of [
    { width: 320, expectedColumns: 2, descriptionVisible: false },
    { width: 375, expectedColumns: 2, descriptionVisible: false },
    { width: 430, expectedColumns: 2, descriptionVisible: false },
    { width: 640, expectedColumns: 2, descriptionVisible: true },
    { width: 1024, expectedColumns: 3, descriptionVisible: true },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: 900 })

    const layout = await grid.evaluate((element) => {
      const columns = getComputedStyle(element)
        .gridTemplateColumns.split(" ")
        .filter(Boolean).length
      const descriptionElement = element.querySelector(
        'a[href="/events"] [data-testid="portal-link-description"]'
      )
      const descriptionBox = descriptionElement?.getBoundingClientRect()

      return {
        columns,
        descriptionVisible: Boolean(
          descriptionBox &&
          descriptionBox.width > 1 &&
          descriptionBox.height > 1
        ),
        overflowing: element.scrollWidth > element.clientWidth,
        pageOverflowing:
          document.documentElement.scrollWidth > window.innerWidth,
      }
    })

    expect(layout, `${viewport.width}px directory layout`).toEqual({
      columns: viewport.expectedColumns,
      descriptionVisible: viewport.descriptionVisible,
      overflowing: false,
      pageOverflowing: false,
    })
  }

  await expect(description).toHaveText("浏览近期活动与公开信息")
})

test(
  "default wiki hero gives story artwork an expanded frame",
  {
    tag: "@mobile",
  },
  async ({ page, api, isMobile }) => {
    installSeededPublicApis(api, [
      {
        path: "/api/wiki/catalog",
        times: { min: 0, max: 1 },
      },
      {
        path: "/api/wiki/random_bg",
        times: { min: 0, max: 1 },
      },
    ])
    await page.goto("/wiki")

    const hero = page.getByRole("region", { name: "剧情档案视觉" })
    await expect(hero).toBeVisible()
    const heroBox = await hero.boundingBox()
    expect(heroBox).not.toBeNull()
    expect(heroBox!.height).toBeGreaterThanOrEqual(isMobile ? 448 : 480)

    const artwork = hero.getByRole("img")
    if ((await artwork.count()) > 0) {
      await expect(artwork).toHaveCSS("opacity", "1")
      await expect(artwork).toHaveCSS("object-fit", "cover")
      await expect(artwork).toHaveCSS("object-position", "50% 25%")
    }
    await expect(
      hero
        .getByRole("link", { name: "经典视图" })
        .locator('img[src="/brand/wiki-view-switch.png"]')
    ).toHaveCount(1)

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    )
    expect(hasHorizontalOverflow).toBe(false)
  }
)

test("home random idol uses a square portrait and agency marker", async ({
  page,
  api,
}) => {
  installSeededPublicApis(api, homeSeededApis)
  await page.goto("/")

  const randomIdol = page.getByRole("region", { name: "随机担当" })
  const avatar = randomIdol.getByTestId("random-idol-avatar")
  const agencyMarker = randomIdol.getByTestId("random-idol-agency-marker")
  const archiveLink = randomIdol.getByRole("link", { name: "查看剧情档案" })

  await expect(avatar).toBeVisible()
  await expect(agencyMarker).toBeVisible()
  await expect(archiveLink).toBeVisible()
  await expect(randomIdol.getByText(/剧情站收录/)).toHaveCount(0)
  await expect
    .poll(async () => {
      const box = await avatar.boundingBox()
      return box ? Math.abs(box.width - box.height) : Number.POSITIVE_INFINITY
    })
    .toBeLessThanOrEqual(1)
  await expect
    .poll(async () => {
      const [avatarBox, linkBox] = await Promise.all([
        avatar.boundingBox(),
        archiveLink.boundingBox(),
      ])
      return avatarBox && linkBox
        ? linkBox.y - (avatarBox.y + avatarBox.height)
        : Number.POSITIVE_INFINITY
    })
    .toBeLessThanOrEqual(24)
})
