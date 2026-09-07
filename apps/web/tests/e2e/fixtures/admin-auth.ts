import type {
  AdminBackofficeSessionUser,
  AdminRefreshErrorResponse,
  AdminRefreshSuccessResponse,
  AdminSessionHttpErrorResponse,
  AdminSessionResponse,
} from "@imsweb/contracts/admin"
import type { Page } from "@playwright/test"

type AuthenticatedAdminAuthMockOptions = {
  state?: "authenticated"
  user?: Partial<Omit<AdminBackofficeSessionUser, "csrfSecret">>
  csrfToken?: string
}

type AnonymousAdminAuthMockOptions = {
  state: "anonymous"
  reason?: "未登录" | "token无效"
}

export type AdminAuthMockOptions =
  | AuthenticatedAdminAuthMockOptions
  | AnonymousAdminAuthMockOptions

const defaultAdminUser = {
  id: 1,
  username: "e2e-admin",
  producername: "E2E Admin",
  dept: "op",
  adminRole: "admin",
} satisfies Omit<AdminBackofficeSessionUser, "csrfSecret">

const adminAuthOrigin = () =>
  new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173").origin

export async function installAdminAuthMock(
  page: Page,
  options: AdminAuthMockOptions = {}
) {
  if (options.state === "anonymous") {
    const sessionResponse = {
      success: false,
      message: options.reason ?? "未登录",
    } satisfies AdminSessionHttpErrorResponse
    const refreshResponse = {
      success: false,
      message: "刷新令牌无效",
    } satisfies AdminRefreshErrorResponse

    await page.route(
      (url) => url.pathname === "/api/admin/auth/session",
      (route) => route.fulfill({ status: 401, json: sessionResponse })
    )
    await page.route(
      (url) => url.pathname === "/api/admin/auth/refresh",
      (route) => route.fulfill({ status: 401, json: refreshResponse })
    )
    return
  }

  const csrfToken = options.csrfToken ?? "admin-e2e-csrf"
  const user = {
    ...defaultAdminUser,
    ...options.user,
    csrfSecret: csrfToken,
  } satisfies AdminBackofficeSessionUser
  const sessionResponse = {
    success: true,
    user,
  } satisfies AdminSessionResponse
  const refreshResponse = {
    success: true,
    user: {
      id: user.id,
      username: user.username,
      producername: user.producername,
      dept: user.dept,
      adminRole: user.adminRole ?? null,
    },
  } satisfies AdminRefreshSuccessResponse

  await page.context().addCookies([
    {
      name: "ims_admin_csrf",
      value: csrfToken,
      url: adminAuthOrigin(),
    },
  ])
  await page.route(
    (url) => url.pathname === "/api/admin/auth/session",
    (route) => route.fulfill({ status: 200, json: sessionResponse })
  )
  await page.route(
    (url) => url.pathname === "/api/admin/auth/refresh",
    (route) => route.fulfill({ status: 200, json: refreshResponse })
  )
}
