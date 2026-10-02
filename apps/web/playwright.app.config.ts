import { tmpdir } from "node:os"
import path from "node:path"

import { defineConfig, devices } from "@playwright/test"

import type { ApiTestOptions } from "./tests/e2e/fixtures/test"

const defaultBaseURL = "http://localhost:1420"
const defaultApiOrigin = "http://127.0.0.1:1420"
const unavailableApiOrigin = "http://127.0.0.1:65534"

function normalizeHttpOrigin(name: string, value: string) {
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    throw new Error(`${name} must be an absolute HTTP or HTTPS origin`)
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${name} must be an absolute HTTP or HTTPS origin`)
  }
  return parsed.origin
}

export function resolveAppE2EOrigins(
  environment: NodeJS.ProcessEnv = process.env
) {
  const externalBaseURL = environment.E2E_APP_BASE_URL?.trim()
  const baseURL = externalBaseURL
    ? normalizeHttpOrigin("E2E_APP_BASE_URL", externalBaseURL)
    : defaultBaseURL
  const configuredApiOrigin = environment.E2E_APP_API_ORIGIN?.trim()
  if (externalBaseURL && !configuredApiOrigin) {
    throw new Error(
      "E2E_APP_API_ORIGIN is required when E2E_APP_BASE_URL is set"
    )
  }
  const apiOrigin = normalizeHttpOrigin(
    "E2E_APP_API_ORIGIN",
    configuredApiOrigin || defaultApiOrigin
  )
  return { apiOrigin, baseURL, external: Boolean(externalBaseURL) }
}

const { apiOrigin, baseURL, external } = resolveAppE2EOrigins()

export default defineConfig<ApiTestOptions>({
  testDir: "./tests/e2e",
  testMatch: "app-*.spec.ts",
  outputDir: path.join(tmpdir(), "imsweb-app-playwright"),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  timeout: 20_000,
  retries: 0,
  workers: 1,
  reporter: "list",
  expect: {
    timeout: 5_000,
  },
  use: {
    apiOrigins: [apiOrigin],
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: external
    ? undefined
    : {
        command: "pnpm dev:app",
        env: {
          ...process.env,
          E2E_APP_API_ORIGIN: apiOrigin,
          IMS_API_ORIGIN: unavailableApiOrigin,
          IMS_APP_E2E_CROSS_ORIGIN: "1",
        },
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "app-small",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 320, height: 568 },
      },
    },
    {
      name: "app-iphone",
      grep: /@app-iphone/,
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "app-android",
      grep: /@app-android/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "app-landscape",
      grep: /@app-landscape/,
      use: {
        ...devices["iPhone 13 landscape"],
        browserName: "chromium",
        viewport: { width: 844, height: 390 },
      },
    },
    {
      name: "app-webkit",
      grep: /@app-webkit/,
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
})
