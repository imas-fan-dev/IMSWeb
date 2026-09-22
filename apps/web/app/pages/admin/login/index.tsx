import {
  ArrowLeftIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  LogInIcon,
  UserIcon,
} from "lucide-react"
import { useState } from "react"

import { SeriesAccentStrip } from "~/components/shared/series-accent-strip"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { BrandWordmark } from "~/components/shared/brand-wordmark"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { AdminField, adminControlClass } from "~/components/admin/admin-ui"
import { isApiError, loginAdmin } from "~/lib/api"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { useNavigation } from "~/lib/navigation/use-navigation"

export function meta() {
  return [{ title: "管理登录 | IMSWeb" }]
}

export default function AdminLogin() {
  const navigate = useNavigation()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError("")
    try {
      await loginAdmin(username, password).send()
      void navigate("/admin", { replace: true })
    } catch (loginError) {
      setError(isApiError(loginError) ? loginError.message : "登录失败")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[minmax(24rem,0.84fr)_minmax(32rem,1.16fr)]">
      <section className="relative flex min-h-80 overflow-hidden border-b bg-admin-ink px-6 py-7 text-admin-ink-foreground sm:p-10 lg:min-h-svh lg:border-r lg:border-b-0 lg:px-14 lg:py-12 xl:px-18">
        <SeriesAccentStrip
          className="absolute inset-y-0 left-0 w-1"
          orientation="vertical"
        />

        <div className="mx-auto flex w-full max-w-lg flex-col">
          <div className="flex items-start justify-between gap-6">
            <NavigationLink
              to="/"
              className="rounded-md focus-visible:ring-3 focus-visible:ring-admin-ink-foreground/50 focus-visible:outline-none"
              aria-label="返回 IMSWeb 首页"
            >
              <BrandWordmark className="h-14 sm:h-16" />
            </NavigationLink>
            <NavigationLink
              to="/"
              className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-admin-ink-foreground/15 px-3 text-xs font-medium text-admin-ink-subtle transition-colors hover:border-admin-ink-foreground/30 hover:bg-admin-ink-muted hover:text-admin-ink-foreground focus-visible:ring-3 focus-visible:ring-admin-ink-foreground/50 focus-visible:outline-none"
            >
              <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
              返回站点
            </NavigationLink>
          </div>

          <div className="my-auto py-12 sm:py-16 lg:py-20">
            <div className="mb-7 flex items-center gap-3" aria-hidden="true">
              <span className="h-px w-10 bg-primary" />
              <span className="size-1.5 bg-primary" />
            </div>
            <p className="text-xs font-semibold text-admin-ink-subtle">
              IMSWEB / OPERATIONS
            </p>
            <h1 className="mt-4 max-w-md text-4xl leading-[1.16] font-semibold text-balance sm:text-5xl">
              内容管理工作台
            </h1>
            <p className="mt-5 max-w-sm text-sm/6 text-admin-ink-subtle sm:text-base/7">
              管理站点内容，维护面向制作人社区的公开信息。
            </p>
          </div>

          <div className="flex items-center justify-between border-t border-admin-ink-foreground/15 pt-5 text-xs text-admin-ink-subtle">
            <span>IMSWeb content desk</span>
            <span>Restricted access</span>
          </div>
        </div>
      </section>

      <section className="flex items-center px-6 py-12 sm:px-10 lg:px-16 xl:px-24">
        <form
          className="mx-auto flex w-full max-w-md flex-col gap-6"
          onSubmit={submit}
          aria-describedby="admin-login-description"
        >
          <div>
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
                <LockKeyholeIcon className="size-5" aria-hidden="true" />
              </span>
              <p className="text-xs font-semibold text-primary">
                MANAGEMENT CONSOLE
              </p>
            </div>
            <h2 className="mt-6 text-3xl font-semibold">管理登录</h2>
            <p
              id="admin-login-description"
              className="mt-2 text-sm/6 text-muted-foreground"
            >
              使用具有内容运营权限的站点账号登录。
            </p>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>登录未完成</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <AdminField label="用户名" htmlFor="admin-username">
            <div className="relative">
              <UserIcon
                className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="admin-username"
                name="username"
                autoComplete="username"
                className={cn(adminControlClass, "h-11 pl-10")}
                required
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
          </AdminField>

          <AdminField label="密码" htmlFor="admin-password">
            <div className="relative">
              <LockKeyholeIcon
                className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="admin-password"
                name="password"
                type={passwordVisible ? "text" : "password"}
                autoComplete="current-password"
                className={cn(adminControlClass, "h-11 px-10")}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="absolute top-1 right-1 flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
                aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
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
          </AdminField>

          <Button
            type="submit"
            size="lg"
            className="mt-1 h-11 w-full"
            disabled={submitting}
          >
            {submitting ? (
              <LoaderCircleIcon
                data-icon="inline-start"
                className="animate-spin"
              />
            ) : (
              <LogInIcon data-icon="inline-start" />
            )}
            {submitting ? "正在登录" : "登录工作台"}
          </Button>
        </form>
      </section>
    </main>
  )
}
