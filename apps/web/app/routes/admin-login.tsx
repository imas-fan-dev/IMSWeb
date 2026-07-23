import {
  LoaderCircleIcon,
  LockKeyholeIcon,
  LogInIcon,
  UserIcon,
} from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { loginAdmin } from "~/features/admin/api"
import { AdminField, adminControlClass } from "~/features/admin/admin-ui"
import { isApiError } from "~/shared/api"

export function meta() {
  return [{ title: "管理登录 | IMSWeb" }]
}

export default function AdminLogin() {
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError("")
    try {
      const session = await loginAdmin(username, password).send()
      if (session.dept !== "op") {
        setError("当前账号没有管理工作台权限")
        return
      }
      void navigate("/admin", { replace: true })
    } catch (loginError) {
      setError(isApiError(loginError) ? loginError.message : "登录失败")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[minmax(20rem,0.72fr)_minmax(0,1.28fr)]">
      <section className="flex items-center border-b bg-neutral-950 px-6 py-12 text-white lg:border-r lg:border-b-0 lg:px-12">
        <div className="mx-auto w-full max-w-md lg:mx-0">
          <Link to="/" aria-label="返回 IMSWeb 首页">
            <img
              src="/brand/imsweb-logo.png"
              width="545"
              height="188"
              alt="偶像大师交流站"
              className="h-12 w-auto max-w-full object-contain brightness-0 invert"
            />
          </Link>
          <p className="mt-10 text-xs font-semibold text-white/60">
            IMSWEB OPERATIONS
          </p>
          <h1 className="mt-3 text-3xl font-semibold">内容管理工作台</h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">
            活动、推荐、剧情与活动纪年的统一管理入口。
          </p>
        </div>
      </section>

      <section className="flex items-center px-6 py-12 sm:px-10 lg:px-16">
        <form
          className="mx-auto flex w-full max-w-md flex-col gap-6"
          onSubmit={submit}
        >
          <div>
            <span className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <LockKeyholeIcon className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-2xl font-semibold">管理登录</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              使用具有 op 权限的站点账号登录。
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
                className={`${adminControlClass} pl-9`}
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
          </AdminField>

          <AdminField label="密码" htmlFor="admin-password">
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              className={adminControlClass}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </AdminField>

          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? (
              <LoaderCircleIcon
                data-icon="inline-start"
                className="animate-spin"
              />
            ) : (
              <LogInIcon data-icon="inline-start" />
            )}
            登录工作台
          </Button>
        </form>
      </section>
    </main>
  )
}
