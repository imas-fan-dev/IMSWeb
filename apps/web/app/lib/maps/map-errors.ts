/** Only adapter-owned, static explanations are safe to show to visitors. */
export class MapDisplayError extends Error {
  constructor(
    readonly kind:
      | "authorization"
      | "reload-required"
      | "unsupported-provider"
      | "resource",
    message: string
  ) {
    super(message)
    this.name = "MapDisplayError"
  }
}

export function mapFailureDescription(error: Error): string {
  if (error instanceof MapDisplayError) {
    return error.kind === "reload-required"
      ? error.message
      : `${error.message}公开事务所和名片仍可在名录中查看。`
  }
  const normalized = error.message.trim().toLowerCase()
  if (normalized === "not found" || normalized === "map disabled")
    return "区域地图尚未启用，公开事务所和名片仍可在名录中查看。"
  return "地图服务暂时无法连接，公开事务所和名片仍可在名录中查看。"
}
