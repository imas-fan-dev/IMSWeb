import jsQR from "jsqr"

/**
 * 从相册图片里解出二维码文本。
 *
 * 原生插件只给实时取景，不提供相册；用户分享出去的二维码常常只是一张截图，
 * 所以在 WebView 里解码。长边限制到 1440 像素：二维码定位不需要原图分辨率，
 * 缩到该尺寸后 jsQR 在低端机上也只是一帧的耗时。
 */
const MAX_EDGE = 1440

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = "async"
    image.src = url
    await image.decode()
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function decodeQrFromImage(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null
  let image: HTMLImageElement
  try {
    image = await loadImage(file)
  } catch {
    return null
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const code = jsQR(pixels.data, pixels.width, pixels.height, {
    inversionAttempts: "attemptBoth",
  })
  return code?.data?.trim() ?? null
}
