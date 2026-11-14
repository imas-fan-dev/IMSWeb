export type PixelCrop = {
  x: number
  y: number
  width: number
  height: number
}

export class CropAvatarImageError extends Error {
  constructor(
    public readonly code: "decode" | "canvas" | "export" | "invalid-crop"
  ) {
    super(code)
    this.name = "CropAvatarImageError"
  }
}

type DecodedImage = ImageBitmap | HTMLImageElement

const MAX_AVATAR_DIMENSION = 1024

function isValidCrop(crop: PixelCrop) {
  return (
    Number.isFinite(crop.x) &&
    Number.isFinite(crop.y) &&
    Number.isFinite(crop.width) &&
    Number.isFinite(crop.height) &&
    crop.width > 0 &&
    crop.height > 0
  )
}

function avatarFileName(file: File, mediaType: string) {
  const basename = file.name.replace(/\.[^.]+$/, "") || "avatar"
  const extension = mediaType === "image/png" ? "png" : "webp"
  return `${basename}.${extension}`
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file)
    } catch {
      // Some browsers can render formats through <img> that
      // createImageBitmap cannot decode.
    }
  }

  const source = URL.createObjectURL(file)
  const image = new Image()
  try {
    image.src = source
    await image.decode()
    return image
  } catch {
    throw new CropAvatarImageError("decode")
  } finally {
    URL.revokeObjectURL(source)
  }
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob && ["image/png", "image/webp"].includes(blob.type)) {
            resolve(blob)
          } else {
            reject(new CropAvatarImageError("export"))
          }
        },
        "image/webp",
        0.9
      )
    } catch {
      reject(new CropAvatarImageError("export"))
    }
  })
}

export async function cropAvatarImage(file: File, crop: PixelCrop) {
  if (!isValidCrop(crop)) throw new CropAvatarImageError("invalid-crop")

  const image = await decodeImage(file)
  try {
    const sourceWidth =
      "naturalWidth" in image && image.naturalWidth
        ? image.naturalWidth
        : image.width
    const sourceHeight =
      "naturalHeight" in image && image.naturalHeight
        ? image.naturalHeight
        : image.height
    const left = Math.max(0, Math.floor(crop.x))
    const top = Math.max(0, Math.floor(crop.y))
    const availableWidth = Math.min(Math.floor(crop.width), sourceWidth - left)
    const availableHeight = Math.min(
      Math.floor(crop.height),
      sourceHeight - top
    )
    const cropSize = Math.min(availableWidth, availableHeight)

    if (!sourceWidth || !sourceHeight || cropSize <= 0) {
      throw new CropAvatarImageError("invalid-crop")
    }

    const outputSize = Math.min(MAX_AVATAR_DIMENSION, cropSize)
    const canvas = document.createElement("canvas")
    canvas.width = outputSize
    canvas.height = outputSize
    const context = canvas.getContext("2d")

    if (!context) throw new CropAvatarImageError("canvas")

    try {
      context.drawImage(
        image,
        left,
        top,
        cropSize,
        cropSize,
        0,
        0,
        outputSize,
        outputSize
      )
    } catch {
      throw new CropAvatarImageError("canvas")
    }

    const blob = await canvasBlob(canvas)
    return new File([blob], avatarFileName(file, blob.type), {
      type: blob.type,
      lastModified: file.lastModified,
    })
  } finally {
    if ("close" in image && typeof image.close === "function") image.close()
  }
}
