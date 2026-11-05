import AxeBuilder from "@axe-core/playwright"
import { writeFile } from "node:fs/promises"
import { expect, test } from "./fixtures/test"
import { expectNamecardNoOverflow } from "./fixtures/namecard-browsing"
import {
  prepareWallInsightState,
  wallInsightStates,
} from "./fixtures/wall-insights-states"

for (const theme of ["light", "dark"] as const) {
  for (const state of wallInsightStates) {
    test(
      state.id + " " + theme + " @mobile @extended",
      async ({ page, api }, testInfo) => {
        await page.addInitScript((selectedTheme) => {
          localStorage.setItem("imsweb.wall-insights.collapsed", "0")
          localStorage.setItem("theme", selectedTheme)
        }, theme)
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" })
        const control = await prepareWallInsightState(page, api, state)
        const shots: Array<{ path: string; capture: string; title: string }> =
          []
        try {
          const summaryResponse = page.waitForResponse((response) =>
            new URL(response.url()).pathname.endsWith("/cards/wall-insights")
          )
          await page.goto("/community/cards")
          await expect(
            page.getByRole("button", { name: "查看制作人名片 1 正面" })
          ).toBeVisible()
          await page.evaluate(() => document.fonts.ready)
          await expect(
            page.getByRole("button", {
              name: "帐号：" + (control.viewerName ?? "未登录"),
              exact: true,
            })
          ).toBeVisible()
          await expect(page.locator("html")).toHaveClass(new RegExp(theme))
          const panel = page.getByRole("region", { name: "名片墙维护进度" })
          if (state.id === "panel-loading") {
            await expect(panel.getByText("正在加载维护进度…")).toBeVisible()
          } else {
            await summaryResponse
            if (state.id === "panel-error") await expect(panel).toHaveCount(0)
            else
              await expect(
                panel.getByRole("button", { name: "随机补充一张" })
              ).toBeEnabled()
          }
          if (state.id === "panel-low") {
            await expect(panel.getByRole("listitem")).toHaveCount(2)
            await expect(panel.getByText("0.1%", { exact: true })).toBeVisible()
            await expect(panel.getByText("0.5%", { exact: true })).toBeVisible()
          }
          if (state.id === "panel-tiny")
            await expect(panel.getByText("<0.1%", { exact: true })).toHaveCount(
              2
            )
          if (state.id === "panel-pending") {
            await expect(
              panel.getByText("待审 4", { exact: true })
            ).toBeVisible()
            await expect(
              panel.getByText("待审 7", { exact: true })
            ).toBeVisible()
          }
          if (state.id === "panel-complete")
            await expect(panel.getByText("100%", { exact: true })).toHaveCount(
              2
            )
          if (state.id === "panel-empty") {
            await expect(panel.getByText("0%", { exact: true })).toHaveCount(2)
            await expect(
              panel.getByText("暂无贡献记录，期待你的第一份贡献。")
            ).toBeVisible()
          }
          if (state.id === "panel-anonymous")
            await expect(
              panel.getByText("登录后可以查看自己的贡献值。")
            ).toBeVisible()
          if (state.id === "panel-unranked")
            await expect(
              panel.getByText("我的贡献：0 点 · 暂未上榜")
            ).toBeVisible()
          if (state.id === "panel-outside-top")
            await expect(
              panel.getByText("我的贡献：413 点 · 第 32 名")
            ).toBeVisible()
          if (state.id === "panel-long")
            await expect(panel.getByText(/^1,234,567\s*点$/)).toHaveCount(2)
          if (state.id === "panel-collapsed") {
            await panel.getByRole("button", { name: "收起" }).click()
            await expect(panel.getByRole("progressbar")).toHaveCount(0)
            expect(
              await page.evaluate(() =>
                localStorage.getItem("imsweb.wall-insights.collapsed")
              )
            ).toBe("1")
          }
          const isDialog = state.pageId === "leaderboard-dialog"
          if (isDialog) {
            await panel.getByRole("button", { name: "完整榜单" }).click()
            const dialog = page.getByRole("dialog", { name: "名片墙贡献榜" })
            if (state.id === "dialog-loading")
              await expect(dialog.getByText("正在加载贡献榜…")).toBeVisible()
            else if (
              state.id === "dialog-error" ||
              state.id === "dialog-retry"
            ) {
              await expect(dialog.getByRole("alert")).toBeVisible()
              if (state.id === "dialog-retry") {
                await dialog.getByRole("button", { name: "重试" }).click()
                await expect(dialog.getByRole("listitem")).toHaveCount(25)
              }
            } else if (state.id === "dialog-empty") {
              await expect(
                dialog.getByText("暂无贡献记录，期待你的第一份贡献。")
              ).toBeVisible()
              await expect(
                dialog.getByRole("button", { name: "下一页" })
              ).toBeDisabled()
            } else if (state.id === "dialog-short") {
              await expect(dialog.getByRole("listitem")).toHaveCount(2)
              await expect(
                dialog.getByRole("button", { name: "下一页" })
              ).toBeDisabled()
            } else {
              await expect(dialog.getByRole("listitem")).toHaveCount(25)
              if (state.id !== "dialog-first") {
                await dialog.getByRole("button", { name: "下一页" }).click()
                if (state.id === "dialog-page-error")
                  await expect(dialog.getByRole("alert")).toBeVisible()
                else if (state.id === "dialog-page-empty")
                  await expect(
                    dialog.getByText("这一页暂无贡献记录，请返回上一页。")
                  ).toBeVisible()
                else {
                  await expect(
                    dialog.getByText("共 63 位 · 2 / 3 页")
                  ).toBeVisible()
                  await expect(dialog.getByRole("list")).toHaveAttribute(
                    "start",
                    "26"
                  )
                  if (state.id === "dialog-last") {
                    await dialog.getByRole("button", { name: "下一页" }).click()
                    await expect(
                      dialog.getByText("共 63 位 · 3 / 3 页")
                    ).toBeVisible()
                    await expect(dialog.getByRole("listitem")).toHaveCount(13)
                    await expect(dialog.getByRole("list")).toHaveAttribute(
                      "start",
                      "51"
                    )
                    await expect(
                      dialog.getByRole("button", { name: "下一页" })
                    ).toBeDisabled()
                  }
                }
              }
            }
          }
          if (isDialog)
            await expect(
              page.getByRole("dialog", { name: "名片墙贡献榜" })
            ).toHaveCSS("opacity", "1")
          if (state.id === "dialog-page-empty")
            await expect(
              page
                .getByRole("dialog")
                .getByText("共 10 位 · 第 2 页", { exact: true })
            ).toBeVisible()
          await expectNamecardNoOverflow(page)
          const capture = async (name: string, title: string) => {
            const path = testInfo.outputPath(name + ".png")
            await page.screenshot({ path, animations: "disabled" })
            shots.push({ path, title, capture: "viewport" })
          }
          await capture("viewport", state.title)
          if (isDialog) {
            const dialog = page.getByRole("dialog", { name: "名片墙贡献榜" })
            if (
              ["dialog-first", "dialog-middle", "dialog-last"].some(
                (id) => id === state.id
              )
            ) {
              for (const fraction of [1 / 3, 2 / 3, 1]) {
                await dialog
                  .getByRole("region", { name: "贡献者列表" })
                  .evaluate((element, position) => {
                    element.scrollTop =
                      (element.scrollHeight - element.clientHeight) * position
                  }, fraction)
                await capture(
                  "scroll-" + Math.round(fraction * 100),
                  "列表向下浏览 " + Math.round(fraction * 100) + "%"
                )
              }
            }
            const accessibility = await new AxeBuilder({ page })
              .include('[role="dialog"]')
              .analyze()
            expect(accessibility.violations).toEqual([])
          } else if (state.id !== "panel-error") {
            const path = testInfo.outputPath("complete-panel.png")
            await panel.screenshot({ path, animations: "disabled" })
            shots.push({
              path,
              capture: "component",
              title: "维护面板完整内容",
            })
            const accessibility = await new AxeBuilder({ page })
              .include('[aria-labelledby="wall-insights-title"]')
              .analyze()
            expect(accessibility.violations).toEqual([])
          }
          await writeFile(
            testInfo.outputPath("state.json"),
            JSON.stringify(
              {
                stateId: state.id,
                title: state.title,
                pageId: state.pageId,
                theme,
                project: testInfo.project.name,
                viewport: page.viewportSize(),
                browser: page.context().browser()?.version(),
                screenshots: shots,
              },
              null,
              2
            )
          )
          if (state.id === "panel-collapsed") {
            await panel.getByRole("button", { name: "展开" }).click()
            await expect(panel.getByRole("progressbar")).toHaveCount(2)
          }
        } finally {
          control.release()
        }
        if (state.id === "panel-loading")
          await expect(page.getByText("正在加载维护进度…")).toHaveCount(0)
        if (state.id === "dialog-loading")
          await expect(
            page.getByRole("dialog").getByRole("listitem")
          ).toHaveCount(25)
        if (state.pageId === "leaderboard-dialog") {
          await page.keyboard.press("Escape")
          await expect(page.getByRole("dialog")).toHaveCount(0)
          await expect(
            page.getByRole("button", { name: "完整榜单" })
          ).toBeFocused()
        }
      }
    )
  }
}
