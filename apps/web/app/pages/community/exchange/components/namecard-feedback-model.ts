import type { NamecardFeedbackReason } from "@imsweb/contracts/namecards"

/** The three presets the report queue is built around. */
export const FUDABA_FEEDBACK_REASON_OPTIONS: readonly {
  value: NamecardFeedbackReason
  label: string
}[] = [
  { value: "info-error", label: "信息错误" },
  { value: "ownership-error", label: "归属错误" },
  { value: "content-violation", label: "信息违规" },
]

export const FUDABA_FEEDBACK_REASON_LIMIT = 400

/**
 * One-click reasons. Picking one writes the sentence into the detail box and
 * remembers the category the queue files it under.
 */
export const FUDABA_FEEDBACK_PRESETS: readonly {
  label: string
  reason: NamecardFeedbackReason
}[] = [
  { label: "制作人名称有误", reason: "info-error" },
  { label: "企划或角色有误", reason: "info-error" },
  { label: "名片归属他人", reason: "ownership-error" },
  { label: "内容不当", reason: "content-violation" },
]

export function feedbackReasonLabel(reason: NamecardFeedbackReason): string {
  return (
    FUDABA_FEEDBACK_REASON_OPTIONS.find((option) => option.value === reason)
      ?.label ?? reason
  )
}
