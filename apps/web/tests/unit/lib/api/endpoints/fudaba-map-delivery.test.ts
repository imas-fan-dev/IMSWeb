import { afterEach, describe, expect, it, vi } from "vitest"

import {
  activateAdminFudabaMapSource,
  createAdminFudabaMapSource,
  deleteAdminFudabaMapSource,
  fudabaMapDeliverySnapshotSchema,
  fudabaMapSourceNameSchema,
  fudabaMapStyleUrlSchema,
  getAdminFudabaMapDelivery,
  updateAdminFudabaMapSource,
} from "~/lib/api"
import { CSRF_HEADER_NAME } from "~/lib/api/request"

function requestFrom(input: RequestInfo | URL, init?: RequestInit) {
  return input instanceof Request
    ? input
    : new Request(new URL(String(input), "http://ims.test"), init)
}

const activeSource = {
  id: "source-r2",
  name: "R2 test",
  styleUrl: "https://objects.example.test/exchange/v3/exchange-style.json",
}
const snapshot = {
  sources: [
    {
      id: "source-official",
      name: "OpenFreeMap Positron",
      styleUrl: "https://tiles.openfreemap.org/styles/positron",
    },
    activeSource,
  ],
  activeSourceId: activeSource.id,
  effectiveStyleUrl: activeSource.styleUrl,
  revision: '"revision-1"',
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = "ims_admin_csrf=; Max-Age=0; path=/"
})

describe("Fudaba map delivery API", () => {
  it("validates source names, complete style URLs, and active snapshot integrity", () => {
    expect(fudabaMapSourceNameSchema.parse(" R2 test ")).toBe("R2 test")
    expect(fudabaMapStyleUrlSchema.parse(" /maps/exchange-style.json ")).toBe(
      "/maps/exchange-style.json"
    )
    expect(fudabaMapDeliverySnapshotSchema.parse(snapshot)).toEqual(snapshot)

    expect(() =>
      fudabaMapDeliverySnapshotSchema.parse({
        ...snapshot,
        activeSourceId: "source-missing",
      })
    ).toThrow()
    for (const styleUrl of [
      "maps/exchange-style.json",
      "//objects.example.test/maps/style.json",
      "https://user:secret@objects.example.test/maps/style.json",
      "https://objects.example.test/maps/style.json?release=v3",
      "https://objects.example.test/maps/style.json#v3",
    ]) {
      expect(() => fudabaMapStyleUrlSchema.parse(styleUrl)).toThrow()
    }
  })

  it("loads the dynamic source snapshot with Backoffice auth policy", async () => {
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

  it("creates, edits, activates, and deletes sources with revision and CSRF", async () => {
    document.cookie = "ims_admin_csrf=map-delivery-csrf; path=/"
    const requests: Request[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(requestFrom(input, init).clone())
        return Response.json({ success: true, delivery: snapshot })
      })
    )

    await createAdminFudabaMapSource(
      "R2 test",
      activeSource.styleUrl,
      '"revision-1"'
    ).send()
    await updateAdminFudabaMapSource(
      activeSource.id,
      "R2 test v2",
      activeSource.styleUrl,
      '"revision-2"'
    ).send()
    await activateAdminFudabaMapSource(activeSource.id, '"revision-3"').send()
    await deleteAdminFudabaMapSource(activeSource.id, '"revision-4"').send()

    expect(
      requests.map((request) => [request.method, new URL(request.url).pathname])
    ).toEqual([
      ["POST", "/api/admin/community/exchange/map-delivery/sources"],
      ["PUT", "/api/admin/community/exchange/map-delivery/sources/source-r2"],
      ["PUT", "/api/admin/community/exchange/map-delivery/active"],
      [
        "DELETE",
        "/api/admin/community/exchange/map-delivery/sources/source-r2",
      ],
    ])
    for (const request of requests) {
      expect(request.headers.get(CSRF_HEADER_NAME)).toBe("map-delivery-csrf")
    }
    await expect(requests[0]?.json()).resolves.toEqual({
      name: "R2 test",
      styleUrl: activeSource.styleUrl,
      revision: '"revision-1"',
    })
    await expect(requests[1]?.json()).resolves.toEqual({
      name: "R2 test v2",
      styleUrl: activeSource.styleUrl,
      revision: '"revision-2"',
    })
    await expect(requests[2]?.json()).resolves.toEqual({
      sourceId: activeSource.id,
      revision: '"revision-3"',
    })
    await expect(requests[3]?.json()).resolves.toEqual({
      revision: '"revision-4"',
    })
  })
})
