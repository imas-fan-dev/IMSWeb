import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Outlet, Route, Routes } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { installFetchMock, requestFrom } from "@/tests/unit/support/api-client"
import {
  clearCsrfCookie,
  setCsrfCookie,
} from "@/tests/unit/support/auth-cookies"
import type { AdminSession } from "~/lib/api"
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

const settings = {
  enabled: false,
  configured: true,
  host: "smtp.qiye.163.com",
  port: 465,
  security: "tls" as const,
  usernameMasked: "ma***@texasoct.tech",
  passwordConfigured: true,
  fromAddress: "mail@texasoct.tech",
  fromName: "IMSWeb",
  resendCooldownSeconds: 60,
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

afterEach(() => {
  vi.clearAllMocks()
  clearCsrfCookie("backoffice")
})

describe("AdminPlatformEmailPage", () => {
  it("blocks regular administrators before loading SMTP credentials", () => {
    const fetchMock = installFetchMock()

    renderPage({ ...superSession, id: 2, adminRole: "admin" })

    expect(screen.getByText("仅最高管理员可访问")).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("preserves stored credentials while enabling SMTP", async () => {
    setCsrfCookie("backoffice", "email-csrf")
    const requests: Request[] = []
    installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = requestFrom(input, init)
      requests.push(request.clone())
      if (request.method === "GET") {
        return Response.json({ success: true, settings })
      }
      return Response.json({
        success: true,
        settings: {
          ...settings,
          enabled: true,
          resendCooldownSeconds: 30,
          updatedAt: 1001,
        },
      })
    })
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByDisplayValue("smtp.qiye.163.com")).toBeVisible()
    expect(screen.getByText("当前：ma***@texasoct.tech")).toBeVisible()
    expect(screen.getByText("当前密码已加密保存")).toBeVisible()
    await user.click(screen.getByRole("checkbox", { name: /启用 SMTP 发件/ }))
    const resendCooldown = screen.getByRole("spinbutton", {
      name: "验证码重发间隔（秒）",
    })
    await user.clear(resendCooldown)
    await user.type(resendCooldown, "30")
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
      resendCooldownSeconds: 30,
      expectedUpdatedAt: 1000,
    })
    expect(resendCooldown).toHaveValue(30)
    expect(toasts.success).toHaveBeenCalledWith("SMTP 已启用")
  })

  it("enforces the resend cooldown bounds in the draft", async () => {
    installFetchMock(async () => Response.json({ success: true, settings }))
    const user = userEvent.setup()

    renderPage()

    const resendCooldown = await screen.findByRole("spinbutton", {
      name: "验证码重发间隔（秒）",
    })
    expect(resendCooldown).toHaveValue(60)
    expect(resendCooldown).toHaveAttribute("min", "30")
    expect(resendCooldown).toHaveAttribute("max", "600")
    expect(resendCooldown).toHaveAttribute("step", "1")
    await waitFor(() => expect(resendCooldown).toBeEnabled())

    for (const value of ["29", "30.5", "601"]) {
      const currentInput = screen.getByRole("spinbutton", {
        name: "验证码重发间隔（秒）",
      })
      await user.clear(currentInput)
      await user.type(currentInput, value)
      expect(screen.getByRole("button", { name: "保存配置" })).toBeDisabled()
    }
    for (const value of ["30", "600"]) {
      const currentInput = screen.getByRole("spinbutton", {
        name: "验证码重发间隔（秒）",
      })
      await user.clear(currentInput)
      await user.type(currentInput, value)
      expect(screen.getByRole("button", { name: "保存配置" })).toBeEnabled()
    }
  })

  it("refreshes a conflicting revision and retains stored credentials", async () => {
    setCsrfCookie("backoffice", "email-csrf")
    const refreshedSettings = {
      ...settings,
      resendCooldownSeconds: 30,
      updatedAt: 1001,
    }
    let getRequests = 0
    installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = requestFrom(input, init)
      if (request.method === "GET") {
        getRequests += 1
        return Response.json({
          success: true,
          settings: getRequests === 1 ? settings : refreshedSettings,
        })
      }
      return Response.json(
        {
          success: false,
          code: "REVISION_CONFLICT",
          settings: refreshedSettings,
        },
        { status: 409 }
      )
    })
    const user = userEvent.setup()

    renderPage()

    const resendCooldown = await screen.findByRole("spinbutton", {
      name: "验证码重发间隔（秒）",
    })
    await waitFor(() => expect(resendCooldown).toBeEnabled())
    await user.clear(resendCooldown)
    await user.type(resendCooldown, "600")
    await user.click(screen.getByRole("button", { name: "保存配置" }))

    await waitFor(() => expect(getRequests).toBe(2))
    expect(resendCooldown).toHaveValue(30)
    expect(screen.getByText("当前：ma***@texasoct.tech")).toBeVisible()
    expect(screen.getByText("当前密码已加密保存")).toBeVisible()
    expect(toasts.error).toHaveBeenCalledTimes(1)
  })

  it("sends a test message with the unsaved form configuration", async () => {
    setCsrfCookie("backoffice", "email-csrf")
    const requests: Request[] = []
    installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
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
    const user = userEvent.setup()

    renderPage()

    await screen.findByDisplayValue("smtp.qiye.163.com")
    const resendCooldown = screen.getByRole("spinbutton", {
      name: "验证码重发间隔（秒）",
    })
    await user.clear(resendCooldown)
    await user.type(resendCooldown, "600")
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
      resendCooldownSeconds: 600,
      expectedUpdatedAt: 1000,
    })
    expect(toasts.success).toHaveBeenCalledWith(
      "测试邮件已发送至 admin@example.com"
    )
  })
})
