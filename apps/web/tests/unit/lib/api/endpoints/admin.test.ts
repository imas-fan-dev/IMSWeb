import { afterEach, describe, expect, it } from "vitest"

import { installFetchMock, jsonResponse } from "@/tests/unit/support/api-client"
import {
  clearCsrfCookie,
  setCsrfCookie,
} from "@/tests/unit/support/auth-cookies"
import {
  createRecommendation,
  getAdminAccounts,
  getAdminInformation,
  getAdminNamecards,
  getRecommendations,
  loginAdmin,
  uploadIdolMedia,
} from "~/lib/api/endpoints/admin"

afterEach(() => {
  clearCsrfCookie("backoffice")
})

describe("shared admin endpoint contracts", () => {
  it("accepts the exact canonical editor login payload including its token", async () => {
    const payload = {
      success: true as const,
      token: "editor-token",
      username: "wiki-editor",
      producername: null,
      dept: "editor",
      adminRole: null,
    }
    installFetchMock().mockResolvedValue(jsonResponse(payload))

    await expect(loginAdmin("wiki-editor", "password").send()).resolves.toEqual(
      payload
    )
  })

  it("validates protected error envelopes and rejects extra fields", async () => {
    installFetchMock()
      .mockResolvedValueOnce(jsonResponse({ error: "已退役" }, 410))
      .mockResolvedValueOnce(jsonResponse({ message: "无权限" }, 403))
      .mockResolvedValueOnce(
        jsonResponse({ error: "已退役", unexpected: true }, 410)
      )

    await expect(getAdminInformation().send()).rejects.toMatchObject({
      kind: "http",
      status: 410,
      payload: { error: "已退役" },
    })
    await expect(getAdminAccounts().send()).rejects.toMatchObject({
      kind: "http",
      status: 403,
      payload: { message: "无权限" },
    })
    await expect(getAdminInformation().send()).rejects.toMatchObject({
      kind: "contract",
      code: "CONTRACT_VIOLATION",
      status: 410,
    })
  })

  it("validates the Admin 2xx business-error envelopes", async () => {
    setCsrfCookie("backoffice", "admin-contract-csrf")
    installFetchMock()
      .mockResolvedValueOnce(
        jsonResponse({ success: false, msg: "新闻数据加载失败" })
      )
      .mockResolvedValueOnce(jsonResponse({ success: false }))
      .mockResolvedValueOnce(
        jsonResponse({ success: false, msg: "用户信息获取失败" })
      )
      .mockResolvedValueOnce(
        jsonResponse({ status: "error", msg: "企划不存在" })
      )

    await expect(getRecommendations().send()).rejects.toMatchObject({
      kind: "business",
      payload: { success: false, msg: "新闻数据加载失败" },
    })
    await expect(getAdminNamecards().send()).rejects.toMatchObject({
      kind: "business",
      payload: { success: false },
    })
    await expect(
      createRecommendation(new FormData()).send()
    ).rejects.toMatchObject({
      kind: "business",
      payload: { success: false, msg: "用户信息获取失败" },
    })
    await expect(
      uploadIdolMedia(
        "未来企划",
        "未来偶像",
        new File(["idol"], "idol.png")
      ).send()
    ).rejects.toMatchObject({
      kind: "business",
      payload: { status: "error", msg: "企划不存在" },
    })
  })
})
