import type { Page } from "@playwright/test"
import { expect } from "./test"

/** Binary transport adapter: JSON endpoints remain in ApiDispatcher. */
export async function installOwnerCardMediaRoutes(
  page: Page,
  options: {
    runtimeOrigin: string
    token: string
    webMode: boolean
    cors: Record<string, string>
  }
) {
  const { runtimeOrigin, token, webMode, cors } = options
  for (const side of ["front", "back"]) {
    const mediaPath = `/api/community/exchange/me/cards/owner-card/media/${side}`
    // 画廊与预览都直接取带 `v` 的原图地址；拦截这条形态，避免请求打到
    // fixture 服务端（它没有这些对象），导致断言失败。
    await page.route(`**${mediaPath}?v=*`, async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: cors })
        return
      }
      const headers = route.request().headers()
      if (webMode) {
        expect(headers.authorization).toBeUndefined()
        expect(headers.cookie).toContain(`ims_platform_access=${token}`)
      } else {
        expect([`Bearer ${token}`, "Bearer expired-platform-token"]).toContain(
          headers.authorization
        )
        expect(headers.cookie).toBeUndefined()
      }
      const query = new URL(route.request().url()).search || "?v=1"
      const response = await fetch(`${runtimeOrigin}${mediaPath}${query}`, {
        headers: webMode
          ? { cookie: headers.cookie }
          : { authorization: headers.authorization },
        redirect: webMode ? "follow" : "manual",
      })
      expect(response.status).toBe(
        headers.authorization === "Bearer expired-platform-token" ? 401 : 200
      )
      if (response.status === 200) {
        expect(response.headers.get("cache-control")).toBe("private, no-store")
        if (!webMode) {
          expect(response.headers.get("location")).toBeNull()
          expect(response.redirected).toBe(false)
          expect(new URL(response.url).origin).toBe(runtimeOrigin)
        }
      }
      await route.fulfill({
        status: response.status,
        body: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get("content-type") ?? "image/svg+xml",
        headers: cors,
      })
    })
  }
}
