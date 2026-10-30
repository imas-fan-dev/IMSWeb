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

export function feedbackReasonLabel(reason: NamecardFeedbackReason): string {
  return (
    FUDABA_FEEDBACK_REASON_OPTIONS.find((option) => option.value === reason)
      ?.label ?? reason
  )
}
