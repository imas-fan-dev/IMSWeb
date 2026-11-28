import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import type { PrivacyPolicyContent } from "~/lib/api"

interface PrivacyPolicyConsentProps {
  policy: PrivacyPolicyContent
  accepted: boolean
  onAcceptedChange: (accepted: boolean) => void
  error?: string
}

function policyUpdatedAt(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "long" }).format(date)
}

export function PrivacyPolicyConsent({
  policy,
  accepted,
  onAcceptedChange,
  error,
}: PrivacyPolicyConsentProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const updatedAt = policyUpdatedAt(policy.updatedAt)

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <Checkbox
          id="platform-privacy-consent"
          className="mt-0.5"
          checked={accepted}
          onCheckedChange={(checked) => onAcceptedChange(checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? "platform-privacy-consent-error" : undefined
          }
        />
        <div className="text-sm/6 text-muted-foreground">
          <label
            htmlFor="platform-privacy-consent"
            className="cursor-pointer select-none"
          >
            {t("platformAuth.privacy.consentLabel")}
          </label>{" "}
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
            onClick={() => setOpen(true)}
          >
            《{policy.title}》
          </button>
        </div>
      </div>
      {error ? (
        <p
          id="platform-privacy-consent-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent layout="pinned" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="pr-10">{policy.title}</DialogTitle>
            <DialogDescription>
              {updatedAt
                ? t("platformAuth.privacy.updatedAt", { date: updatedAt })
                : t("platformAuth.privacy.dialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="rounded-lg border bg-muted/20 p-4 text-sm/7 wrap-break-word whitespace-pre-wrap text-foreground">
              {policy.body}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("platformAuth.privacy.dialogClose")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                onAcceptedChange(true)
                setOpen(false)
              }}
            >
              {t("platformAuth.privacy.dialogAccept")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
