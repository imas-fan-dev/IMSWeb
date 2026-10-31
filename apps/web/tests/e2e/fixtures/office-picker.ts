import { test, expect } from "./test"
import { installEmptyWikiCatalogMock } from "./homepage"
import { settleToasts } from "./toast"

export function officePickerScenario() {
  for (const editing of [false, true])
    test(`${editing ? "edits" : "creates"} an office with automatic address fill and independent map gestures @mobile @app-iphone @app-android @app-landscape @app-webkit`, async ({
      page,
      api,
      baseURL,
      browserName,
      isMobile,
    }, info) => {
      await page.emulateMedia({ reducedMotion: "reduce" })
      await page.addInitScript(() => {
        localStorage.setItem("imsweb.language", "zh-CN")
        localStorage.setItem("ims.platform.access-token", "picker-token")
      })
      await page.context().addCookies([
        { name: "ims_platform_access", value: "picker-token", url: baseURL! },
        { name: "ims_platform_csrf", value: "picker-csrf", url: baseURL! },
      ])
      await installEmptyWikiCatalogMock(api, { min: 0, max: 8 })
      const session = {
        success: true,
        account: { id: "picker-owner", status: "active" },
        profile: {
          displayName: "选点制作人",
          avatarUrl: null,
          homeCity: null,
          bio: "",
        },
      }
      for (const [path, json] of [
        ["/api/platform/auth/session", session],
        [
          "/api/platform/me",
          {
            ...session,
            profile: { ...session.profile, updatedAt: 1 },
            capabilities: { fudabaWrite: true },
          },
        ],
        ...["series", "cards", "claim-envelopes"].map((name) => [
          `/api/community/exchange/me/${name}`,
          { items: [] },
        ]),
        [
          "/api/community/exchange/me/favorites",
          { items: [], pageInfo: { hasNextPage: false, nextCursor: null } },
        ],
      ] as const) {
        await api.mock(
          { method: "GET", path: path as string, times: { min: 1, max: 4 } },
          (route) => route.fulfill({ json })
        )
      }
      await api.mock(
        { method: "GET", path: "/api/community/exchange/map/config", times: 2 },
        (route) =>
          route.fulfill({
            json: {
              provider: "maplibre",
              search: { provider: "nominatim" },
              styleUrl: "/maps/exchange-test-style.json",
            },
          })
      )
      await api.mockRoute(
        "**/api/community/exchange/places/search?*",
        (route) =>
          route.fulfill({
            json: {
              success: true,
              items: [
                {
                  id: "way:300",
                  label: "目标地点",
                  address: "预览地址",
                  city: "上海",
                  location: {
                    latitude: 31.2,
                    longitude: 121.5,
                    precision: "exact",
                  },
                },
              ],
              attribution: "© OpenStreetMap contributors",
            },
          }),
        "GET",
        1
      )
      const reversePoints: { longitude: number; latitude: number }[] = []
      await api.mock(
        {
          method: "GET",
          path: "/api/community/exchange/places/reverse",
          times: 2,
        },
        (route) => {
          const query = new URL(route.request().url()).searchParams
          const point = {
            longitude: Number(query.get("longitude")),
            latitude: Number(query.get("latitude")),
          }
          expect(Number.isFinite(point.longitude)).toBe(true)
          expect(Number.isFinite(point.latitude)).toBe(true)
          expect(Math.abs(point.longitude)).toBeLessThanOrEqual(180)
          expect(Math.abs(point.latitude)).toBeLessThanOrEqual(90)
          reversePoints.push(point)
          const first = reversePoints.length === 1
          if (first)
            expect(point).not.toEqual({ longitude: 121.5, latitude: 31.2 })
          else expect(point).not.toEqual(reversePoints[0])
          return route.fulfill({
            json: {
              place: {
                id: `reverse-${reversePoints.length}`,
                label: "确认地点",
                city: first ? "上海" : "上海市",
                address: first ? "点选位置的自动地址" : "地图调整后的自动地址",
                location: { ...point, precision: "exact" },
              },
              attribution: {
                text: "© OpenStreetMap contributors",
                url: "https://www.openstreetmap.org/copyright",
              },
            },
          })
        }
      )
      const officeBase = {
        id: "picker-office",
        slug: "picker-office",
        name: "选点事务所",
        intro: "",
        city: "旧城市",
        address: "旧地点地址",
        location: { latitude: 31.2, longitude: 121.5, precision: "exact" },
        accent: "#2581c7",
        coverUrl: null,
        pendingCoverUrl: null,
        pendingCoverSubmittedAt: null,
        isOpen: true,
        visitorCount: 0,
        status: "active",
        reviewState: "pending",
        submittedAt: "2026-08-02T09:00:00.000Z",
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: "",
        reviewInProgress: false,
        revision: 1,
        seriesCodes: [],
        createdAt: "2026-08-02T08:00:00.000Z",
        updatedAt: "2026-08-02T09:00:00.000Z",
        archivedAt: null,
      }
      let currentOffice = officeBase
      await api.mock(
        {
          method: "GET",
          path: "/api/community/exchange/me/offices",
          times: { min: 1, max: 6 },
        },
        (route) =>
          route.fulfill({
            json: { items: editing || payloads.length ? [currentOffice] : [] },
          })
      )
      await api.mock(
        {
          method: "GET",
          path: "/api/community/exchange/me/offices/picker-office",
          times: editing ? 1 : 0,
        },
        (route) => route.fulfill({ json: { office: currentOffice } })
      )
      const payloads: Record<string, unknown>[] = []
      for (const method of (editing ? ["PUT"] : ["POST"]) as ("POST" | "PUT")[])
        await api.mock(
          {
            method,
            path:
              method === "POST"
                ? "/api/community/exchange/offices"
                : "/api/community/exchange/me/offices/picker-office",
            times: 1,
          },
          (route) => {
            const body = route.request().postDataJSON()
            payloads.push(body)
            expect(Number.isFinite(body.latitude)).toBe(true)
            expect(Math.abs(body.longitude)).toBeLessThanOrEqual(180)
            expect(body.address).toBe("地图调整后的自动地址")
            expect(body.city).toBe("上海市")
            expect(body.intro).toBe("选点前尚未保存的介绍")
            expect({
              longitude: body.longitude,
              latitude: body.latitude,
            }).toEqual(reversePoints[1])
            currentOffice = {
              ...officeBase,
              name: body.name,
              address: body.address,
              city: body.city,
              location: {
                latitude: body.latitude,
                longitude: body.longitude,
                precision: "exact",
              },
              revision: method === "POST" ? 1 : 2,
            }
            return route.fulfill({
              json: {
                success: true,
                office: {
                  ...officeBase,
                  name: body.name,
                  address: body.address,
                  city: body.city,
                  location: {
                    latitude: body.latitude,
                    longitude: body.longitude,
                    precision: "exact",
                  },
                  revision: method === "POST" ? 1 : 2,
                },
              },
            })
          }
        )
      await page.goto(
        editing
          ? "/account/me/offices?office=picker-office"
          : "/account/me/offices"
      )
      if (!editing)
        await page
          .getByRole("button", { name: "新建事务所", exact: true })
          .click()
      await page.getByRole("textbox", { name: "事务所名称" }).fill("选点事务所")
      await page
        .getByRole("textbox", { name: "事务所介绍" })
        .fill("选点前尚未保存的介绍")
      await expect(
        page.getByText("创建后再设置公开区域", { exact: true })
      ).toHaveCount(0)
      await page.getByRole("button", { name: "搜索地点与地图选点" }).click()
      await page.getByRole("textbox", { name: "搜索地点" }).fill("目标地点")
      await page.getByRole("button", { name: "搜索", exact: true }).click()
      await page.getByRole("button", { name: /目标地点.*预览地址/ }).click()
      expect(reversePoints).toHaveLength(0)
      await expect(page.getByRole("textbox", { name: "详细地址" })).toHaveValue(
        editing ? "旧地点地址" : ""
      )
      const canvas = page.locator("canvas.maplibregl-canvas")
      const pin = page.locator("[data-map-point-picker]")
      await expect(pin).toHaveCount(1)
      await canvas.scrollIntoViewIfNeeded()
      const mapBox = (await canvas.boundingBox())!
      const clicked = {
        x: mapBox.x + mapBox.width * 0.7,
        y: mapBox.y + mapBox.height * 0.42,
      }
      if (isMobile) await page.touchscreen.tap(clicked.x, clicked.y)
      else await page.mouse.click(clicked.x, clicked.y)
      await expect
        .poll(async () => {
          const box = await pin.boundingBox()
          return box
            ? Math.max(
                Math.abs(box.x + box.width / 2 - clicked.x),
                Math.abs(box.y + box.height - clicked.y)
              )
            : Infinity
        })
        .toBeLessThan(3)
      await expect.poll(() => reversePoints.length).toBe(1)
      await expect(
        page.getByRole("region", { name: "浮标地址预览" })
      ).toContainText("点选位置的自动地址")
      await expect(page.getByRole("textbox", { name: "详细地址" })).toHaveValue(
        editing ? "旧地点地址" : ""
      )
      await page
        .getByRole("region", { name: "浮标地址预览" })
        .scrollIntoViewIfNeeded()
      await info.attach("point-address-preview", {
        body: await page.getByRole("dialog").screenshot(),
        contentType: "image/png",
      })
      await page.getByRole("button", { name: "确认位置并填写地址" }).click()
      await expect(
        page.getByRole("textbox", { name: "城市", exact: true })
      ).toHaveValue("上海")
      await expect(page.getByRole("textbox", { name: "详细地址" })).toHaveValue(
        "点选位置的自动地址"
      )
      await expect(
        page.getByRole("link", {
          name: "© OpenStreetMap contributors",
          exact: true,
        })
      ).toHaveAttribute("href", "https://www.openstreetmap.org/copyright")
      for (const pass of [editing ? 1 : 0]) {
        await page.getByRole("button", { name: "搜索地点与地图选点" }).click()
        await expect(page.locator("[data-map-state=ready]")).toBeVisible()
        await expect(pin).toHaveCount(1)
        await canvas.scrollIntoViewIfNeeded()
        if (pass === 0) {
          const box = (await pin.boundingBox())!
          const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
          expect(
            await pin.evaluate(
              (node, point) =>
                node.contains(document.elementFromPoint(point.x, point.y)),
              start
            )
          ).toBe(true)
          if (isMobile && browserName === "chromium") {
            const cdp = await page.context().newCDPSession(page)
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchStart",
              touchPoints: [start],
            })
            for (let step = 1; step <= 5; step++)
              await cdp.send("Input.dispatchTouchEvent", {
                type: "touchMove",
                touchPoints: [
                  { x: start.x + step * 10, y: start.y + step * 3 },
                ],
              })
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchEnd",
              touchPoints: [],
            })
            await cdp.detach()
          } else {
            await page.mouse.move(start.x, start.y)
            await page.mouse.down()
            await page.mouse.move(start.x + 50, start.y + 15, { steps: 5 })
            await page.mouse.up()
          }
          await expect
            .poll(async () => {
              const moved = await pin.boundingBox()
              return moved
                ? Math.max(
                    Math.abs(moved.x - box.x - 50),
                    Math.abs(moved.y - box.y - 15)
                  )
                : Infinity
            })
            .toBeLessThan(3)
        } else {
          await canvas.press("ArrowRight")
          await page.getByRole("button", { name: "使用地图中心" }).click()
        }
        await expect(
          page.getByRole("button", { name: "确认位置并填写地址" })
        ).toBeEnabled()
        await page.getByRole("dialog").screenshot({
          path: info.outputPath(
            `office-${pass === 0 ? "create-drag" : "edit-keyboard"}.png`
          ),
        })
        await page.getByRole("button", { name: "确认位置并填写地址" }).click()
        await expect(
          page.getByRole("textbox", { name: "城市", exact: true })
        ).toHaveValue("上海市")
        await expect(
          page.getByRole("textbox", { name: "详细地址" })
        ).toHaveValue("地图调整后的自动地址")
        await expect(
          page.getByRole("textbox", { name: "事务所名称" })
        ).toHaveValue("选点事务所")
        await expect(
          page.getByRole("textbox", { name: "事务所介绍" })
        ).toHaveValue("选点前尚未保存的介绍")
        await page
          .getByRole("button", {
            name: pass === 0 ? "创建事务所" : "保存事务所",
            exact: true,
          })
          .click()
        if (pass === 0) {
          await expect(page.getByRole("dialog")).toHaveCount(0)
          await expect(
            page.getByText("选点事务所", { exact: true })
          ).toBeVisible()
        } else {
          await expect(
            page
              .getByRole("dialog")
              .getByText("事务所资料已保存并提交整体审核，审核通过前不公开。", {
                exact: true,
              })
          ).toBeVisible()
        }
        await settleToasts(page)
      }
      expect(reversePoints).toHaveLength(2)
      expect(payloads).toHaveLength(1)
      if (editing) expect(payloads[0]?.expectedRevision).toBe(1)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true)
    })
}
