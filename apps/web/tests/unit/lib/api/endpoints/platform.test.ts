import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getPlatformProfile,
  platformProfileResponseSchema,
  platformProfileUpdateSchema,
  updatePlatformProfile,
  uploadPlatformAvatar,
} from "~/lib/api/endpoints/platform"
import { CSRF_HEADER_NAME } from "~/lib/api/request"

const profile = {
  displayName: "Platform Producer",
  avatarUrl: "/api/platform/me/avatar?v=1000",
  homeCity: "上海",
  bio: "Profile bio",
  updatedAt: 1000,
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = "ims_platform_csrf=; Max-Age=0; path=/"
})

describe("Platform profile API contracts", () => {
  it("parses the exact owner profile projection and normalizes submissions", () => {
    expect(
      platformProfileResponseSchema.parse({
        success: true,
        account: { id: "platform-owner", status: "active" },
        profile,
        capabilities: { fudabaWrite: true },
      }).profile.updatedAt
    ).toBe(1000)

    expect(() =>
      platformProfileResponseSchema.parse({
        success: true,
        account: { id: "platform-owner", status: "active" },
        profile: { ...profile, avatarObjectKey: "protected/avatar.webp" },
        capabilities: { fudabaWrite: true },
      })
    ).toThrow()

    expect(
      platformProfileUpdateSchema.parse({
        displayName: "  Updated Owner  ",
        homeCity: "   ",
        bio: "  Updated bio  ",
        expectedUpdatedAt: 1000,
      })
    ).toEqual({
      displayName: "Updated Owner",
      homeCity: null,
      bio: "Updated bio",
      expectedUpdatedAt: 1000,
    })
  })

  it("uses Platform auth for reads and Platform CSRF for JSON writes", async () => {
    document.cookie = "ims_platform_csrf=profile-csrf; path=/"
    const requests: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), "http://ims.test")
        requests.push({ url: url.pathname, init })
        if (init?.method === "GET") {
          return Response.json({
            success: true,
            account: { id: "platform-owner", status: "active" },
            profile,
            capabilities: { fudabaWrite: false },
          })
        }
        return Response.json({
          success: true,
          profile: {
            ...profile,
            displayName: "Updated Owner",
            updatedAt: 1001,
          },
        })
      })
    )

    await expect(getPlatformProfile().send()).resolves.toMatchObject({
      profile: { displayName: "Platform Producer" },
    })
    await expect(
      updatePlatformProfile({
        displayName: " Updated Owner ",
        homeCity: null,
        bio: "Updated bio",
        expectedUpdatedAt: 1000,
      }).send()
    ).resolves.toMatchObject({
      profile: { displayName: "Updated Owner", updatedAt: 1001 },
    })

    expect(requests.map(({ url, init }) => [url, init?.method])).toEqual([
      ["/api/platform/me", "GET"],
      ["/api/platform/me", "PUT"],
    ])
    expect(
      new Headers(requests[0]?.init?.headers).get(CSRF_HEADER_NAME)
    ).toBeNull()
    expect(new Headers(requests[1]?.init?.headers).get(CSRF_HEADER_NAME)).toBe(
      "profile-csrf"
    )
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      displayName: "Updated Owner",
      homeCity: null,
      bio: "Updated bio",
      expectedUpdatedAt: 1000,
    })
  })

  it("uploads avatars as multipart PUT requests with revision fencing", async () => {
    document.cookie = "ims_platform_csrf=avatar-csrf; path=/"
    let request: RequestInit | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(new URL(String(input), "http://ims.test").pathname).toBe(
          "/api/community/exchange/uploads/avatar"
        )
        request = init
        return Response.json({
          success: true,
          profile: { ...profile, updatedAt: 1001 },
        })
      })
    )
    const image = new File(["avatar"], "avatar.png", { type: "image/png" })

    await expect(
      uploadPlatformAvatar({ image, expectedUpdatedAt: 1000 }).send()
    ).resolves.toMatchObject({ profile: { updatedAt: 1001 } })

    expect(request?.method).toBe("PUT")
    expect(new Headers(request?.headers).get(CSRF_HEADER_NAME)).toBe(
      "avatar-csrf"
    )
    expect(request?.body).toBeInstanceOf(FormData)
    const form = request?.body as FormData
    expect(form.get("image")).toBe(image)
    expect(form.get("expectedUpdatedAt")).toBe("1000")
  })
})
