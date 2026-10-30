import { LoaderCircleIcon } from "lucide-react"
import { useEffect, useState } from "react"

import {
  CardMediaGallery,
  type MediaSlot,
} from "~/pages/account/me/namecards/card-media-gallery"
import { getAdminNamecardDiff, type AdminNamecardDiff } from "~/lib/api"
import { slotsFromSide } from "./namecard-manage-dialog"

/**
 * 审核窗里的只读名片预览：与名片编辑窗用同一个画廊，
 * 但禁用上传、删除与拖动，只负责「看清这张卡长什么样」。
 */
export function ReviewCardPreview({ cardNumber }: { cardNumber: number }) {
  const [slots, setSlots] = useState<MediaSlot[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    getAdminNamecardDiff(cardNumber)
      .send()
      .then((detail: AdminNamecardDiff) => {
        if (!active) return
        setSlots(slotsFromSide(detail.pending ?? detail.live))
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [cardNumber])

  if (failed) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        名片图片载入失败，请刷新后重试。
      </p>
    )
  }
  if (!slots) {
    return (
      <div
        className="flex aspect-13/10 items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground"
        aria-label="正在载入名片预览"
      >
        <LoaderCircleIcon
          className="mr-2 size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        正在载入
      </div>
    )
  }
  return (
    <CardMediaGallery
      slots={slots}
      disabled
      allowUpload={false}
      onChange={() => {}}
      onError={() => {}}
    />
  )
}
