import { useCallback, useState } from "react"
import { toast } from "sonner"

import { getCardShareLink } from "~/lib/api"
import {
  cardShareTarget,
  type NamecardShareTarget,
} from "~/pages/account/me/namecards/card-share-model"

/**
 * 单卡分享入口的公共接线（个人主页瓦片、名片详情窗）。
 *
 * 单卡链接的 `slug` 只能由属主侧接口给出，所以**点【分享】时才懒加载**；拿到 slug 再打开
 * 复用名片管理那一套面板（二维码 + 链接 + 复制/下载）。
 */
export function useCardShareDialog() {
  const [target, setTarget] = useState<NamecardShareTarget | null>(null)
  const [open, setOpen] = useState(false)
  const [busyCardNumber, setBusyCardNumber] = useState<number | null>(null)

  const requestShare = useCallback(async (cardNumber: number) => {
    setBusyCardNumber(cardNumber)
    try {
      const { slug } = await getCardShareLink(cardNumber).send()
      setTarget(cardShareTarget(slug))
      setOpen(true)
    } catch {
      toast.error("暂时无法生成分享链接")
    } finally {
      setBusyCardNumber(null)
    }
  }, [])

  return { target, open, onOpenChange: setOpen, requestShare, busyCardNumber }
}
