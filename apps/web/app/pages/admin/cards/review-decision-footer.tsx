import { CheckIcon, XIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "~/components/ui/button"
import { DialogFooter } from "~/components/ui/dialog"

/**
 * 投稿、认领、补充三扇审核窗底部的裁决区是同一种排版：通过、驳回，
 * 后面再挂各自多出来的动作。裁决的是哪一个对象由调用方决定，
 * 这一份只管按钮的文案、图标、禁用态与布局。
 */
export function ReviewDecisionFooter({
  onApprove,
  onReject,
  approving = false,
  rejecting = false,
  className,
  buttonClassName,
  children,
}: {
  onApprove: () => void
  onReject: () => void
  /** 通过这一侧此刻点不动（状态不允许，或正在处理）。 */
  approving?: boolean
  /** 驳回这一侧此刻点不动。 */
  rejecting?: boolean
  /** 底部区域的布局类名；默认排版够用的窗口不用传。 */
  className?: string
  /** 两枚裁决按钮各自的类名。 */
  buttonClassName?: string
  /** 驳回之后的额外动作，例如锁定。 */
  children?: ReactNode
}) {
  return (
    <DialogFooter className={className}>
      <Button
        type="button"
        className={buttonClassName}
        disabled={approving}
        onClick={onApprove}
      >
        <CheckIcon data-icon="inline-start" aria-hidden="true" />
        通过
      </Button>
      <Button
        type="button"
        variant="outline"
        className={buttonClassName}
        disabled={rejecting}
        onClick={onReject}
      >
        <XIcon data-icon="inline-start" aria-hidden="true" />
        驳回
      </Button>
      {children}
    </DialogFooter>
  )
}
