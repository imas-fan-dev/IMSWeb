import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { isApiError, type NamecardExchangeResult } from "~/lib/api"
import { createRandomId } from "~/lib/random-id"

/**
 * 一次交换的落点：调用方只描述「用这个幂等锚点发哪个写接口」，
 * 生成编号、防连点、结果文案与失败文案都在这里统一。
 */
export type ExchangeSend = (
  clientExchangeId: string
) => Promise<NamecardExchangeResult>

/** 父 design §4.3 的结果文案，逐字照抄。 */
export const EXCHANGE_COMPLETED_MESSAGE = "交换完成，名片已放进你的名片册"
export const EXCHANGE_PENDING_MESSAGE = "已发出申请，对方确认后会通知你"
export const EXCHANGE_DECLINED_MESSAGE = "对方拒绝了这次交换"
export const EXCHANGE_EXPIRED_MESSAGE = "这次交换已过期"

/** 没有后端文案可直出时的兜底（网络断在写请求上）。 */
const EXCHANGE_FAILED_MESSAGE = "交换失败，请重试"

/** 逐条跳过的说明：同一句只提一次，按 `side` / `reason` 区分。 */
function skippedMessages(skipped: NamecardExchangeResult["skipped"]) {
  const messages = new Set<string>()
  for (const item of skipped) {
    if (item.reason === "already-owned") messages.add("你已经有这张了")
    else if (item.reason === "owned-by-target") messages.add("对方已经有这张了")
    else if (item.side === "target")
      messages.add("对方的这张名片暂时不可交换")
    else messages.add("你的这张名片暂时不可交换")
  }
  return [...messages]
}

function announceResult(result: NamecardExchangeResult) {
  if (result.status === "completed") {
    toast.success(EXCHANGE_COMPLETED_MESSAGE)
  } else if (result.status === "pending") {
    toast.success(EXCHANGE_PENDING_MESSAGE)
  } else if (result.status === "declined") {
    toast.error(EXCHANGE_DECLINED_MESSAGE)
  } else {
    toast.error(EXCHANGE_EXPIRED_MESSAGE)
  }
  for (const message of skippedMessages(result.skipped)) toast(message)
}

export interface ExchangeSubmitState {
  /** 写请求在途（按钮禁用 / 防连点）。 */
  submitting: boolean
  /**
   * 发一次交换。失败时**保留**本轮 `clientExchangeId`：重放沿用同一个幂等锚点；
   * 成功后才换新号，下一次点击就是另一次交换。
   */
  submit: (send: ExchangeSend) => Promise<NamecardExchangeResult | null>
}

/**
 * 四个入口共用的提交钩子：分享页、快速页、主页瓦片与名片墙详情窗。
 *
 * 409（已过期 / 「这张名片不接受交换」）与其它 HTTP 错误都直出后端 `error` 文案，
 * 不在前端重写；只有网络层失败才用兜底句。`onSettled` 在成功后执行一次，
 * 由挂载页面重取自己的列表（墙用 `reload` 计数，分享页重拉自身数据）。
 */
export function useExchangeSubmit({
  onSettled,
}: { onSettled?: (() => void) | undefined } = {}): ExchangeSubmitState {
  const [submitting, setSubmitting] = useState(false)
  const clientExchangeIdRef = useRef<string | null>(null)
  const inFlightRef = useRef(false)
  const settledRef = useRef(onSettled)

  useEffect(() => {
    settledRef.current = onSettled
  }, [onSettled])

  const submit = useCallback(async (send: ExchangeSend) => {
    if (inFlightRef.current) return null
    inFlightRef.current = true
    setSubmitting(true)
    const clientExchangeId =
      clientExchangeIdRef.current ?? createRandomId()
    clientExchangeIdRef.current = clientExchangeId
    try {
      const result = await send(clientExchangeId)
      clientExchangeIdRef.current = null
      announceResult(result)
      settledRef.current?.()
      return result
    } catch (error) {
      // 编号留在 ref 里：网络抖动后重放仍是同一次交换（幂等锚点）。
      toast.error(
        isApiError(error) ? error.message : EXCHANGE_FAILED_MESSAGE
      )
      return null
    } finally {
      inFlightRef.current = false
      setSubmitting(false)
    }
  }, [])

  return { submitting, submit }
}
