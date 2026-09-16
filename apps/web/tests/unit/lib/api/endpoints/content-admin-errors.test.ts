import { describe, expect, it } from "vitest"

import { installFetchMock } from "@/tests/unit/support/api-client"
import {
  getAboutPageContent,
  getAdminAboutPageContent,
} from "~/lib/api/endpoints/about"
import {
  getAdminProducerMapContent,
  getProducerMapContent,
} from "~/lib/api/endpoints/producer-map"

const protectedError = { message: "无权限（仅op可访问）" }

function errorResponse() {
  return Response.json(protectedError, { status: 403 })
}

describe("content endpoint error contracts", () => {
  it("keeps About and Producer Map protected errors off public routes", async () => {
    installFetchMock().mockImplementation(async () => errorResponse())

    await expect(getAdminAboutPageContent().send()).rejects.toMatchObject({
      kind: "http",
      status: 403,
      payload: protectedError,
    })
    await expect(getAboutPageContent().send()).rejects.toMatchObject({
      kind: "contract",
      code: "CONTRACT_VIOLATION",
      status: 403,
    })
    await expect(getAdminProducerMapContent().send()).rejects.toMatchObject({
      kind: "http",
      status: 403,
      payload: protectedError,
    })
    await expect(getProducerMapContent().send()).rejects.toMatchObject({
      kind: "contract",
      code: "CONTRACT_VIOLATION",
      status: 403,
    })
  })
})
