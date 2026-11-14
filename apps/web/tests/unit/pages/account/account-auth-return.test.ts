import { describe, expect, it } from "vitest"
import {
  accountAuthPath,
  accountReturnTo,
} from "~/pages/account/account-auth-return"

describe("account authentication return", () => {
  const destination =
    "/account/me/offices?create=selected-point&filter=a%20b#editor"

  it("preserves the workspace path, query and hash through each auth page", () => {
    expect(accountReturnTo(destination)).toBe(destination)
    for (const page of ["login", "register", "password-reset"] as const) {
      const url = new URL(
        accountAuthPath(page, destination),
        "https://site.example"
      )
      expect(url.pathname).toBe(`/account/${page}`)
      expect(url.searchParams.get("returnTo")).toBe(destination)
    }
    const completedReset = new URL(
      accountAuthPath("login", destination, { reset: true }),
      "https://site.example"
    )
    expect(completedReset.searchParams.get("returnTo")).toBe(destination)
    expect(completedReset.searchParams.get("reset")).toBe("success")
  })

  it.each([
    "https://evil.example/account/me",
    "//evil.example/account/me",
    "/\\evil.example/account/me",
    "/account/me\n",
    "/account/me\u0000",
    "/account/login",
    "/account/register",
    "/account/password-reset",
    "/account/me/../login",
    "/account/me/%2e%2e/login",
    "/admin",
    "/api/platform/auth/login",
    "/account/me" + "?x=" + "a".repeat(2048),
  ])("rejects unsafe or non-workspace destinations: %s", (value) => {
    expect(accountReturnTo(value)).toBeNull()
    expect(accountAuthPath("login", value)).toBe("/account/login")
  })

  it("keeps ordinary login destinations and supports account security", () => {
    expect(accountAuthPath("login")).toBe("/account/login")
    expect(accountReturnTo(null)).toBeNull()
    expect(accountReturnTo("/account/security#sessions")).toBe(
      "/account/security#sessions"
    )
  })
})
