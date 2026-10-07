import { describe, expect, it } from "vitest"

import config, {
  resolveAppE2EOrigins,
  resolveAppE2EWebServer,
} from "@/playwright.app.config"

describe("App Playwright origin configuration", () => {
  it("keeps local development on the owned dev server", () => {
    const server = resolveAppE2EWebServer({})
    expect(server?.command).toBe("pnpm dev:app")
    expect(server?.reuseExistingServer).toBe(true)
  })

  it("uses the compiled App preview in CI without increasing test budgets", () => {
    const server = resolveAppE2EWebServer({ CI: "1" })
    expect(server?.command).toBe("pnpm preview:app")
    expect(server?.reuseExistingServer).toBe(false)
    expect(server?.url).toBe("http://localhost:1420")
    expect(server?.env.E2E_APP_API_ORIGIN).toBe("http://127.0.0.1:1420")
    expect(server?.env.IMS_API_ORIGIN).toBe("http://127.0.0.1:65534")
    expect(server?.env.IMS_PUBLIC_SITE_ORIGIN).toBe("http://127.0.0.1:65534")
    expect(config.timeout).toBe(20_000)
    expect(config.expect?.timeout).toBe(5_000)
    expect(config.retries).toBe(0)
  })

  it("does not start an owned server for an external App in CI", () => {
    expect(
      resolveAppE2EWebServer({
        CI: "1",
        E2E_APP_BASE_URL: "https://app.example.test",
        E2E_APP_API_ORIGIN: "https://api.example.test",
      })
    ).toBeUndefined()
  })

  it("uses the local cross-origin API default", () => {
    expect(resolveAppE2EOrigins({})).toEqual({
      apiOrigin: "http://127.0.0.1:1420",
      baseURL: "http://localhost:1420",
      external: false,
    })
  })

  it("requires an explicit API origin for an external App", () => {
    expect(() =>
      resolveAppE2EOrigins({
        E2E_APP_BASE_URL: "https://app.example.test",
      })
    ).toThrow("E2E_APP_API_ORIGIN is required when E2E_APP_BASE_URL is set")
  })

  it("keeps external App and API origins distinct", () => {
    expect(
      resolveAppE2EOrigins({
        E2E_APP_BASE_URL: "https://app.example.test",
        E2E_APP_API_ORIGIN: "https://api.example.test/",
      })
    ).toEqual({
      apiOrigin: "https://api.example.test",
      baseURL: "https://app.example.test",
      external: true,
    })
  })

  it.each([
    "ftp://api.example.test",
    "https://user@example.test",
    "https://api.example.test/path",
    "https://api.example.test?query=1",
    "https://api.example.test#fragment",
    "not an origin",
  ])("rejects malformed API origin %s", (apiOrigin) => {
    expect(() =>
      resolveAppE2EOrigins({ E2E_APP_API_ORIGIN: apiOrigin })
    ).toThrow("E2E_APP_API_ORIGIN must be an absolute HTTP or HTTPS origin")
  })

  it.each([
    "ftp://app.example.test",
    "https://user@app.example.test",
    "https://app.example.test/path",
    "https://app.example.test?query=1",
    "https://app.example.test#fragment",
    "not an origin",
  ])("rejects malformed external App origin %s", (baseURL) => {
    expect(() =>
      resolveAppE2EOrigins({
        E2E_APP_BASE_URL: baseURL,
        E2E_APP_API_ORIGIN: "https://api.example.test",
      })
    ).toThrow("E2E_APP_BASE_URL must be an absolute HTTP or HTTPS origin")
  })
})
