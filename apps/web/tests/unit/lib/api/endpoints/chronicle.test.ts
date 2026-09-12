import { afterEach, describe, expect, it, vi } from "vitest"

import {
  chronicleActivitySchema,
  chronicleActivitySummarySchema,
  uploadChronicleImages,
} from "~/lib/api/endpoints/chronicle"

describe("chronicle API contracts", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("accepts the public activity summary returned by Hono", () => {
    expect(
      chronicleActivitySummarySchema.parse({
        id: "activity-1",
        title: "线下交流活动",
        date: "2026-07-24",
        location: "广州",
        cover: null,
      })
    ).toMatchObject({ id: "activity-1", cover: null })
  })

  it("rejects unsafe or incomplete activity payloads", () => {
    expect(() =>
      chronicleActivitySchema.parse({
        id: "",
        title: "活动",
        date: "待定",
        location: "待补充",
        images: [],
      })
    ).toThrow()
  })

  it("validates the legacy Chronicle upload error envelope", async () => {
    const payload = { success: false as const, error: "图片格式不支持" }
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(payload, { status: 400 }))
    )

    await expect(
      uploadChronicleImages(
        "activity-1",
        "uploader",
        [new File(["image"], "image.png")],
        "chronicle-upload-key"
      ).send()
    ).rejects.toMatchObject({
      kind: "http",
      status: 400,
      payload,
    })
  })
})
