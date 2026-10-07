import {
  CircleAlertIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
  MailIcon,
} from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"

import {
  platformEmailBindRequestSchema,
  platformEmailChangeRequestSchema,
  platformEmailVerificationCodeRequestSchema,
} from "@imsweb/contracts/platform/account-security"

import { Alert, AlertDescription } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Skeleton } from "~/components/ui/skeleton"
import {
  bindPlatformEmail,
  changePlatformEmail,
  isApiError,
  sendPlatformEmailVerificationCode,
} from "~/lib/api"

import {
  isCurrentPasswordInvalid,
  isEmailAlreadyBound,
  isEmailConflict,
  isEmailInputInvalid,
  isEmailNotBound,
  isEmailStateConflict,
  isEmailUnavailable,
  isEmailUnchanged,
  isEmailVerificationInvalid,
  isRateLimited,
} from "./account-security-model"

type EmailFieldName = "email" | "code" | "password"
type EmailFieldErrors = Partial<Record<EmailFieldName, string>>

function remainingCooldownSeconds(deadline: number): number {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

function retryAfterSeconds(error: unknown): number | null {
  if (!isApiError(error) || error.kind !== "http" || error.status !== 429) {
    return null
  }
  const payload = error.payload
  if (
    !payload ||
    typeof payload !== "object" ||
    !("retryAfterSeconds" in payload)
  ) {
    return null
  }
  const value = payload.retryAfterSeconds
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 600
    ? value
    : null
}

/**
 * Binds the account's first email credential, or moves an existing one.
 *
 * The two cases need different proofs, so the form changes with
 * `passwordEnabled`: a provider-only account sets a new password, while an
 * account that already signs in with a password re-proves it and keeps the
 * stored hash. The verification code is only ever a request; the API consumes
 * it and writes the credential in one transaction, so nothing lands before the
 * code checks out.
 */
export function EmailCredentialSection({
  readOnly,
  passwordEnabled,
  onEmailChanged,
}: {
  readOnly: boolean
  /**
   * Whether the account already has an email credential, as reported by the
   * login-method list. `null` means that answer has not arrived yet.
   */
  passwordEnabled: boolean | null
  onEmailChanged?: (email: string) => void
}) {
  const { t } = useTranslation()
  const isChange = passwordEnabled === true
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [sendingCode, setSendingCode] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [cooldownDeadline, setCooldownDeadline] = useState<number | null>(null)
  const [fieldErrors, setFieldErrors] = useState<EmailFieldErrors>({})
  const [requestError, setRequestError] = useState("")
  const [feedback, setFeedback] = useState("")

  useEffect(() => {
    if (cooldownDeadline === null) return
    const update = () => {
      const remaining = remainingCooldownSeconds(cooldownDeadline)
      setCooldownSeconds(remaining)
      if (remaining === 0) setCooldownDeadline(null)
    }
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [cooldownDeadline])

  function startCooldown(seconds: number) {
    setCooldownSeconds(seconds)
    setCooldownDeadline(Date.now() + seconds * 1000)
  }

  function clearFieldError(field: EmailFieldName) {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function reportFailure(error: unknown) {
    if (isCurrentPasswordInvalid(error)) {
      setFieldErrors({
        password: t("platformAccount.security.email.currentInvalid"),
      })
      return
    }
    if (isEmailUnchanged(error)) {
      setFieldErrors({
        email: t("platformAccount.security.email.unchanged"),
      })
      return
    }
    if (isEmailVerificationInvalid(error)) {
      setFieldErrors({
        code: t("platformAccount.security.email.verificationInvalid"),
      })
      return
    }
    if (isEmailConflict(error)) {
      setRequestError(t("platformAccount.security.email.conflict"))
      return
    }
    if (isEmailAlreadyBound(error)) {
      setRequestError(t("platformAccount.security.email.alreadyBound"))
      return
    }
    if (isEmailNotBound(error)) {
      setRequestError(t("platformAccount.security.email.notBound"))
      return
    }
    if (isEmailStateConflict(error)) {
      setRequestError(t("platformAccount.security.email.stateConflict"))
      return
    }
    if (isEmailInputInvalid(error)) {
      setRequestError(t("platformAccount.security.email.inputInvalid"))
      return
    }
    if (isEmailUnavailable(error)) {
      setRequestError(t("platformAccount.security.email.unavailable"))
      return
    }
    if (isRateLimited(error)) {
      const seconds = retryAfterSeconds(error)
      if (seconds !== null) startCooldown(seconds)
      setRequestError(
        t("platformAccount.security.email.cooldown", { seconds: seconds ?? 60 })
      )
      return
    }
    setRequestError(t("platformAccount.security.email.failed"))
  }

  async function sendCode() {
    setRequestError("")
    setFeedback("")
    const parsed = platformEmailVerificationCodeRequestSchema.safeParse({
      email,
    })
    if (!parsed.success) {
      setFieldErrors((current) => ({
        ...current,
        email: t("platformAccount.security.email.inputInvalid"),
      }))
      return
    }
    setSendingCode(true)
    try {
      const response = await sendPlatformEmailVerificationCode(
        parsed.data
      ).send()
      startCooldown(response.retryAfterSeconds)
      setFeedback(t("platformAccount.security.email.codeSent"))
    } catch (error) {
      const seconds = retryAfterSeconds(error)
      if (seconds !== null) {
        startCooldown(seconds)
        setRequestError(
          t("platformAccount.security.email.cooldown", { seconds })
        )
      } else if (isEmailConflict(error)) {
        setRequestError(t("platformAccount.security.email.conflict"))
      } else if (isEmailUnchanged(error)) {
        setRequestError(t("platformAccount.security.email.unchanged"))
      } else if (isEmailUnavailable(error)) {
        setRequestError(t("platformAccount.security.email.unavailable"))
      } else {
        setRequestError(t("platformAccount.security.email.failed"))
      }
    } finally {
      setSendingCode(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRequestError("")
    setFeedback("")
    setFieldErrors({})
    if (isChange) {
      const parsed = platformEmailChangeRequestSchema.safeParse({
        email,
        code,
        currentPassword: password,
      })
      if (!parsed.success) {
        setFieldErrors({
          email: t("platformAccount.security.email.inputInvalid"),
          code: t("platformAccount.security.email.inputInvalid"),
          password: t("platformAccount.security.email.inputInvalid"),
        })
        return
      }
      setSubmitting(true)
      try {
        const response = await changePlatformEmail(parsed.data).send()
        setFeedback(t("platformAccount.security.email.success"))
        setCode("")
        setPassword("")
        onEmailChanged?.(response.email)
      } catch (error) {
        reportFailure(error)
      } finally {
        setSubmitting(false)
      }
      return
    }

    const parsed = platformEmailBindRequestSchema.safeParse({
      email,
      code,
      newPassword: password,
    })
    if (!parsed.success) {
      setFieldErrors({
        email: t("platformAccount.security.email.inputInvalid"),
        code: t("platformAccount.security.email.inputInvalid"),
        password: t("platformAccount.security.email.inputInvalid"),
      })
      return
    }
    setSubmitting(true)
    try {
      const response = await bindPlatformEmail(parsed.data).send()
      setFeedback(t("platformAccount.security.email.success"))
      setCode("")
      setPassword("")
      onEmailChanged?.(response.email)
    } catch (error) {
      reportFailure(error)
    } finally {
      setSubmitting(false)
    }
  }

  const busy = submitting || sendingCode

  return (
    <section
      aria-labelledby="account-security-email-title"
      data-section="email-credential"
      data-email-mode={
        passwordEnabled === null ? "loading" : isChange ? "change" : "bind"
      }
    >
      <h2 id="account-security-email-title" className="text-lg font-semibold">
        {t("platformAccount.security.email.title")}
      </h2>
      <p className="mt-2 text-sm/6 text-muted-foreground">
        {t("platformAccount.security.email.description")}
      </p>

      {passwordEnabled === null ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          <Skeleton className="h-32 w-full" aria-hidden="true" />
        </div>
      ) : (
        <>
          {feedback ? (
            <Alert className="mt-4" aria-live="polite">
              <CircleCheckIcon aria-hidden="true" />
              <AlertDescription>{feedback}</AlertDescription>
            </Alert>
          ) : null}

          {requestError ? (
            <Alert variant="destructive" className="mt-4" aria-live="assertive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertDescription>{requestError}</AlertDescription>
            </Alert>
          ) : null}

          <form className="mt-5" onSubmit={(event) => void submit(event)}>
            <FieldGroup>
              <Field data-invalid={Boolean(fieldErrors.email) || undefined}>
                <FieldLabel htmlFor="account-security-email">
                  {t("platformAccount.security.email.emailLabel")}
                </FieldLabel>
                <Input
                  id="account-security-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  disabled={readOnly || busy}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={
                    fieldErrors.email
                      ? "account-security-email-error"
                      : undefined
                  }
                  onChange={(event) => {
                    setEmail(event.currentTarget.value)
                    clearFieldError("email")
                  }}
                />
                <FieldError id="account-security-email-error">
                  {fieldErrors.email}
                </FieldError>
              </Field>

              <Field data-invalid={Boolean(fieldErrors.code) || undefined}>
                <FieldLabel htmlFor="account-security-email-code">
                  {t("platformAccount.security.email.codeLabel")}
                </FieldLabel>
                <div className="flex min-w-0 items-start gap-2">
                  <Input
                    id="account-security-email-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="min-w-0 flex-1"
                    value={code}
                    disabled={readOnly || busy}
                    aria-invalid={Boolean(fieldErrors.code)}
                    aria-describedby={
                      fieldErrors.code
                        ? "account-security-email-code-error"
                        : undefined
                    }
                    onChange={(event) => {
                      setCode(event.currentTarget.value)
                      clearFieldError("code")
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={readOnly || busy || cooldownSeconds > 0}
                    onClick={() => void sendCode()}
                  >
                    {sendingCode ? (
                      <LoaderCircleIcon
                        data-icon="inline-start"
                        className="animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    ) : (
                      <MailIcon data-icon="inline-start" aria-hidden="true" />
                    )}
                    {sendingCode
                      ? t("platformAccount.security.email.sendingCode")
                      : cooldownSeconds > 0
                        ? t("platformAccount.security.email.resendIn", {
                            seconds: cooldownSeconds,
                          })
                        : t("platformAccount.security.email.sendCode")}
                  </Button>
                </div>
                <FieldError id="account-security-email-code-error">
                  {fieldErrors.code}
                </FieldError>
              </Field>

              <Field data-invalid={Boolean(fieldErrors.password) || undefined}>
                <FieldLabel htmlFor="account-security-email-password">
                  {t(
                    isChange
                      ? "platformAccount.security.email.currentPasswordLabel"
                      : "platformAccount.security.email.newPasswordLabel"
                  )}
                </FieldLabel>
                <Input
                  id="account-security-email-password"
                  type="password"
                  autoComplete={isChange ? "current-password" : "new-password"}
                  value={password}
                  disabled={readOnly || busy}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={
                    fieldErrors.password
                      ? "account-security-email-password-error"
                      : undefined
                  }
                  onChange={(event) => {
                    setPassword(event.currentTarget.value)
                    clearFieldError("password")
                  }}
                />
                <FieldError id="account-security-email-password-error">
                  {fieldErrors.password}
                </FieldError>
              </Field>

              <Button type="submit" size="lg" disabled={readOnly || busy}>
                {submitting
                  ? t("platformAccount.security.email.submitting")
                  : t(
                      isChange
                        ? "platformAccount.security.email.submitChange"
                        : "platformAccount.security.email.submitBind"
                    )}
              </Button>
            </FieldGroup>
          </form>
        </>
      )}
    </section>
  )
}
