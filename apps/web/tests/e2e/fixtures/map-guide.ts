import type { Page } from "@playwright/test"
import {
  fudabaCardPageSchema,
  fudabaCardQuerySchema,
  fudabaMapConfigSchema,
  fudabaMapOfficeListSchema,
  fudabaMapQuerySchema,
  fudabaOfficePageSchema,
  fudabaOfficeQuerySchema,
  fudabaSeriesListSchema,
} from "@imsweb/contracts/fudaba"
import { installHomepageLinksMock } from "./homepage"
import { installSeededPublicApis } from "./public-content"
import { expect, type ApiDispatcher } from "./test"

export const guideTargets = [
  "map",
  "search",
  "offices",
  "filters",
  "create",
  "account",
] as const
export const guideTitles = [
  "在地图上找事务所",
  "搜索地点或事务所",
  "事务所也能从名录查看",
  "筛选想看的事务所",
  "在选定位置创建事务所",
  "管理自己的事务所",
]

export function installMapGuideScene(
  api: ApiDispatcher,
  options: { beforeDirectory?: () => void | Promise<void> } = {}
) {
  // Web can receive shell links in SSR data; the App shell does not need them.
  installHomepageLinksMock(api, { min: 0, max: 3 })
  installSeededPublicApis(api, [
    { path: "/api/wiki/random_idol", times: { min: 0, max: 3 } },
    { path: "/api/wiki/catalog", times: { min: 0, max: 3 } },
    { path: "/api/news", times: { min: 0, max: 3 } },
    { path: "/api/events", times: { min: 0, max: 3 } },
    { path: "/api/community-posts/spotlight", times: { min: 0, max: 3 } },
  ])
  api.expect({
    name: "guide series",
    method: "GET",
    path: "/api/community/exchange/series",
    responses: { 200: fudabaSeriesListSchema },
    times: { min: 1, max: 8 },
    handle: () => ({ status: 200, json: { items: [] } }),
  })
  const emptyPage = {
    items: [],
    pageInfo: { hasNextPage: false, nextCursor: null },
  }
  api.expect({
    name: "guide directory",
    method: "GET",
    path: "/api/community/exchange/offices",
    query: fudabaOfficeQuerySchema,
    responses: { 200: fudabaOfficePageSchema },
    times: { min: 1, max: 8 },
    handle: async () => {
      await options.beforeDirectory?.()
      return { status: 200, json: emptyPage }
    },
  })
  api.expect({
    name: "guide cards",
    method: "GET",
    path: "/api/community/exchange/cards",
    query: fudabaCardQuerySchema,
    responses: { 200: fudabaCardPageSchema },
    times: { min: 1, max: 8 },
    handle: () => ({ status: 200, json: emptyPage }),
  })
  api.expect({
    name: "guide map",
    method: "GET",
    path: "/api/community/exchange/map/config",
    responses: { 200: fudabaMapConfigSchema },
    times: { min: 1, max: 3 },
    handle: () => ({
      status: 200,
      json: {
        provider: "maplibre",
        search: { provider: "nominatim" },
        styleUrl: "/maps/exchange-test-style.json",
      },
    }),
  })
  api.expect({
    name: "guide viewport",
    method: "GET",
    path: "/api/community/exchange/map/offices",
    query: fudabaMapQuerySchema,
    responses: { 200: fudabaMapOfficeListSchema },
    times: { min: 1, max: 32 },
    handle: () => ({ status: 200, json: { items: [], truncated: false } }),
  })
}

export async function expectGuideGeometry(page: Page, step: number) {
  const card = page.locator("[data-guide-card]")
  await expect(card).toHaveAttribute("data-guide-step", String(step))
  await expect(
    card.getByRole("heading", { name: guideTitles[step], exact: true })
  ).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate((targetName) => {
        const panel = document.querySelector<HTMLElement>("[data-guide-card]")!
        const spotlight = document.querySelector<HTMLElement>(
          "[data-guide-spotlight]"
        )!
        const target = document.querySelector<HTMLElement>(
          `[data-map-guide="${targetName}"]`
        )!
        const viewport = window.visualViewport
        const css = getComputedStyle(document.documentElement)
        const safe = (side: string) =>
          Number.parseFloat(css.getPropertyValue(`--safe-area-${side}`)) || 0
        const left = (viewport?.offsetLeft ?? 0) + safe("left"),
          top = (viewport?.offsetTop ?? 0) + safe("top")
        const right =
          (viewport?.offsetLeft ?? 0) +
          (viewport?.width ?? innerWidth) -
          safe("right")
        const bottom =
          (viewport?.offsetTop ?? 0) +
          (viewport?.height ?? innerHeight) -
          safe("bottom")
        const rect = panel.getBoundingClientRect(),
          anchor = target.getBoundingClientRect(),
          hole = spotlight.getBoundingClientRect()
        const wanted = new DOMMatrix(panel.style.transform)
        const near = (a: number, b: number) => Math.abs(a - b) < 0.75
        const menu = target.closest<HTMLElement>('[role="menu"]')
        const menuFrame = menu?.getBoundingClientRect()
        const targetVisible =
          !menu ||
          !menuFrame ||
          (anchor.top >= menuFrame.top + menu.clientTop - 1 &&
            anchor.bottom <=
              menuFrame.top + menu.clientTop + menu.clientHeight + 1)
        const body = panel.querySelector<HTMLElement>(
          ".exchange-map-guide-body"
        )!
        const footerFits =
          panel.dataset.scrollWhole === "true" ||
          (body.clientHeight >= Math.min(64, body.scrollHeight) &&
            [...panel.querySelectorAll("button")].every((button) => {
              const box = button.getBoundingClientRect()
              return (
                box.width >= 43.99 &&
                box.height >= 43.99 &&
                box.left >= rect.left &&
                box.right <= rect.right + 1 &&
                box.top >= rect.top &&
                box.bottom <= rect.bottom + 1
              )
            }))
        return (
          targetVisible &&
          footerFits &&
          near(rect.x, wanted.m41) &&
          near(rect.y, wanted.m42) &&
          near(rect.width, Number.parseFloat(panel.style.width)) &&
          near(rect.height, Number.parseFloat(panel.style.height)) &&
          rect.left >= left &&
          rect.top >= top &&
          rect.right <= right + 1 &&
          rect.bottom <= bottom + 1 &&
          near(hole.left, Math.max(left, anchor.left - 5)) &&
          near(hole.top, Math.max(top, anchor.top - 5)) &&
          near(hole.right, Math.min(right, anchor.right + 5)) &&
          near(hole.bottom, Math.min(bottom, anchor.bottom + 5))
        )
      }, guideTargets[step])
    )
    .toBe(true)
  for (const button of await card.getByRole("button").all()) {
    if ((await card.getAttribute("data-scroll-whole")) === "true")
      await button.scrollIntoViewIfNeeded()
    const { rect, bounds } = await button.evaluate((button) => ({
      rect: button.getBoundingClientRect().toJSON(),
      bounds: button
        .closest("[data-guide-card]")!
        .getBoundingClientRect()
        .toJSON(),
    }))
    // Translated DOMRects can be a few float32 ulps below an exact 44px.
    expect(Math.round(rect.width * 100)).toBeGreaterThanOrEqual(4400)
    expect(Math.round(rect.height * 100)).toBeGreaterThanOrEqual(4400)
    expect(rect.x).toBeGreaterThanOrEqual(bounds.x)
    expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1)
    expect(rect.y).toBeGreaterThanOrEqual(bounds.y)
    expect(rect.y + rect.height).toBeLessThanOrEqual(
      bounds.y + bounds.height + 1
    )
  }
  expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true
  )
  return (await card.boundingBox())!
}

export async function sampleGuideMotion(
  page: Page,
  action: () => Promise<unknown>
) {
  const recording = await page.evaluateHandle(() => {
    const element = document.querySelector<HTMLElement>("[data-guide-card]")!
    const spotlight = document.querySelector<HTMLElement>(
      "[data-guide-spotlight]"
    )!
    const initialStep = element.dataset.guideStep
    const frames: {
      x: number
      y: number
      width: number
      holeHeight: number
      time: number
      motion: string | undefined
      transition: string
    }[] = []
    const interpolation: {
      phase: number
      y: number
      holeHeight: number
    }[] = []
    const transitions: { property: string; duration: number; state: string }[] =
      []
    let activeAnimations: CSSTransition[] = []
    const completedTransitions: string[] = []
    let started!: () => void
    const transitionStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    let frame = 0
    const observer = new MutationObserver(() => {
      if (element.dataset.guideStep === initialStep) return
      const animations = [element, spotlight].flatMap((target) =>
        target
          .getAnimations()
          .filter((animation) => animation instanceof CSSTransition)
      )
      if (
        !animations.some(
          (animation) =>
            animation.effect instanceof KeyframeEffect &&
            animation.effect.target === element &&
            animation.transitionProperty === "transform"
        )
      )
        return
      observer.disconnect()
      activeAnimations = animations
      const originals = animations.map((animation) => ({
        animation,
        time: animation.currentTime,
        duration: Number(animation.effect!.getTiming().duration),
      }))
      for (const { animation, duration } of originals) {
        transitions.push({
          property: animation.transitionProperty,
          duration,
          state: animation.playState,
        })
        animation.pause()
      }
      // Check the browser's rendered interpolation without relying on a CI
      // frame arriving inside the 140ms transition. Resume the normal timeline
      // before this observer returns; live RAF samples remain separate evidence.
      for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
        for (const { animation, duration } of originals)
          animation.currentTime = duration * phase
        interpolation.push({
          phase,
          y: element.getBoundingClientRect().y,
          holeHeight: spotlight.getBoundingClientRect().height,
        })
      }
      for (const { animation, time } of originals) {
        animation.currentTime = time
        animation.play()
      }
      started()
    })
    observer.observe(element, {
      attributes: true,
      attributeFilter: ["style", "data-guide-step"],
    })
    const sample = (time: number) => {
      const card = element.getBoundingClientRect()
      const hole = spotlight.getBoundingClientRect()
      frames.push({
        x: card.x,
        y: card.y,
        width: card.width,
        holeHeight: hole.height,
        time,
        motion: element.dataset.guideMotion,
        transition: getComputedStyle(element).transitionDuration,
      })
      frame = requestAnimationFrame(sample)
    }
    sample(performance.now())
    return {
      frames,
      interpolation,
      transitions,
      completedTransitions,
      complete: async () => {
        await transitionStarted
        const results = await Promise.allSettled(
          activeAnimations.map((animation) => animation.finished)
        )
        completedTransitions.push(...results.map((result) => result.status))
      },
      stop: () => {
        observer.disconnect()
        cancelAnimationFrame(frame)
      },
    }
  })
  try {
    await action()
    await recording.evaluate((value) => value.complete())
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let frames = 0
          const sample = () => {
            if (++frames === 12) resolve()
            else requestAnimationFrame(sample)
          }
          requestAnimationFrame(sample)
        })
    )
    return await recording.evaluate(
      ({ frames, interpolation, transitions, completedTransitions }) => ({
        frames,
        interpolation,
        transitions,
        completedTransitions,
      })
    )
  } finally {
    await recording.evaluate((value) => value.stop())
    await recording.dispose()
  }
}
