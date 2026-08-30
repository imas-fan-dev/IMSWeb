import { platformAuthOAuthPath } from "@imsweb/contracts/paths"
import {
  ArrowRightIcon,
  CircleCheckIcon,
  Code2Icon,
  Globe2Icon,
  KeyRoundIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  LogInIcon,
  MailCheckIcon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserPlusIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  NavigationBoundary,
  NavigationLink,
} from "~/components/navigation/navigation-link"
import { usePlatformSession } from "~/components/platform/platform-session-provider"
import type { PlatformOAuthProvider } from "~/lib/api"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button, buttonVariants } from "~/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  getPlatformOAuthProviders,
  isApiError,
  loginPlatform,
  platformLoginInputSchema,
  platformPasswordResetSubmissionSchema,
  platformRegistrationVerificationInputSchema,
  platformRegisterInputSchema,
  registerPlatform,
  resetPlatformPassword,
  sendPlatformPasswordResetVerificationCode,
  sendPlatformRegistrationVerificationCode,
} from "~/lib/api"
import { useNavigation } from "~/lib/navigation/use-navigation"

type AccountAuthMode = "login" | "register" | "reset"
type FieldName =
  | "email"
  | "password"
  | "displayName"
  | "confirmPassword"
  | "code"
type FieldErrors = Partial<Record<FieldName, string>>
type VerificationFeedbackKind = "error" | "success"

interface AccountAuthFormProps {
  mode: AccountAuthMode
}

export function AccountAuthForm({ mode }: AccountAuthFormProps) {
  const { t } = useTranslation()
  const navigate = useNavigation()
  const platform = usePlatformSession()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sendingVerification, setSendingVerification] = useState(false)
  const [verificationRequested, setVerificationRequested] = useState(false)
  const [verificationCooldownSeconds, setVerificationCooldownSeconds] =
    useState(0)
  const [verificationFeedback, setVerificationFeedback] = useState("")
  const [verificationFeedbackKind, setVerificationFeedbackKind] =
    useState<VerificationFeedbackKind>("success")
  const [completed, setCompleted] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [requestError, setRequestError] = useState("")
  const [oauthProviders, setOauthProviders] = useState<PlatformOAuthProvider[]>(
    []
  )

  const isRegister = mode === "register"
  const isReset = mode === "reset"
  const hasVerificationCode = isRegister || isReset
  const verificationCoolingDown = verificationCooldownSeconds > 0
  const title = t(
    isRegister
      ? "platformAuth.register.title"
      : isReset
        ? "platformAuth.reset.title"
        : "platformAuth.login.title"
  )
  const description = t(
    isRegister
      ? "platformAuth.register.description"
      : isReset
        ? "platformAuth.reset.description"
        : "platformAuth.login.description"
  )

  useEffect(() => {
    if (completed) {
      void navigate(
        isReset ? "/account/login?reset=success" : "/community/exchange/me",
        { replace: true }
      )
    }
  }, [completed, isReset, navigate])

  useEffect(() => {
    if (isReset) return
    let active = true
    void getPlatformOAuthProviders()
      .send()
      .then((response) => {
        if (active) setOauthProviders(response.providers)
      })
      .catch(() => {
        if (active) setOauthProviders([])
      })
    return () => {
      active = false
    }
  }, [isReset])

  useEffect(() => {
    if (!verificationCoolingDown) return
    const timer = window.setInterval(() => {
      setVerificationCooldownSeconds((current) => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [verificationCoolingDown])

  function clearFieldError(field: FieldName) {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function validate(): {
    email: string
    password: string
    displayName?: string
    code?: string
  } | null {
    const nextErrors: FieldErrors = {}
    const input = isRegister
      ? { email, password, displayName, code: verificationCode }
      : isReset
        ? { email, password, code: verificationCode }
        : { email, password }
    const result = isRegister
      ? platformRegisterInputSchema.safeParse(input)
      : isReset
        ? platformPasswordResetSubmissionSchema.safeParse(input)
        : platformLoginInputSchema.safeParse(input)

    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path[0]
        if (field === "email") {
          nextErrors.email = t("platformAuth.emailInvalid")
        } else if (field === "password") {
          nextErrors.password = t(
            isRegister || isReset
              ? password.length < 8
                ? "platformAuth.passwordShort"
                : "platformAuth.passwordLong"
              : password.trim()
                ? "platformAuth.passwordLegacyLong"
                : "platformAuth.passwordRequired"
          )
        } else if (field === "displayName") {
          nextErrors.displayName = t(
            displayName.trim()
              ? "platformAuth.displayNameLong"
              : "platformAuth.displayNameRequired"
          )
        } else if (field === "code") {
          nextErrors.code = t("platformAuth.verification.codeInvalid")
        }
      }
    }

    if ((isRegister || isReset) && password !== confirmPassword) {
      nextErrors.confirmPassword = t("platformAuth.passwordMismatch")
    }
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors)
      return null
    }

    return result.success ? result.data : null
  }

  function requestErrorMessage(error: unknown) {
    if (!isApiError(error)) return t("platformAuth.requestFailed")
    if (error.kind === "network") return t("platformAuth.networkError")
    if (error.status === 429) return t("platformAuth.rateLimited")
    if (!isRegister && !isReset && error.status === 401) {
      return t("platformAuth.invalidCredentials")
    }
    if (isRegister && error.status === 409) {
      return t("platformAuth.emailRegistered")
    }
    if (
      (isRegister || isReset) &&
      (error.code === "PLATFORM_EMAIL_VERIFICATION_INVALID" ||
        error.code === "PLATFORM_EMAIL_VERIFICATION_EXPIRED" ||
        error.code === "PLATFORM_PASSWORD_RESET_INVALID")
    ) {
      return t("platformAuth.verification.codeRejected")
    }
    return t("platformAuth.requestFailed")
  }

  function retryAfterSeconds(error: unknown) {
    if (!isApiError(error) || error.status !== 429) return 0
    const payload = error.payload
    if (
      !payload ||
      typeof payload !== "object" ||
      !("retryAfterSeconds" in payload)
    ) {
      return 60
    }
    const value = payload.retryAfterSeconds
    return typeof value === "number" && Number.isInteger(value) && value > 0
      ? value
      : 60
  }

  async function sendVerificationCode() {
    setRequestError("")
    setVerificationFeedback("")
    setVerificationFeedbackKind("success")
    const result = platformRegistrationVerificationInputSchema.safeParse({
      email,
    })
    if (!result.success) {
      setFieldErrors((current) => ({
        ...current,
        email: t("platformAuth.emailInvalid"),
      }))
      return
    }

    setSendingVerification(true)
    try {
      const response = await (
        isReset
          ? sendPlatformPasswordResetVerificationCode(result.data)
          : sendPlatformRegistrationVerificationCode(result.data)
      ).send()
      setVerificationRequested(true)
      setVerificationCooldownSeconds(response.retryAfterSeconds ?? 60)
      setVerificationFeedbackKind("success")
      setVerificationFeedback(
        t(
          isReset
            ? "platformAuth.passwordReset.sent"
            : "platformAuth.verification.sent",
          { email: result.data.email }
        )
      )
    } catch (error) {
      setVerificationFeedbackKind("error")
      if (isApiError(error) && error.status === 429) {
        const seconds = retryAfterSeconds(error)
        setVerificationRequested(true)
        setVerificationCooldownSeconds(seconds)
        setVerificationFeedback(
          t("platformAuth.verification.rateLimited", { seconds })
        )
      } else if (isApiError(error) && error.status === 503) {
        setVerificationFeedback(t("platformAuth.verification.unavailable"))
      } else if (isApiError(error) && error.kind === "network") {
        setVerificationFeedback(t("platformAuth.networkError"))
      } else {
        setVerificationFeedback(t("platformAuth.verification.sendFailed"))
      }
    } finally {
      setSendingVerification(false)
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRequestError("")
    const submission = validate()
    if (!submission) return

    setSubmitting(true)
    try {
      if (isReset) {
        await resetPlatformPassword({
          email: submission.email,
          code: submission.code ?? "",
          password: submission.password,
        }).send()
        setCompleted(true)
        return
      }
      const session = isRegister
        ? await registerPlatform({
            email: submission.email,
            password: submission.password,
            displayName: submission.displayName ?? "",
            code: submission.code ?? "",
          }).send()
        : await loginPlatform({
            email: submission.email,
            password: submission.password,
          }).send()
      platform.acceptSession(session)
      setCompleted(true)
    } catch (error) {
      setRequestError(requestErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  if (platform.status === "loading") {
    return (
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-12 sm:px-6 lg:px-8"
      >
        <Alert>
          <LoaderCircleIcon
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <AlertTitle>{t("platformAuth.checkingSession")}</AlertTitle>
        </Alert>
      </main>
    )
  }

  if (platform.session) {
    return (
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-12 sm:px-6 lg:px-8"
      >
        <section className="w-full space-y-5" aria-labelledby="signed-in-title">
          <Alert>
            <CircleCheckIcon aria-hidden="true" />
            <AlertTitle id="signed-in-title">
              {completed
                ? t(
                    isRegister
                      ? "platformAuth.register.success"
                      : "platformAuth.login.success"
                  )
                : t("platformAuth.signedInTitle")}
            </AlertTitle>
            <AlertDescription>
              {completed
                ? t(
                    isRegister
                      ? "platformAuth.register.successDescription"
                      : "platformAuth.login.successDescription"
                  )
                : t("platformAuth.signedInDescription", {
                    name: platform.session.profile.displayName,
                  })}
            </AlertDescription>
          </Alert>
          <NavigationLink
            to="/community/exchange/me"
            className={buttonVariants({
              size: "lg",
              className: "h-11 w-full",
            })}
          >
            {t("platformAuth.enterWorkspace")}
          </NavigationLink>
        </section>
      </main>
    )
  }

  return (
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-8 sm:px-6 sm:py-12 lg:px-8"
    >
      <div className="grid w-full overflow-hidden rounded-xl border border-foreground/10 bg-card shadow-sm md:grid-cols-[1.18fr_0.82fr]">
        <aside className="relative hidden min-h-136 flex-col overflow-hidden bg-admin-ink p-8 text-admin-ink-foreground md:flex lg:p-10">
          <div
            className="flex h-1.5 w-full overflow-hidden rounded-full"
            aria-hidden="true"
          >
            <span className="flex-1 bg-franchise-765" />
            <span className="flex-1 bg-franchise-cg" />
            <span className="flex-1 bg-franchise-ml" />
            <span className="flex-1 bg-franchise-sidem" />
            <span className="flex-1 bg-franchise-sc" />
            <span className="flex-1 bg-franchise-gk" />
          </div>
          <div className="mt-8 flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-admin-ink-subtle uppercase">
            <SparklesIcon
              className="size-4 text-franchise-765"
              aria-hidden="true"
            />
            IMSWeb / Platform
          </div>
          <div className="mt-auto">
            <p className="text-sm font-medium text-admin-ink-subtle">
              制作人身份空间
            </p>
            <h2 className="mt-3 text-3xl/tight font-semibold text-balance">
              {isRegister
                ? "从这里开始，建立你的制作人身份"
                : isReset
                  ? "重新掌握你的帐号"
                  : "欢迎回到交换空间"}
            </h2>
            <p className="mt-4 max-w-sm text-sm/6 text-admin-ink-subtle">
              {isRegister
                ? "用邮箱确认帐号归属，之后即可管理自己的资料与交换名片。"
                : isReset
                  ? "验证邮箱归属后设置新密码，已有登录会话会同时失效。"
                  : "登录后继续管理你的制作人资料、名片与交换事务所。"}
            </p>
            <ul className="mt-8 space-y-4 text-sm text-admin-ink-foreground">
              <li className="flex items-start gap-3">
                <ShieldCheckIcon
                  className="mt-0.5 size-4 shrink-0 text-franchise-sidem"
                  aria-hidden="true"
                />
                <span>帐号与公开资料分开管理</span>
              </li>
              <li className="flex items-start gap-3">
                <MailCheckIcon
                  className="mt-0.5 size-4 shrink-0 text-franchise-ml"
                  aria-hidden="true"
                />
                <span>邮箱验证保护注册归属</span>
              </li>
              <li className="flex items-start gap-3">
                <ArrowRightIcon
                  className="mt-0.5 size-4 shrink-0 text-franchise-cg"
                  aria-hidden="true"
                />
                <span>登录后直达我的交换空间</span>
              </li>
            </ul>
          </div>
          <p className="mt-10 text-xs text-admin-ink-subtle">
            {isRegister
              ? "注册完成后即可继续完善资料。"
              : isReset
                ? "密码更新后，请重新登录所有需要访问的设备。"
                : "你的名片和资料会留在自己的工作区。"}
          </p>
        </aside>

        <section className="min-w-0 bg-card p-5 sm:p-8 lg:p-10">
          <header className="border-b pb-5">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              <span
                className="size-2 rounded-full bg-primary"
                aria-hidden="true"
              />
              {isRegister
                ? "Create account"
                : isReset
                  ? "Reset password"
                  : "Sign in"}
            </div>
            <h1 className="mt-3 font-heading text-2xl/snug font-semibold sm:text-3xl">
              {title}
            </h1>
            <p
              id={`${mode}-description`}
              className="mt-2 text-sm/6 text-muted-foreground"
            >
              {description}
            </p>
          </header>
          <div className="pt-6">
            <form
              className="space-y-5"
              onSubmit={submit}
              noValidate
              aria-describedby={`${mode}-description`}
            >
              {requestError ? (
                <Alert variant="destructive">
                  <AlertTitle>{t("platformAuth.requestFailed")}</AlertTitle>
                  <AlertDescription>{requestError}</AlertDescription>
                </Alert>
              ) : null}

              <FieldGroup>
                {isRegister ? (
                  <Field
                    data-invalid={Boolean(fieldErrors.displayName) || undefined}
                  >
                    <FieldLabel htmlFor="platform-display-name">
                      {t("platformAuth.displayName")}
                    </FieldLabel>
                    <Input
                      id="platform-display-name"
                      name="displayName"
                      autoComplete="name"
                      maxLength={80}
                      autoFocus
                      value={displayName}
                      aria-invalid={Boolean(fieldErrors.displayName)}
                      aria-describedby={
                        fieldErrors.displayName
                          ? "platform-display-name-error"
                          : undefined
                      }
                      onChange={(event) => {
                        setDisplayName(event.target.value)
                        clearFieldError("displayName")
                      }}
                    />
                    <FieldError id="platform-display-name-error">
                      {fieldErrors.displayName}
                    </FieldError>
                  </Field>
                ) : null}

                <Field data-invalid={Boolean(fieldErrors.email) || undefined}>
                  <FieldLabel htmlFor="platform-email">
                    {t("platformAuth.email")}
                  </FieldLabel>
                  <Input
                    id="platform-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    maxLength={320}
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus={!isRegister}
                    value={email}
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={
                      [
                        fieldErrors.email ? "platform-email-error" : "",
                        verificationFeedback
                          ? "platform-verification-feedback"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    onChange={(event) => {
                      setEmail(event.target.value)
                      clearFieldError("email")
                      setVerificationCode("")
                      setVerificationRequested(false)
                      setVerificationCooldownSeconds(0)
                      setVerificationFeedback("")
                      setVerificationFeedbackKind("success")
                      clearFieldError("code")
                    }}
                  />
                  <FieldError id="platform-email-error">
                    {fieldErrors.email}
                  </FieldError>
                  {hasVerificationCode ? (
                    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p
                        id="platform-verification-feedback"
                        className={
                          verificationFeedbackKind === "error"
                            ? "text-sm text-destructive"
                            : "text-sm text-muted-foreground"
                        }
                        role={
                          verificationFeedbackKind === "error"
                            ? "alert"
                            : "status"
                        }
                        aria-live="polite"
                      >
                        {verificationFeedback ||
                          t(
                            isReset
                              ? "platformAuth.passwordReset.deliveryHint"
                              : "platformAuth.verification.deliveryHint"
                          )}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        disabled={
                          submitting ||
                          sendingVerification ||
                          verificationCoolingDown
                        }
                        onClick={() => void sendVerificationCode()}
                      >
                        {sendingVerification ? (
                          <LoaderCircleIcon
                            data-icon="inline-start"
                            className="animate-spin motion-reduce:animate-none"
                            aria-hidden="true"
                          />
                        ) : verificationRequested ? (
                          <MailCheckIcon
                            data-icon="inline-start"
                            aria-hidden="true"
                          />
                        ) : (
                          <SendIcon
                            data-icon="inline-start"
                            aria-hidden="true"
                          />
                        )}
                        {sendingVerification
                          ? t("platformAuth.verification.sending")
                          : verificationCoolingDown
                            ? t("platformAuth.verification.resendCountdown", {
                                seconds: verificationCooldownSeconds,
                              })
                            : t(
                                verificationRequested
                                  ? "platformAuth.verification.resend"
                                  : "platformAuth.verification.send"
                              )}
                      </Button>
                    </div>
                  ) : null}
                </Field>

                {hasVerificationCode ? (
                  <Field data-invalid={Boolean(fieldErrors.code) || undefined}>
                    <FieldLabel htmlFor="platform-verification-code">
                      {t("platformAuth.verification.code")}
                    </FieldLabel>
                    <Input
                      id="platform-verification-code"
                      name="code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={verificationCode}
                      aria-invalid={Boolean(fieldErrors.code)}
                      aria-describedby={
                        fieldErrors.code
                          ? "platform-verification-code-error"
                          : "platform-verification-code-hint"
                      }
                      onChange={(event) => {
                        setVerificationCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6)
                        )
                        clearFieldError("code")
                      }}
                    />
                    <p
                      id="platform-verification-code-hint"
                      className="text-sm text-muted-foreground"
                    >
                      {t(
                        isReset
                          ? "platformAuth.passwordReset.codeHint"
                          : "platformAuth.verification.codeHint"
                      )}
                    </p>
                    <FieldError id="platform-verification-code-error">
                      {fieldErrors.code}
                    </FieldError>
                  </Field>
                ) : null}

                <Field
                  data-invalid={Boolean(fieldErrors.password) || undefined}
                >
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel htmlFor="platform-password">
                      {t("platformAuth.password")}
                    </FieldLabel>
                    {!isRegister && !isReset ? (
                      <NavigationLink
                        to="/account/password-reset"
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-primary"
                      >
                        <KeyRoundIcon className="size-3.5" aria-hidden="true" />
                        {t("platformAuth.forgotPassword")}
                      </NavigationLink>
                    ) : null}
                  </div>
                  <div className="relative">
                    <Input
                      id="platform-password"
                      name="password"
                      type={passwordVisible ? "text" : "password"}
                      autoComplete={
                        isRegister || isReset
                          ? "new-password"
                          : "current-password"
                      }
                      maxLength={isRegister || isReset ? 72 : undefined}
                      className="pr-10"
                      value={password}
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby={
                        fieldErrors.password
                          ? "platform-password-error"
                          : undefined
                      }
                      onChange={(event) => {
                        setPassword(event.target.value)
                        clearFieldError("password")
                        clearFieldError("confirmPassword")
                      }}
                    />
                    <button
                      type="button"
                      className="absolute top-0 right-0 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      aria-label={t(
                        passwordVisible
                          ? "platformAuth.hidePassword"
                          : "platformAuth.showPassword"
                      )}
                      aria-pressed={passwordVisible}
                      onClick={() => setPasswordVisible((visible) => !visible)}
                    >
                      {passwordVisible ? (
                        <EyeOffIcon className="size-4" aria-hidden="true" />
                      ) : (
                        <EyeIcon className="size-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  <FieldError id="platform-password-error">
                    {fieldErrors.password}
                  </FieldError>
                </Field>

                {isRegister || isReset ? (
                  <Field
                    data-invalid={
                      Boolean(fieldErrors.confirmPassword) || undefined
                    }
                  >
                    <FieldLabel htmlFor="platform-confirm-password">
                      {t("platformAuth.confirmPassword")}
                    </FieldLabel>
                    <Input
                      id="platform-confirm-password"
                      name="confirmPassword"
                      type={passwordVisible ? "text" : "password"}
                      autoComplete="new-password"
                      maxLength={72}
                      value={confirmPassword}
                      aria-invalid={Boolean(fieldErrors.confirmPassword)}
                      aria-describedby={
                        fieldErrors.confirmPassword
                          ? "platform-confirm-password-error"
                          : undefined
                      }
                      onChange={(event) => {
                        setConfirmPassword(event.target.value)
                        clearFieldError("confirmPassword")
                      }}
                    />
                    <FieldError id="platform-confirm-password-error">
                      {fieldErrors.confirmPassword}
                    </FieldError>
                  </Field>
                ) : null}
              </FieldGroup>

              <Button
                type="submit"
                size="lg"
                className="h-11 w-full"
                disabled={submitting}
              >
                {submitting ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : isRegister ? (
                  <UserPlusIcon data-icon="inline-start" aria-hidden="true" />
                ) : isReset ? (
                  <KeyRoundIcon data-icon="inline-start" aria-hidden="true" />
                ) : (
                  <LogInIcon data-icon="inline-start" aria-hidden="true" />
                )}
                {t(
                  submitting
                    ? isRegister
                      ? "platformAuth.register.submitting"
                      : isReset
                        ? "platformAuth.reset.submitting"
                        : "platformAuth.login.submitting"
                    : isRegister
                      ? "platformAuth.register.submit"
                      : isReset
                        ? "platformAuth.reset.submit"
                        : "platformAuth.login.submit"
                )}
              </Button>

              {!isReset && oauthProviders.length > 0 ? (
                <NavigationBoundary availability="web">
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />
                      <span>{t("platformAuth.oauth.continueWith")}</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {oauthProviders.map((provider) => {
                        const ProviderIcon =
                          provider.icon === "github" ? Code2Icon : Globe2Icon
                        return (
                          <NavigationLink
                            key={provider.code}
                            href={platformAuthOAuthPath(
                              `/${provider.code}/start?returnPath=${encodeURIComponent("/community/exchange/me")}`
                            )}
                            className={buttonVariants({
                              variant: "outline",
                              size: "lg",
                              className: "h-11 min-w-0 justify-center",
                            })}
                          >
                            <ProviderIcon
                              data-icon="inline-start"
                              aria-hidden="true"
                            />
                            <span className="truncate">
                              {provider.displayName}
                            </span>
                          </NavigationLink>
                        )
                      })}
                    </div>
                  </div>
                </NavigationBoundary>
              ) : null}

              <p className="text-center text-sm text-muted-foreground">
                {t(
                  isRegister
                    ? "platformAuth.register.switchPrompt"
                    : isReset
                      ? "platformAuth.reset.switchPrompt"
                      : "platformAuth.login.switchPrompt"
                )}{" "}
                <NavigationLink
                  to={
                    isRegister || isReset
                      ? "/account/login"
                      : "/account/register"
                  }
                  className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                >
                  {t(
                    isRegister
                      ? "platformAuth.register.switchAction"
                      : isReset
                        ? "platformAuth.reset.switchAction"
                        : "platformAuth.login.switchAction"
                  )}
                </NavigationLink>
              </p>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
