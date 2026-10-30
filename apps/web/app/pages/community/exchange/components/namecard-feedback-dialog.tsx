import { FlagIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import { Textarea } from "~/components/ui/textarea"
import { toast } from "sonner"
import type { NamecardFeedbackReason } from "@imsweb/contracts/namecards"

import {
  FUDABA_FEEDBACK_PRESETS,
  FUDABA_FEEDBACK_REASON_LIMIT,
} from "./namecard-feedback-model"
import { isApiError, reportFudabaCardFeedback } from "~/lib/api"

/**
 * The wall tells readers to report a card here instead of editing it. The
 * backoffice answers every report through the notice feed.
 */
export function NamecardFeedbackDialog({
  cardId,
  cardLabel,
  disabled,
  triggerVariant = "outline",
  triggerClassName,
}: {
  cardId: string
  cardLabel: string
  disabled?: boolean
  /** The caller owns how the entry looks next to its neighbours. */
  triggerVariant?: "outline" | "destructive" | "secondary"
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<NamecardFeedbackReason>("info-error")
  const [detail, setDetail] = useState("")
  const [busy, setBusy] = useState(false)
  const [detailMissing, setDetailMissing] = useState(false)

  const submit = async () => {
    if (busy) return
    // The reporter has to describe the problem: a bare preset tells the
    // operator nothing, and guessing on their behalf invents a claim.
    if (!detail.trim()) {
      setDetailMissing(true)
      return
    }
    setBusy(true)
    try {
      await reportFudabaCardFeedback(cardId, {
        reason,
        detail: detail.trim(),
      }).send()
      toast.success("反馈已提交，处理结果会通过站内信通知你。")
      setOpen(false)
      setDetail("")
      setReason("info-error")
      setDetailMissing(false)
    } catch (cause) {
      // One open report per reader: the API explains why it refused.
      const payload = isApiError(cause) ? cause.payload : null
      const reason =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error: unknown }).error)
          : null
      toast.error(reason || "反馈提交失败，请稍后再试")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        className={triggerClassName}
        disabled={disabled}
        title={disabled ? "登录后可以提交反馈" : undefined}
        onClick={() => setOpen(true)}
      >
        <FlagIcon aria-hidden="true" />
        反馈
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>反馈名片信息</DialogTitle>
            <DialogDescription>
              针对「{cardLabel}」提交反馈，管理员核实后会通知你处理结果。
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <Field>
              <FieldLabel htmlFor="namecard-feedback-detail">反馈理由</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {FUDABA_FEEDBACK_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    disabled={busy}
                    onClick={() => setReason(preset.reason)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <Textarea
                id="namecard-feedback-detail"
                value={detail}
                maxLength={FUDABA_FEEDBACK_REASON_LIMIT}
                disabled={busy}
                aria-invalid={detailMissing}
                placeholder="指出具体是哪一处信息有问题，方便管理员核对。"
                onChange={(event) => {
                  setDetail(event.target.value)
                  if (event.target.value.trim()) setDetailMissing(false)
                }}
              />
              <FieldDescription>
                {detailMissing
                  ? "请先说明这条反馈的具体问题。"
                  : `必填，最多 ${FUDABA_FEEDBACK_REASON_LIMIT} 字；预设标签只切换反馈理由，说明需要你自己写。`}
              </FieldDescription>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? "提交中…" : "提交反馈"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
