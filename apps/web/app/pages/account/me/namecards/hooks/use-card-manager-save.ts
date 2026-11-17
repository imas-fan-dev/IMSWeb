import { useCallback, useState } from "react"

import type { NamecardCardLayoutRequest } from "@imsweb/contracts/namecards"
import { toast } from "sonner"

import { putCardLayout, type NamecardCardLayout } from "~/lib/api"

import { apiMessage } from "../../account-me-model"
import { applyLayout } from "../card-manager-model"

/**
 * 保存链路需要的草稿投影：请求体、上限、生效后的清单计数与是否真有改动。
 *
 * 只取这几项（而不是整个草稿 hook）是因为 S3 的保存只有这些输入：超限阻断看
 * `limit`/`quickCount`，脏标记看 `hasChanges`，请求体由纯函数组装好。
 */
export type CardManagerSaveSource = {
  buildRequest: () => NamecardCardLayoutRequest
  /** 快速清单（生效后）里有多少张。 */
  quickCount: number
  /** 布局响应里的上限；读失败时为 `null`，此时不做超限阻断（服务端仍会校验）。 */
  limit: number | null
  hasChanges: boolean
}

/**
 * 显式保存（§12）：一次 `PUT /me/cards/layout` 原子提交布局 + 快速清单 + 批量字段。
 *
 * - 超限：`quickCardNumbers.length > limit` 时先弹阻断框，只给「返回调整」，不发请求；
 * - 成功：用响应（服务端归一后的布局）清脏并退出编辑模式，`onSaved` 负责清草稿；
 * - 失败：只报错，草稿原样保留，用户可以直接重试。
 */
export function useCardManagerSave({
  source,
  onSaved,
}: {
  source: CardManagerSaveSource
  onSaved: (layout: NamecardCardLayout) => void
}) {
  const [saving, setSaving] = useState(false)
  const [overLimit, setOverLimit] = useState<{
    count: number
    limit: number
  } | null>(null)

  const save = useCallback(() => {
    if (saving || !source.hasChanges) return
    if (source.limit !== null && source.quickCount > source.limit) {
      setOverLimit({ count: source.quickCount, limit: source.limit })
      return
    }

    const request = source.buildRequest()
    setSaving(true)
    void (async () => {
      try {
        const saved = await putCardLayout(request)
        // 响应就是归一后的布局：一次状态变化包一层 View Transition，瓦片直接滑到新位置。
        applyLayout(() => onSaved(saved))
        toast.success("名片布局已保存")
      } catch (error) {
        toast.error(apiMessage(error, "名片布局保存失败，请重试。"))
      } finally {
        setSaving(false)
      }
    })()
  }, [onSaved, saving, source])

  const dismissOverLimit = useCallback(() => setOverLimit(null), [])

  return { saving, overLimit, save, dismissOverLimit }
}
