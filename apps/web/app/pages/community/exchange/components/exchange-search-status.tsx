import { CircleAlertIcon, MapPinIcon, SearchIcon } from "lucide-react"
import type { ReactNode } from "react"
import type { NativeSearchStatus } from "~/lib/native-glass-search"

export function exchangeSearchStatus({
  busy,
  error,
  searched,
  resultCount,
  feedback,
  subject = "地点",
}: {
  busy: boolean
  error: string | null
  notice?: string | null
  searched: boolean
  resultCount: number
  feedback?: { kind: NativeSearchStatus["kind"]; message: string }
  subject?: string
}): NativeSearchStatus | null {
  const withFeedback = (status: NativeSearchStatus) => ({
    ...status,
    description: [status.description, feedback?.message]
      .filter(Boolean)
      .join("\n"),
  })
  if (busy)
    return withFeedback({
      kind: "loading",
      title: `正在搜索${subject}`,
      description: "正在地图上查找，请稍候。",
    })
  if (error)
    return withFeedback({
      kind: "error",
      title: resultCount
        ? `部分${subject}暂时无法搜索`
        : `${subject}暂时无法搜索`,
      description: `${error} 可以重新查找。`,
    })
  if (searched && !resultCount)
    return withFeedback({
      kind: "empty",
      title: `没有找到${subject}`,
      description:
        subject === "事务所"
          ? "请尝试事务所名称、城市或地址。"
          : "请尝试城市加场馆名或完整地址。",
    })
  if (feedback)
    return {
      kind: feedback.kind,
      title: feedback.message,
      description:
        feedback.kind === "loading"
          ? "正在整理当前范围的信息，请稍候。"
          : feedback.kind === "empty"
            ? "试试移动地图，或搜索其他区域。"
            : feedback.kind === "error"
              ? "可以重试地图，或查看事务所名录。"
              : "可继续移动地图，或搜索具体地点。",
    }
  return resultCount
    ? null
    : {
        kind: "idle",
        title: `搜索一个${subject}`,
        description:
          subject === "事务所"
            ? "输入事务所名称、城市或地址。"
            : "输入城市、场馆或完整地址，在地图上定位。",
      }
}

export function ExchangeSearchStatus({
  status,
  compact,
  children,
}: {
  status: NativeSearchStatus
  compact: boolean
  children?: ReactNode
}) {
  const Icon =
    status.kind === "error"
      ? CircleAlertIcon
      : status.kind === "empty" || status.kind === "notice"
        ? MapPinIcon
        : SearchIcon
  return (
    <div
      className="exchange-search-status"
      data-kind={status.kind}
      data-compact={compact || undefined}
      role={status.kind === "error" ? "alert" : "status"}
      aria-atomic="true"
    >
      <span className="exchange-search-status-mark" aria-hidden="true">
        <Icon />
      </span>
      <div className="exchange-search-status-copy">
        <p className="exchange-search-status-title">{status.title}</p>
        <p className="exchange-search-status-description">
          {status.description}
        </p>
        {children ? (
          <div className="exchange-search-status-actions">{children}</div>
        ) : null}
      </div>
    </div>
  )
}
