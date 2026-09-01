import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Outlet, Route, Routes } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AdminSession, PlatformOAuthAdminProvider } from "~/lib/api"
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

function provider(
  code: string,
  overrides: Partial<PlatformOAuthAdminProvider> = {}
): PlatformOAuthAdminProvider {
  return {
    code,
    displayName: code,
    icon: "landmark",
    buttonColor: "#445566",
    enabled: false,
    configured: true,
    clientIdMasked: "clie...1234",
    redirectUri: `https://ims.test/api/platform/auth/oauth/${code}/callback`,
    authorizationEndpoint: "https://idp.example.com/oauth/authorize",
    tokenEndpoint: "https://idp.example.com/oauth/token",
    userInfoEndpoint: "https://idp.example.com/oauth/userinfo",
    scopes: ["openid", "profile"],
    tokenAuthMethod: "client_secret_post",
    pkceEnabled: true,
    profileSubjectPath: "sub",
    profileDisplayNamePath: "name",
    profileDisplayNameFallbackPath: "email",
    profileAvatarUrlPath: "picture",
    updatedAt: 100,
    ...overrides,
  }
}

const googleProvider = provider("google", {
  displayName: "Google",
  icon: "google",
  buttonColor: "#ffffff",
})
const customProvider = provider("custom-oidc", {
  displayName: "Custom OIDC",
})

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

function providerFetch(
  requests: Request[],
  mutation: (request: Request) => Response | Promise<Response>
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = requestFrom(input, init)
    requests.push(request.clone())
    if (request.method === "GET") {
      return Response.json({
        success: true,
        providers: [googleProvider, customProvider],
      })
    }
    return mutation(request)
  })
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

  it("renders dynamic provider icons and edits without resending an empty secret", async () => {
    document.cookie = "ims_admin_csrf=oauth-csrf; path=/"
    const requests: Request[] = []
    vi.stubGlobal(
      "fetch",
      providerFetch(requests, async (request) => {
        expect(request.method).toBe("PUT")
        return Response.json({
          success: true,
          provider: {
            ...googleProvider,
            displayName: "Google Workspace",
            enabled: true,
            updatedAt: 101,
          },
        })
      })
    )
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText("Custom OIDC")).toBeVisible()
    expect(document.querySelector('[data-provider-icon="google"]')).toBeTruthy()
    await waitFor(() => {
      expect(
        document.querySelector('[data-lucide-icon="landmark"]')
      ).toBeTruthy()
    })

    await user.click(screen.getByRole("button", { name: "编辑 Google" }))
    const dialog = screen.getByRole("dialog", { name: "编辑 Google" })
    expect(dialog).toBeVisible()
    expect(within(dialog).getByPlaceholderText("clie...1234")).toHaveValue("")
    expect(
      within(dialog).getByPlaceholderText("已保存，输入新值可替换")
    ).toHaveValue("")

    const displayName = within(dialog).getByLabelText("显示名称")
    await user.clear(displayName)
    await user.type(displayName, "Google Workspace")
    await user.type(
      within(dialog).getByLabelText("Client ID"),
      "replacement-client"
    )
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "在前端显示此登录方式",
      })
    )
    await user.click(
      within(dialog).getByRole("button", { name: "保存 OAuth 配置" })
    )

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
      icon: "google",
      buttonColor: "#ffffff",
      enabled: true,
      clientId: "replacement-client",
      redirectUri: googleProvider.redirectUri,
      authorizationEndpoint: googleProvider.authorizationEndpoint,
      tokenEndpoint: googleProvider.tokenEndpoint,
      userInfoEndpoint: googleProvider.userInfoEndpoint,
      scopes: ["openid", "profile"],
      tokenAuthMethod: "client_secret_post",
      pkceEnabled: true,
      profileSubjectPath: "sub",
      profileDisplayNamePath: "name",
      profileDisplayNameFallbackPath: "email",
      profileAvatarUrlPath: "picture",
      expectedUpdatedAt: 100,
    })
    expect(toasts.success).toHaveBeenCalledWith("Google Workspace 配置已保存")
  })

  it("creates a provider through the shared dialog", async () => {
    document.cookie = "ims_admin_csrf=oauth-csrf; path=/"
    const requests: Request[] = []
    vi.stubGlobal(
      "fetch",
      providerFetch(requests, async (request) => {
        const payload = (await request.clone().json()) as Record<
          string,
          unknown
        >
        return Response.json(
          {
            success: true,
            provider: provider(String(payload.code), {
              displayName: String(payload.displayName),
              configured: false,
              clientIdMasked: null,
              redirectUri: null,
              updatedAt: 200,
            }),
          },
          { status: 201 }
        )
      })
    )
    const user = userEvent.setup()
    renderPage()

    await screen.findByText("Custom OIDC")
    await user.click(screen.getByRole("button", { name: "添加 provider" }))
    const dialog = screen.getByRole("dialog", { name: "新增 OAuth provider" })
    await user.type(within(dialog).getByLabelText("Provider code"), "new-idp")
    await user.type(within(dialog).getByLabelText("显示名称"), "New IDP")
    await user.type(
      within(dialog).getByLabelText("Authorization endpoint"),
      "https://login.example.com/oauth/authorize"
    )
    await user.type(
      within(dialog).getByLabelText("Token endpoint"),
      "https://login.example.com/oauth/token"
    )
    await user.type(
      within(dialog).getByLabelText("UserInfo endpoint"),
      "https://login.example.com/oauth/userinfo"
    )
    await user.click(
      within(dialog).getByRole("button", { name: "添加 provider" })
    )

    const create = await waitFor(() => {
      const request = requests.find((candidate) => candidate.method === "POST")
      expect(request).toBeDefined()
      return request!
    })
    expect(new URL(create.url).pathname).toBe(
      "/api/admin/platform/auth/oauth/providers"
    )
    expect(await create.json()).toMatchObject({
      code: "new-idp",
      displayName: "New IDP",
      icon: "globe-2",
      buttonColor: "#111827",
      enabled: false,
      scopes: [],
      pkceEnabled: true,
      profileSubjectPath: "id",
      profileDisplayNamePath: "name",
    })
    expect(toasts.success).toHaveBeenCalledWith("New IDP 配置已保存")
  })

  it("deletes a provider after confirmation", async () => {
    document.cookie = "ims_admin_csrf=oauth-csrf; path=/"
    const requests: Request[] = []
    vi.stubGlobal(
      "fetch",
      providerFetch(requests, (request) => {
        expect(request.method).toBe("DELETE")
        return Response.json({ success: true, deletedCode: "custom-oidc" })
      })
    )
    const user = userEvent.setup()
    renderPage()

    await screen.findByText("Custom OIDC")
    await user.click(screen.getByRole("button", { name: "删除 Custom OIDC" }))
    const dialog = screen.getByRole("alertdialog", {
      name: "删除 OAuth provider？",
    })
    await user.click(
      within(dialog).getByRole("button", { name: "删除 provider" })
    )

    const deletion = await waitFor(() => {
      const request = requests.find(
        (candidate) => candidate.method === "DELETE"
      )
      expect(request).toBeDefined()
      return request!
    })
    expect(new URL(deletion.url).pathname).toBe(
      "/api/admin/platform/auth/oauth/custom-oidc"
    )
    expect(await deletion.json()).toEqual({ expectedUpdatedAt: 100 })
    expect(toasts.success).toHaveBeenCalledWith("Custom OIDC 已删除")
  })
})
