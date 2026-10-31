import { isApiError } from "~/lib/api"

export type EditorFeedback = {
  kind: "success" | "error" | "conflict"
  message: string
}

export function apiMessage(error: unknown, fallback: string) {
  return isApiError(error) && error.message ? error.message : fallback
}

export function isFeatureClosed(error: unknown) {
  return (
    isApiError(error) && error.status === 404 && error.payload === "Not Found"
  )
}

export function validateImage(file: File, maximumBytes: number) {
  if (!file.type.startsWith("image/")) return "请选择图片文件。"
  if (file.size > maximumBytes) {
    return `图片不能超过 ${Math.floor(maximumBytes / 1024 / 1024)} MiB。`
  }
  return null
}
