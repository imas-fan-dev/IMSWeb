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
  if (error.status === 409) {
    // 409 有两种：版本竞争（服务端只给 code/revision）与业务拒绝（带具体原因，
    // 例如“认领目标不可用”）。后者必须原样告诉管理员，否则会被误读成刷新一下就好。
    const payload = error.payload
    const reason =
      payload && typeof payload === "object" && "message" in payload
        ? (payload as { message?: unknown }).message
        : undefined
    return typeof reason === "string" && reason.trim()
      ? reason
      : STATUS_MESSAGES[409]!
  }
  if (error.status && STATUS_MESSAGES[error.status]) {
    return STATUS_MESSAGES[error.status]
  }
  if (error.kind === "network" || (error.status && error.status >= 500)) {
    return FALLBACK_MESSAGE
  }

  return error.message || FALLBACK_MESSAGE
}
