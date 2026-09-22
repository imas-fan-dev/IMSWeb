import {
  CircleAlertIcon,
  CircleCheckIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
} from "lucide-react"
import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { changePlatformPassword, platformPasswordSchema } from "~/lib/api"

import {
  isCurrentPasswordInvalid,
  isPasswordConflict,
  isPasswordInputInvalid,
  isPasswordUnavailable,
  isPasswordUnchanged,
  isRateLimited,
} from "./account-security-model"

type PasswordFieldName = "currentPassword" | "newPassword" | "confirmPassword"
type PasswordFieldErrors = Partial<Record<PasswordFieldName, string>>

export function PasswordSection({
  readOnly,
  passwordEnabled,
  onPasswordChanged,
}: {
  readOnly: boolean
  /**
   * Whether the account has an email password at all, as reported by the
   * login-method list. `null` means that answer has not arrived yet.
   */
  passwordEnabled?: boolean | null
  /**
   * Called after a successful change. The server rotated `token_version` in the
   * same transaction, so every other device was just signed out and any device
   * list on screen is stale the moment this resolves.
   */
  onPasswordChanged: () => void
}) {
  const { t } = useTranslation()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<PasswordFieldErrors>({})
  const [requestError, setRequestError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  // An account created through a provider sign-in has no credential to replace.
  // The login-method list now says so up front; this 409-driven flag stays as
  // the fallback for the window before that answer lands, and for the case
  // where the list request itself failed.
  const [credentialUnavailable, setCredentialUnavailable] = useState(false)
  const passwordMissing = credentialUnavailable || passwordEnabled === false

  function clearFieldError(field: PasswordFieldName) {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function validate(): boolean {
    const nextErrors: PasswordFieldErrors = {}
    if (!currentPassword.trim()) {
      nextErrors.currentPassword = t("platformAuth.passwordRequired")
    }
    if (!platformPasswordSchema.safeParse(newPassword).success) {
      nextErrors.newPassword = t(
        "platformAccount.security.password.inputInvalid"
      )
    } else if (newPassword.trim() === currentPassword.trim()) {
      nextErrors.newPassword = t("platformAccount.security.password.unchanged")
    }
    if (newPassword !== confirmPassword) {
      nextErrors.confirmPassword = t(
        "platformAccount.security.password.mismatch"
      )
    }
    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  /**
   * Maps each documented failure to the place the user can fix it. A wrong
   * current password is a field-level validation error, not a page-level
   * banner: putting it in a global alert leaves the offending input looking
   * accepted.
   */
  function reportFailure(error: unknown) {
    if (isCurrentPasswordInvalid(error)) {
      setFieldErrors({
        currentPassword: t("platformAccount.security.password.currentInvalid"),
      })
      return
    }
    if (isPasswordUnchanged(error)) {
      setFieldErrors({
        newPassword: t("platformAccount.security.password.unchanged"),
      })
      return
    }
    if (isPasswordInputInvalid(error)) {
      setFieldErrors({
        newPassword: t("platformAccount.security.password.inputInvalid"),
      })
      return
    }
    if (isPasswordUnavailable(error)) {
      setCredentialUnavailable(true)
      return
    }
    if (isRateLimited(error)) {
      setRequestError(t("platformAccount.security.password.rateLimited"))
      return
    }
    if (isPasswordConflict(error)) {
      setRequestError(t("platformAccount.security.password.failed"))
      return
    }
    setRequestError(t("platformAccount.security.password.failed"))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRequestError("")
    setSuccessMessage("")
    if (!validate()) return

    setSubmitting(true)
    try {
      const result = await changePlatformPassword({
        currentPassword,
        newPassword,
      }).send()
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setFieldErrors({})
      setSuccessMessage(
        result.revokedSessionCount > 0
          ? t("platformAccount.security.password.successDevices", {
              count: result.revokedSessionCount,
            })
          : t("platformAccount.security.password.success")
      )
      // The device list on screen still shows the sessions this call just
      // killed, so it has to be re-read rather than left as-is.
      onPasswordChanged()
    } catch (error) {
      reportFailure(error)
    } finally {
      setSubmitting(false)
    }
  }

  if (passwordMissing) {
    return (
      <section
        aria-labelledby="account-security-password-title"
        data-section="password"
        data-password-available="false"
      >
        <h2
          id="account-security-password-title"
          className="text-lg font-semibold"
        >
          {t("platformAccount.security.password.title")}
        </h2>
        <Alert className="mt-4">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>
            {t("platformAccount.security.password.unavailableTitle")}
          </AlertTitle>
          <AlertDescription>
            {t("platformAccount.security.password.unavailableDescription")}
          </AlertDescription>
        </Alert>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="account-security-password-title"
      data-section="password"
      data-password-available="true"
    >
      <h2
        id="account-security-password-title"
        className="text-lg font-semibold"
      >
        {t("platformAccount.security.password.title")}
      </h2>
      <p className="mt-2 text-sm/6 text-muted-foreground">
        {t("platformAccount.security.password.description")}
      </p>

      {successMessage ? (
        <Alert className="mt-4" aria-live="polite">
          <CircleCheckIcon aria-hidden="true" />
          <AlertTitle>
            {t("platformAccount.security.password.successTitle")}
          </AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
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
          <Field
            data-invalid={Boolean(fieldErrors.currentPassword) || undefined}
          >
            <FieldLabel htmlFor="account-security-current-password">
              {t("platformAccount.security.password.currentLabel")}
            </FieldLabel>
            <Input
              id="account-security-current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              disabled={readOnly || submitting}
              aria-invalid={Boolean(fieldErrors.currentPassword)}
              aria-describedby={
                fieldErrors.currentPassword
                  ? "account-security-current-password-error"
                  : undefined
              }
              onChange={(event) => {
                setCurrentPassword(event.currentTarget.value)
                clearFieldError("currentPassword")
              }}
            />
            <FieldError id="account-security-current-password-error">
              {fieldErrors.currentPassword}
            </FieldError>
          </Field>

          <Field data-invalid={Boolean(fieldErrors.newPassword) || undefined}>
            <FieldLabel htmlFor="account-security-new-password">
              {t("platformAccount.security.password.newLabel")}
            </FieldLabel>
            <div className="relative">
              <Input
                id="account-security-new-password"
                type={passwordVisible ? "text" : "password"}
                autoComplete="new-password"
                className="pr-11"
                value={newPassword}
                disabled={readOnly || submitting}
                aria-invalid={Boolean(fieldErrors.newPassword)}
                aria-describedby={
                  fieldErrors.newPassword
                    ? "account-security-new-password-error"
                    : undefined
                }
                onChange={(event) => {
                  setNewPassword(event.currentTarget.value)
                  clearFieldError("newPassword")
                  clearFieldError("confirmPassword")
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute inset-y-0 right-0 my-auto mr-1 size-8"
                aria-label={t(
                  passwordVisible
                    ? "platformAuth.hidePassword"
                    : "platformAuth.showPassword"
                )}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? (
                  <EyeOffIcon className="size-4" aria-hidden="true" />
                ) : (
                  <EyeIcon className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
            <FieldError id="account-security-new-password-error">
              {fieldErrors.newPassword}
            </FieldError>
          </Field>

          <Field
            data-invalid={Boolean(fieldErrors.confirmPassword) || undefined}
          >
            <FieldLabel htmlFor="account-security-confirm-password">
              {t("platformAccount.security.password.confirmLabel")}
            </FieldLabel>
            <Input
              id="account-security-confirm-password"
              type={passwordVisible ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              disabled={readOnly || submitting}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={
                fieldErrors.confirmPassword
                  ? "account-security-confirm-password-error"
                  : undefined
              }
              onChange={(event) => {
                setConfirmPassword(event.currentTarget.value)
                clearFieldError("confirmPassword")
              }}
            />
            <FieldError id="account-security-confirm-password-error">
              {fieldErrors.confirmPassword}
            </FieldError>
          </Field>
        </FieldGroup>

        <Button
          type="submit"
          className="mt-5"
          disabled={readOnly || submitting}
        >
          {submitting ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <KeyRoundIcon data-icon="inline-start" aria-hidden="true" />
          )}
          {t(
            submitting
              ? "platformAccount.security.password.submitting"
              : "platformAccount.security.password.submit"
          )}
        </Button>
      </form>
    </section>
  )
}
