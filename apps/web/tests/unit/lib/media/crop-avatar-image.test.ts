import { describe, expect, it, vi } from "vitest"

import {
  cropAvatarImage,
  CropAvatarImageError,
} from "~/lib/media/crop-avatar-image"

type DecodedImage = {
  close: ReturnType<typeof vi.fn>
  height: number
  width: number
}

function imageFile(name = "portrait.jpeg") {
  return new File(["source"], name, { type: "image/jpeg", lastModified: 42 })
}

function mockCanvas(
  blob: Blob | null = new Blob(["webp"], { type: "image/webp" })
) {
  const canvas = document.createElement("canvas")
  const createElement = vi
    .spyOn(document, "createElement")
    .mockReturnValue(canvas)
  const drawImage = vi.fn()
  const context = { drawImage } as unknown as CanvasRenderingContext2D
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context)
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation((callback) => callback(blob))

  return { canvas, createElement, drawImage, getContext, toBlob }
}

function mockBitmap(width: number, height: number) {
  const bitmap: DecodedImage = {
    close: vi.fn(),
    height,
    width,
  }
  const createImageBitmap = vi.fn().mockResolvedValue(bitmap)
  vi.stubGlobal("createImageBitmap", createImageBitmap)
  return { bitmap, createImageBitmap }
}

async function expectCropError(
  promise: Promise<unknown>,
  code: CropAvatarImageError["code"]
) {
  await expect(promise).rejects.toMatchObject({
    code,
    name: "CropAvatarImageError",
  })
}

describe("cropAvatarImage", () => {
  it("uses the selected square pixels without enlarging a small crop", async () => {
    const { bitmap } = mockBitmap(800, 600)
    const { canvas, drawImage, toBlob } = mockCanvas()

    const result = await cropAvatarImage(imageFile(), {
      height: 400,
      width: 400,
      x: 120,
      y: 40,
    })

    expect(result).toMatchObject({
      lastModified: 42,
      name: "portrait.webp",
      type: "image/webp",
    })
    expect(canvas).toMatchObject({ height: 400, width: 400 })
    expect(drawImage).toHaveBeenCalledWith(
      bitmap,
      120,
      40,
      400,
      400,
      0,
      0,
      400,
      400
    )
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.9)
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it("limits a large square crop to 1024 pixels", async () => {
    const { bitmap } = mockBitmap(4096, 3072)
    const { canvas, drawImage } = mockCanvas()

    await cropAvatarImage(imageFile("original.png"), {
      height: 2048,
      width: 2048,
      x: 512,
      y: 256,
    })

    expect(canvas).toMatchObject({ height: 1024, width: 1024 })
    expect(drawImage).toHaveBeenCalledWith(
      bitmap,
      512,
      256,
      2048,
      2048,
      0,
      0,
      1024,
      1024
    )
  })

  it("clamps the crop to image bounds", async () => {
    const { bitmap } = mockBitmap(800, 600)
    const { drawImage } = mockCanvas()

    await cropAvatarImage(imageFile(), {
      height: 300,
      width: 300,
      x: 700.8,
      y: 500.2,
    })

    expect(drawImage).toHaveBeenCalledWith(
      bitmap,
      700,
      500,
      100,
      100,
      0,
      0,
      100,
      100
    )
  })

  it("falls back to image-element decoding and releases its source URL", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("unsupported format"))
    )
    const { drawImage } = mockCanvas()
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:source")
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined)
    const image = {
      decode: vi.fn().mockResolvedValue(undefined),
      height: 640,
      width: 640,
    }
    vi.stubGlobal(
      "Image",
      vi.fn(function MockImage() {
        return image
      })
    )

    await cropAvatarImage(imageFile(), {
      height: 640,
      width: 640,
      x: 0,
      y: 0,
    })

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(image.decode).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:source")
    expect(drawImage).toHaveBeenCalledWith(
      image,
      0,
      0,
      640,
      640,
      0,
      0,
      640,
      640
    )
  })

  it("reports invalid crop values before decoding", async () => {
    const { createImageBitmap } = mockBitmap(800, 800)

    await expectCropError(
      cropAvatarImage(imageFile(), { height: 0, width: 800, x: 0, y: 0 }),
      "invalid-crop"
    )

    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it("reports image decode failure after both strategies reject", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("bad bitmap"))
    )
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:invalid")
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined)
    vi.stubGlobal(
      "Image",
      vi.fn(function MockImage() {
        return {
          decode: vi.fn().mockRejectedValue(new Error("bad image")),
        }
      })
    )

    await expectCropError(
      cropAvatarImage(imageFile(), { height: 800, width: 800, x: 0, y: 0 }),
      "decode"
    )
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:invalid")
  })

  it("reports a missing canvas context and closes the decoded bitmap", async () => {
    const { bitmap } = mockBitmap(800, 800)
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)

    await expectCropError(
      cropAvatarImage(imageFile(), { height: 800, width: 800, x: 0, y: 0 }),
      "canvas"
    )

    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it("reports drawImage failure and closes the decoded bitmap", async () => {
    const { bitmap } = mockBitmap(800, 800)
    mockCanvas().drawImage.mockImplementation(() => {
      throw new Error("draw failed")
    })

    await expectCropError(
      cropAvatarImage(imageFile(), { height: 800, width: 800, x: 0, y: 0 }),
      "canvas"
    )

    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it("reports a missing export Blob and closes the decoded bitmap", async () => {
    const { bitmap } = mockBitmap(800, 800)
    mockCanvas(null)

    await expectCropError(
      cropAvatarImage(imageFile(), { height: 800, width: 800, x: 0, y: 0 }),
      "export"
    )

    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it("keeps a browser PNG fallback uploadable", async () => {
    mockBitmap(800, 800)
    mockCanvas(new Blob(["png"], { type: "image/png" }))

    await expect(
      cropAvatarImage(imageFile(), {
        height: 800,
        width: 800,
        x: 0,
        y: 0,
      })
    ).resolves.toMatchObject({
      name: "portrait.png",
      type: "image/png",
    })
  })

  it("rejects an unsupported Canvas Blob type", async () => {
    mockBitmap(800, 800)
    mockCanvas(new Blob(["jpeg"], { type: "image/jpeg" }))

    await expectCropError(
      cropAvatarImage(imageFile(), { height: 800, width: 800, x: 0, y: 0 }),
      "export"
    )
  })
})
