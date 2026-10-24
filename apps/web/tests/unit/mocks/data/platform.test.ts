import {
  platformProfileResponseSchema,
  platformProfileSchema,
  platformSessionProfileSchema,
  platformSessionSchema,
} from "@imsweb/contracts/platform"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"
import {
  makePlatformProfile,
  makePlatformProfileResponse,
  makePlatformSession,
  makePlatformSessionProfile,
} from "@/mocks/data/platform"

describe("platform fixture factories", () => {
  it("builds a profile that matches its contract", () => {
    const value = makePlatformProfile()

    assertFactoryCoversSchema(platformProfileSchema, value)
    expect(platformProfileSchema.parse(value)).toEqual(value)
  })

  it("builds a session that matches its contract", () => {
    const value = makePlatformSession()

    assertFactoryCoversSchema(platformSessionSchema, value)
    expect(platformSessionSchema.parse(value)).toEqual(value)
  })

  it("builds a profile response that matches its contract", () => {
    const value = makePlatformProfileResponse()

    assertFactoryCoversSchema(platformProfileResponseSchema, value)
    expect(platformProfileResponseSchema.parse(value)).toEqual(value)
  })

  it("builds a session profile that matches its contract", () => {
    const value = makePlatformSessionProfile()

    assertFactoryCoversSchema(platformSessionProfileSchema, value)
    expect(platformSessionProfileSchema.parse(value)).toEqual(value)
  })

  it("layers overrides over the defaults without dropping nested keys", () => {
    const value = makePlatformProfileResponse({
      profile: makePlatformProfile({ displayName: "新名字", updatedAt: 7 }),
      capabilities: { fudabaWrite: false },
    })

    expect(value.profile.displayName).toBe("新名字")
    expect(value.capabilities.fudabaWrite).toBe(false)
    assertFactoryCoversSchema(platformProfileResponseSchema, value)
    expect(platformProfileResponseSchema.parse(value)).toEqual(value)
  })
})
