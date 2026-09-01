import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Outlet, Route, Routes } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AdminSession } from "~/lib/api"
import AdminPlatformOAuthPage from "~/pages/admin/platform-oauth/index"

const toasts = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: toasts,
}))

const superSession: AdminSession = {
  id: 1,
  username: "super-operator",
  producername: "Super Operator",
  dept: "op",
  adminRole: "super_admin",
}

const googleProvider = {
  code: "google" as const,
  displayName: "Google",
  icon: "google" as const,
  enabled: false,
  configured: true,
  clientIdMasked: "goog...1234",
  redirectUri: "https://ims.test/api/platform/auth/oauth/google/callback",
  updatedAt: 100,
}

const githubProvider = {
  code: "github" as const,
  displayName: "GitHub",
  icon: "github" as const,
  enabled: false,
  configured: false,
  clientIdMasked: null,
  redirectUri: null,
  updatedAt: 0,
}

function renderPage(session: AdminSession = superSession) {
  render(
    <MemoryRouter initialEntries={["/admin/platform-oauth"]}>
      <Routes>
        <Route element={<Outlet context={{ adminSession: session }} />}>
          <Route
            path="/admin/platform-oauth"
            element={<AdminPlatformOAuthPage />}
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
  document.body.removeAttribute("style")
})

describe("AdminPlatformOAuthPage", () => {
  it("blocks regular administrators before loading provider credentials", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    renderPage({ ...superSession, id: 2, adminRole: "admin" })

    expect(screen.getByText("仅最高管理员可访问")).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("edits a provider in the shared dialog without resending an empty secret", async () => {
    document.cookie = "ims_admin_csrf=oauth-csrf; path=/"
    const requests: Request[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init)
        requests.push(request.clone())
        if (request.method === "GET") {
          return Response.json({
            success: true,
            providers: [googleProvider, githubProvider],
          })
        }
        if (request.method === "PUT") {
          return Response.json({
            success: true,
            provider: {
              ...googleProvider,
              displayName: "Google Workspace",
              enabled: true,
              updatedAt: 101,
            },
          })
        }
        throw new Error(`Unexpected request: ${request.method} ${request.url}`)
      })
    )
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText("Google、GitHub")).toBeVisible()
    expect(screen.queryByRole("button", { name: /新增|删除/ })).toBeNull()
    expect(
      document.querySelector('[data-provider-icon="google"]')
    ).toBeInTheDocument()
    expect(
      document.querySelector('[data-provider-icon="github"]')
    ).toBeInTheDocument()

    await user.click(
      (await screen.findAllByRole("button", { name: "编辑配置" }))[0]!
    )
    expect(screen.getByRole("dialog", { name: "配置 Google" })).toBeVisible()
    expect(
      screen
        .getByRole("dialog", { name: "配置 Google" })
        .querySelector('[data-provider-icon="google"]')
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText("goog...1234")).toHaveValue("")
    expect(screen.getByPlaceholderText("已保存，输入新值可替换")).toHaveValue(
      ""
    )

    const displayName = screen.getByLabelText("显示名称")
    await user.clear(displayName)
    await user.type(displayName, "Google Workspace")
    await user.type(screen.getByLabelText("Client ID"), "replacement-client")
    await user.click(
      screen.getByRole("checkbox", {
        name: "允许用户使用此 provider 登录",
      })
    )
    await user.click(screen.getByRole("button", { name: "保存 OAuth 配置" }))

    const update = await waitFor(() => {
      const request = requests.find((candidate) => candidate.method === "PUT")
      expect(request).toBeDefined()
      return request!
    })
    expect(new URL(update.url).pathname).toBe(
      "/api/admin/platform/auth/oauth/google"
    )
    expect(await update.json()).toEqual({
      displayName: "Google Workspace",
      enabled: true,
      expectedUpdatedAt: 100,
      clientId: "replacement-client",
    })
    expect(toasts.success).toHaveBeenCalledWith("Google Workspace 配置已保存")
  })
})
