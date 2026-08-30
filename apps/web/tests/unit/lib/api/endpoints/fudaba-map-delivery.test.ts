import { afterEach, describe, expect, it, vi } from "vitest"

import {
  fudabaMapPrefixSchema,
  fudabaMapStyleUrlForPrefix,
  getAdminFudabaMapDelivery,
  updateAdminFudabaMapDelivery,
} from "~/lib/api"
import { CSRF_HEADER_NAME } from "~/lib/api/request"

function requestFrom(input: RequestInfo | URL, init?: RequestInit) {
  return input instanceof Request
    ? input
    : new Request(new URL(String(input), "http://ims.test"), init)
}

const snapshot = {
  selectedPrefix: "https://objects.example.test/exchange/v3/",
  availablePrefixes: ["/maps/", "https://objects.example.test/exchange/v3/"],
  effectivePrefix: "https://objects.example.test/exchange/v3/",
  revision: '"revision-1"',
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = "ims_admin_csrf=; Max-Age=0; path=/"
})

describe("Fudaba map delivery API", () => {
  it("validates path-carrying prefixes and derives the style asset URL", () => {
    expect(fudabaMapPrefixSchema.parse(" /maps/releases/v3/ ")).toBe(
      "/maps/releases/v3/"
    )
    expect(
      fudabaMapPrefixSchema.parse(
        "https://objects.example.test/exchange/releases/v3/"
      )
    ).toBe("https://objects.example.test/exchange/releases/v3/")
    expect(
      fudabaMapStyleUrlForPrefix(
        "https://objects.example.test/exchange/releases/v3/",
        "/maps/exchange-style.json"
      )
    ).toBe(
      "https://objects.example.test/exchange/releases/v3/exchange-style.json"
    )

    for (const prefix of [
      "maps/",
      "/maps",
      "//objects.example.test/maps/",
      "https://user:secret@objects.example.test/maps/",
      "https://objects.example.test/maps/?release=v3",
      "https://objects.example.test/maps/#v3",
    ]) {
      expect(() => fudabaMapPrefixSchema.parse(prefix)).toThrow()
    }
  })

  it("loads the operator snapshot with Backoffice auth policy", async () => {
    let request: Request | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        request = requestFrom(input, init).clone()
        return Response.json(snapshot)
      })
    )

    await expect(getAdminFudabaMapDelivery().send()).resolves.toEqual(snapshot)

    expect(request?.method).toBe("GET")
    expect(new URL(request!.url).pathname).toBe(
      "/api/admin/community/exchange/map-delivery"
    )
    expect(request?.credentials).toBe("same-origin")
    expect(request?.headers.get(CSRF_HEADER_NAME)).toBeNull()
  })

  it("updates the selected prefix with revision and Backoffice CSRF", async () => {
    document.cookie = "ims_admin_csrf=map-delivery-csrf; path=/"
    let request: Request | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        request = requestFrom(input, init).clone()
        return Response.json({ success: true, delivery: snapshot })
      })
    )

    await expect(
      updateAdminFudabaMapDelivery(
        "https://objects.example.test/exchange/v3/",
        '"revision-1"'
      ).send()
    ).resolves.toEqual({ success: true, delivery: snapshot })

    expect(request?.method).toBe("PUT")
    expect(new URL(request!.url).pathname).toBe(
      "/api/admin/community/exchange/map-delivery"
    )
    expect(request?.headers.get(CSRF_HEADER_NAME)).toBe("map-delivery-csrf")
    await expect(request?.json()).resolves.toEqual({
      prefix: "https://objects.example.test/exchange/v3/",
      revision: '"revision-1"',
    })
  })
})
