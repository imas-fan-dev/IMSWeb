import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Outlet, Route, Routes } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AdminPlatformEmailSettings, AdminSession } from "~/lib/api"
import AdminPlatformEmailPage from "~/pages/admin/platform-email/index"

const toasts = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: toasts,
}))

const superSession: AdminSession = {
  id: 1,
  username: "admin",
  producername: "Preview Admin",
  dept: "op",
  adminRole: "super_admin",
}

const settings: AdminPlatformEmailSettings = {
  enabled: false,
  configured: true,
  host: "smtp.qiye.163.com",
  port: 465,
  security: "tls",
  usernameMasked: "ma***@texasoct.tech",
  passwordConfigured: true,
  fromAddress: "mail@texasoct.tech",
  fromName: "IMSWeb",
  updatedAt: 1000,
}

function renderPage(session: AdminSession = superSession) {
  render(
    <MemoryRouter initialEntries={["/admin/platform/email"]}>
      <Routes>
        <Route element={<Outlet context={{ adminSession: session }} />}>
          <Route
            path="/admin/platform/email"
            element={<AdminPlatformEmailPage />}
          />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

function requestFrom(input: RequestInfo | URL, init?: RequestInit) {
  return input instanceof Request
    ? input
    : new Request(new URL(String(input), "http://ims.test"), init)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  document.cookie = "ims_admin_csrf=; Max-Age=0; path=/"
})

describe("AdminPlatformEmailPage", () => {
  it("blocks regular administrators before loading SMTP credentials", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    renderPage({ ...superSession, id: 2, adminRole: "admin" })

    expect(screen.getByText("仅最高管理员可访问")).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("preserves stored credentials while enabling SMTP", async () => {
    document.cookie = "ims_admin_csrf=email-csrf; path=/"
    const requests: Request[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init)
        requests.push(request.clone())
        if (request.method === "GET") {
          return Response.json({ success: true, settings })
        }
        return Response.json({
          success: true,
          settings: { ...settings, enabled: true, updatedAt: 1001 },
        })
      })
    )
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByDisplayValue("smtp.qiye.163.com")).toBeVisible()
    expect(screen.getByText("当前：ma***@texasoct.tech")).toBeVisible()
    expect(screen.getByText("当前密码已加密保存")).toBeVisible()
    await user.click(screen.getByRole("checkbox", { name: /启用 SMTP 发件/ }))
    await user.click(screen.getByRole("button", { name: "保存配置" }))

    const update = await waitFor(() => {
      const request = requests.find((candidate) => candidate.method === "PUT")
      expect(request).toBeDefined()
      return request!
    })
    expect(new URL(update.url).pathname).toBe("/api/admin/platform/email")
    expect(await update.json()).toEqual({
      enabled: true,
      host: "smtp.qiye.163.com",
      port: 465,
      security: "tls",
      fromAddress: "mail@texasoct.tech",
      fromName: "IMSWeb",
      expectedUpdatedAt: 1000,
    })
    expect(toasts.success).toHaveBeenCalledWith("SMTP 已启用")
  })

  it("sends a test message with the unsaved form configuration", async () => {
    document.cookie = "ims_admin_csrf=email-csrf; path=/"
    const requests: Request[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init)
        requests.push(request.clone())
        if (request.method === "GET") {
          return Response.json({ success: true, settings })
        }
        return Response.json({
          success: true,
          deliveredTo: "admin@example.com",
        })
      })
    )
    const user = userEvent.setup()

    renderPage()

    await screen.findByDisplayValue("smtp.qiye.163.com")
    await user.type(screen.getByLabelText("测试收件人"), "admin@example.com")
    await user.click(screen.getByRole("button", { name: "发送测试邮件" }))

    const testRequest = await waitFor(() => {
      const request = requests.find(
        (candidate) =>
          candidate.method === "POST" &&
          new URL(candidate.url).pathname.endsWith("/test")
      )
      expect(request).toBeDefined()
      return request!
    })
    expect(await testRequest.json()).toMatchObject({
      recipient: "admin@example.com",
      host: "smtp.qiye.163.com",
      expectedUpdatedAt: 1000,
    })
    expect(toasts.success).toHaveBeenCalledWith(
      "测试邮件已发送至 admin@example.com"
    )
  })
})
