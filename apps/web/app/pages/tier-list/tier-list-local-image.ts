/**
 * Compress a local image file into a WebP data URL. Keep substantially more
 * detail than the on-page tile needs so 2x/3x exports do not merely enlarge a
 * 256px thumbnail, while the byte cap still keeps localStorage practical.
 */
export const LOCAL_IMAGE_MAX_SIZE = 1024
export const LOCAL_IMAGE_QUALITY = 0.85

export type CompressedLocalImage = {
  dataUrl: string
  width: number
  height: number
}

export async function compressImageFile(
  file: File,
  maxSize = LOCAL_IMAGE_MAX_SIZE,
  quality = LOCAL_IMAGE_QUALITY
): Promise<CompressedLocalImage | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext("2d")
    if (context === null) {
      bitmap.close()
      return null
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const dataUrl = canvas.toDataURL("image/webp", quality)
    if (!dataUrl.startsWith("data:image/webp")) {
      return null
    }
    return { dataUrl, width: canvas.width, height: canvas.height }
  } catch {
    return null
  }
}

export function labelFromFileName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "")
  return base || fileName
}
