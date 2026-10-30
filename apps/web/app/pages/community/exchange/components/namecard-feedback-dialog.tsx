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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Textarea } from "~/components/ui/textarea"
import { toast } from "sonner"
import type { NamecardFeedbackReason } from "@imsweb/contracts/namecards"

import { FUDABA_FEEDBACK_REASON_LIMIT, FUDABA_FEEDBACK_REASON_OPTIONS } from "./namecard-feedback-model"
import { isApiError, reportFudabaCardFeedback } from "~/lib/api"

/**
 * The wall tells readers to report a card here instead of editing it. The
 * backoffice answers every report through the notice feed.
 */
export function NamecardFeedbackDialog({
  cardId,
  cardLabel,
  disabled,
}: {
  cardId: string
  cardLabel: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<NamecardFeedbackReason>("info-error")
  const [detail, setDetail] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      await reportFudabaCardFeedback(cardId, {
        reason,
        detail: detail.trim() ? detail.trim() : null,
      }).send()
      toast.success("反馈已提交，处理结果会通过站内信通知你。")
      setOpen(false)
      setDetail("")
      setReason("info-error")
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
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <FlagIcon data-icon="inline-start" aria-hidden="true" />
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
              <FieldLabel htmlFor="namecard-feedback-reason">反馈理由</FieldLabel>
              <Select
                value={reason}
                items={FUDABA_FEEDBACK_REASON_OPTIONS}
                disabled={busy}
                onValueChange={(value) =>
                  setReason(value as NamecardFeedbackReason)
                }
              >
                <SelectTrigger id="namecard-feedback-reason" aria-label="反馈理由">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUDABA_FEEDBACK_REASON_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="namecard-feedback-detail">补充说明</FieldLabel>
              <Textarea
                id="namecard-feedback-detail"
                value={detail}
                maxLength={FUDABA_FEEDBACK_REASON_LIMIT}
                disabled={busy}
                placeholder="指出具体是哪一处信息有问题，方便管理员核对。"
                onChange={(event) => setDetail(event.target.value)}
              />
              <FieldDescription>
                可选，最多 {FUDABA_FEEDBACK_REASON_LIMIT} 字。
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
