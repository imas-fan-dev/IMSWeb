import { afterEach, describe, expect, it } from "vitest"
import {
  makeAdminOfficeReview,
  makeFudabaOwnerOffice,
} from "@/mocks/data/fudaba"
import { installFetchMock, requestFrom } from "@/tests/unit/support/api-client"
import {
  clearCsrfCookie,
  setCsrfCookie,
} from "@/tests/unit/support/auth-cookies"
import {
  adminOfficeReviewSchema,
  getAdminOfficeReviews,
  getAdminOffice,
  updateAdminOffice,
  reviewAdminOffice,
  reverseAdminOfficePlace,
} from "~/lib/api/endpoints/fudaba/office-review"
import { CSRF_HEADER_NAME } from "~/lib/api/request"

const item = makeAdminOfficeReview({
  office: makeFudabaOwnerOffice({
    id: "office-1",
    revision: 3,
    city: "成都市",
    address: "天府二街123号",
    location: {
      longitude: 104.04275126443116,
      latitude: 30.552371337165454,
      precision: "exact",
    },
  }),
})
afterEach(() => clearCsrfCookie("backoffice"))

describe("whole-office review API", () => {
  it("preserves complete exact snapshots and nullable identities while rejecting old grid positions and extra fields", () => {
    expect(adminOfficeReviewSchema.parse(item)).toEqual(item)
    expect(
      adminOfficeReviewSchema.parse({
        ...item,
        owner: { ...item.owner, email: null },
      }).owner.email
    ).toBeNull()
    expect(() =>
      adminOfficeReviewSchema.parse({
        ...item,
        office: {
          ...item.office,
          location: { ...item.office.location, precision: "regional" },
        },
      })
    ).toThrow()
    expect(() =>
      adminOfficeReviewSchema.parse({
        ...item,
        office: { ...item.office, privateOwnerId: "unknown" },
      })
    ).toThrow()
  })

  it("loads a state-filtered Backoffice queue without csrf on a read", async () => {
    let submitted: Request | undefined
    installFetchMock(async (input, init) => {
      submitted = requestFrom(input, init).clone()
      return Response.json({ items: [item] })
    })
    expect(await getAdminOfficeReviews("rejected", 25).send()).toEqual({
      items: [item],
    })
    const url = new URL(submitted!.url)
    expect(url.pathname).toBe("/api/admin/community/exchange/offices")
    expect(url.searchParams.get("state")).toBe("rejected")
    expect(url.searchParams.get("limit")).toBe("25")
    expect(submitted?.credentials).toBe("same-origin")
    expect(submitted?.headers.get(CSRF_HEADER_NAME)).toBeNull()
  })

  it("accepts Backoffice HTTP-error envelopes", async () => {
    const payload = { success: false, message: "未登录" }
    installFetchMock().mockResolvedValue(
      Response.json(payload, { status: 403 })
    )
    await expect(getAdminOfficeReviews("pending").send()).rejects.toMatchObject(
      { kind: "http", status: 403, payload }
    )
  })

  it("encodes a detail ID and does not reinterpret the failed lookup", async () => {
    let submitted: Request | undefined
    installFetchMock(async (input, init) => {
      submitted = requestFrom(input, init).clone()
      return Response.json(
        { success: false, code: "FUDABA_OFFICE_NOT_FOUND" },
        { status: 404 }
      )
    })
    await expect(getAdminOffice("office /?#").send()).rejects.toMatchObject({
      status: 404,
    })
    expect(new URL(submitted!.url).pathname).toBe(
      "/api/admin/community/exchange/offices/office%20%2F%3F%23"
    )
  })

  it("saves the complete form with its office revision and Backoffice csrf", async () => {
    setCsrfCookie("backoffice", "office-review-csrf")
    let submitted: Request | undefined
    installFetchMock(async (input, init) => {
      submitted = requestFrom(input, init).clone()
      return Response.json({ success: true, item })
    })
    const fields = {
      name: "修改名称",
      intro: "修改介绍",
      city: item.office.city,
      address: item.office.address,
      latitude: item.office.location.latitude,
      longitude: item.office.location.longitude,
      accent: item.office.accent,
      isOpen: item.office.isOpen,
      seriesCodes: item.office.seriesCodes,
      expectedRevision: 3,
    }
    expect(await updateAdminOffice(item.office.id, fields).send()).toEqual({
      success: true,
      item,
    })
    expect(submitted?.method).toBe("PUT")
    expect(new URL(submitted!.url).pathname).toBe(
      "/api/admin/community/exchange/offices/office-1"
    )
    expect(submitted?.headers.get(CSRF_HEADER_NAME)).toBe("office-review-csrf")
    await expect(submitted!.json()).resolves.toEqual(fields)
  })

  it("submits decisions separately from edits and validates rejection reasons before sending", async () => {
    setCsrfCookie("backoffice", "office-review-csrf")
    let submitted: Request | undefined
    const fetchMock = installFetchMock(async (input, init) => {
      submitted = requestFrom(input, init).clone()
      return Response.json({ success: true, item })
    })
    expect(() =>
      reviewAdminOffice(item.office.id, {
        decision: "reject",
        expectedRevision: 3,
        note: "",
      })
    ).toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
    await reviewAdminOffice(item.office.id, {
      decision: "reject",
      expectedRevision: 3,
      note: "请补充说明",
    }).send()
    expect(new URL(submitted!.url).pathname).toBe(
      "/api/admin/community/exchange/offices/office-1/review"
    )
    expect(submitted?.headers.get(CSRF_HEADER_NAME)).toBe("office-review-csrf")
    await expect(submitted!.json()).resolves.toEqual({
      decision: "reject",
      expectedRevision: 3,
      note: "请补充说明",
    })
  })

  it("uses the privileged reverse endpoint for the shared editor without changing coordinates", async () => {
    let submitted: Request | undefined
    const point = item.office.location
    installFetchMock(async (input, init) => {
      submitted = requestFrom(input, init).clone()
      return Response.json({
        place: {
          id: "resolved",
          label: "地点",
          city: item.office.city,
          address: item.office.address,
          location: point,
        },
        attribution: null,
      })
    })
    const result = await reverseAdminOfficePlace({
      longitude: point.longitude,
      latitude: point.latitude,
    }).send()
    const url = new URL(submitted!.url)
    expect(url.pathname).toBe("/api/admin/community/exchange/places/reverse")
    expect(Number(url.searchParams.get("latitude"))).toBe(point.latitude)
    expect(Number(url.searchParams.get("longitude"))).toBe(point.longitude)
    expect(result.place?.location).toEqual(point)
  })
})
