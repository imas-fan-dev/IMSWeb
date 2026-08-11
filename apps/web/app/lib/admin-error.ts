import { isApiError } from "~/lib/api"

const STATUS_MESSAGES: Partial<Record<number, string>> = {
  401: "登录已失效，请重新登录。",
  403: "当前账号没有执行此操作的权限。",
  409: "内容已被其他操作更新，请刷新后重试。",
}

const FALLBACK_MESSAGE = "请求失败，当前输入已保留，请稍后重试。"

export function adminErrorMessage(error: unknown) {
  if (!isApiError(error)) return FALLBACK_MESSAGE

  if (error.status === 422) return error.message
  if (error.status && STATUS_MESSAGES[error.status]) {
    return STATUS_MESSAGES[error.status]
  }
  if (error.kind === "network" || (error.status && error.status >= 500)) {
    return FALLBACK_MESSAGE
  }

  return error.message || FALLBACK_MESSAGE
}
