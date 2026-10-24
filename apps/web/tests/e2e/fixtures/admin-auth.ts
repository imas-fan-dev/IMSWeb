import {
  adminRefreshErrorResponseSchema,
  adminRefreshSuccessResponseSchema,
  adminSessionHttpErrorResponseSchema,
  adminSessionSchema,
  type AdminBackofficeSessionUser,
  type AdminRefreshErrorResponse,
  type AdminRefreshSuccessResponse,
  type AdminSessionHttpErrorResponse,
  type AdminSessionResponse,
} from "@imsweb/contracts/admin"
import { adminApiPath } from "@imsweb/contracts/paths"
import type { Page } from "@playwright/test"

import type { ApiDispatcher, ApiTimes } from "./api-dispatcher"

type AdminAuthCallOptions = {
  sessionTimes?: ApiTimes
  refreshTimes?: ApiTimes
}

type AuthenticatedAdminAuthMockOptions = AdminAuthCallOptions & {
  state?: "authenticated"
  user?: Partial<Omit<AdminBackofficeSessionUser, "csrfSecret">>
  csrfToken?: string
}

type AnonymousAdminAuthMockOptions = AdminAuthCallOptions & {
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
  api: ApiDispatcher,
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

    api.expect({
      name: "anonymous Backoffice session",
      method: "GET",
      path: adminApiPath("/auth/session"),
      responses: { 401: adminSessionHttpErrorResponseSchema },
      times: options.sessionTimes ?? 0,
      handle: () => ({ status: 401, json: sessionResponse }),
    })
    api.expect({
      name: "anonymous Backoffice refresh",
      method: "POST",
      path: adminApiPath("/auth/refresh"),
      responses: { 401: adminRefreshErrorResponseSchema },
      times: options.refreshTimes ?? 0,
      handle: () => ({ status: 401, json: refreshResponse }),
    })
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
  api.expect({
    name: "authenticated Backoffice session",
    method: "GET",
    path: adminApiPath("/auth/session"),
    responses: { 200: adminSessionSchema },
    times: options.sessionTimes,
    handle: () => ({ status: 200, json: sessionResponse }),
  })
  api.expect({
    name: "authenticated Backoffice refresh",
    method: "POST",
    path: adminApiPath("/auth/refresh"),
    responses: { 200: adminRefreshSuccessResponseSchema },
    times: options.refreshTimes ?? 0,
    handle: () => ({ status: 200, json: refreshResponse }),
  })
}
