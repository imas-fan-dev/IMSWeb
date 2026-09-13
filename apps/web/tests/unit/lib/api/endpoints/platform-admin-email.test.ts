import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getAdminPlatformEmailSettings,
  testAdminPlatformEmailSettings,
  updateAdminPlatformEmailSettings,
} from "~/lib/api/endpoints/platform/admin-email"
import { CSRF_HEADER_NAME } from "~/lib/api/request"

const settings = {
  enabled: false,
  configured: true,
  host: "smtp.qiye.163.com",
  port: 465,
  security: "tls" as const,
  usernameMasked: "ma***@texasoct.tech",
  passwordConfigured: true,
  fromAddress: "mail@texasoct.tech",
  fromName: "IMSWeb",
  resendCooldownSeconds: 60,
  updatedAt: 1000,
}

const writeInput = {
  enabled: true,
  host: " SMTP.QIYE.163.COM ",
  port: 465,
  security: "tls" as const,
  username: "mail@texasoct.tech",
  password: "smtp-password",
  fromAddress: " MAIL@TEXASOCT.TECH ",
  fromName: " IMSWeb ",
  resendCooldownSeconds: 30,
  expectedUpdatedAt: 1000,
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = "ims_admin_csrf=; Max-Age=0; path=/"
})

describe("Platform email admin endpoint contracts", () => {
  it("uses the SMTP settings and test endpoints with CSRF-protected requests", async () => {
    document.cookie = "ims_admin_csrf=admin-csrf; path=/"
    const requests: Array<{
      path: string
      method: string
      csrf: string | null
      body: unknown
    }> = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input), "http://ims.test").pathname
        requests.push({
          path,
          method: init?.method ?? "GET",
          csrf: new Headers(init?.headers).get(CSRF_HEADER_NAME),
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        })
        if ((init?.method ?? "GET") === "GET") {
          return Response.json({ success: true, settings })
        }
        if (path.endsWith("/test")) {
          return Response.json({
            success: true,
            deliveredTo: "admin@example.com",
          })
        }
        return Response.json({
          success: true,
          settings: {
            ...settings,
            enabled: true,
            resendCooldownSeconds: writeInput.resendCooldownSeconds,
          },
        })
      })
    )

    await expect(getAdminPlatformEmailSettings().send()).resolves.toEqual({
      success: true,
      settings,
    })
    await expect(
      updateAdminPlatformEmailSettings(writeInput).send()
    ).resolves.toMatchObject({ success: true })
    await expect(
      testAdminPlatformEmailSettings({
        ...writeInput,
        recipient: " ADMIN@EXAMPLE.COM ",
      }).send()
    ).resolves.toEqual({
      success: true,
      deliveredTo: "admin@example.com",
    })

    expect(requests).toEqual([
      {
        path: "/api/admin/platform/email",
        method: "GET",
        csrf: null,
        body: undefined,
      },
      {
        path: "/api/admin/platform/email",
        method: "PUT",
        csrf: "admin-csrf",
        body: {
          ...writeInput,
          host: "smtp.qiye.163.com",
          fromAddress: "mail@texasoct.tech",
          fromName: "IMSWeb",
        },
      },
      {
        path: "/api/admin/platform/email/test",
        method: "POST",
        csrf: "admin-csrf",
        body: {
          ...writeInput,
          host: "smtp.qiye.163.com",
          fromAddress: "mail@texasoct.tech",
          fromName: "IMSWeb",
          recipient: "admin@example.com",
        },
      },
    ])
  })

  it("rejects SMTP settings responses with unknown fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ success: true, settings, legacyMode: "cloudflare" })
      )
    )

    await expect(getAdminPlatformEmailSettings().send()).rejects.toMatchObject({
      code: "CONTRACT_VIOLATION",
    })
  })
})
