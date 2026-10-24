import { tmpdir } from "node:os"
import path from "node:path"

import { defineConfig, devices } from "@playwright/test"

import type { ApiTestOptions } from "./tests/e2e/fixtures/test"

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173"
const unavailableApiOrigin = "http://127.0.0.1:65534"

export function resolveWebE2EWebServer(
  environment: NodeJS.ProcessEnv = process.env
) {
  if (environment.E2E_BASE_URL) return undefined
  return {
    command: environment.CI
      ? "pnpm preview"
      : "pnpm dev --host 127.0.0.1 --port 4173",
    env: { ...environment, IMS_API_ORIGIN: unavailableApiOrigin },
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !environment.CI,
    timeout: 120_000,
  }
}

export function resolveWebUiProjects(tier = process.env.E2E_UI_TIER ?? "core") {
  if (!["core", "extended", "all"].includes(tier)) {
    throw new Error("E2E_UI_TIER must be core, extended, or all")
  }
  const extended = /@extended/
  return [
    {
      name: "chromium-desktop",
      ...(tier === "core" ? { grepInvert: extended } : {}),
      ...(tier === "extended" ? { grep: extended } : {}),
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-mobile",
      grep: tier === "extended" ? /(?=.*@mobile)(?=.*@extended)/ : /@mobile/,
      ...(tier === "core" ? { grepInvert: extended } : {}),
      use: { ...devices["Pixel 7"] },
    },
    ...(tier === "core"
      ? []
      : [
          {
            name: "firefox-desktop",
            grep: /@firefox/,
            use: { ...devices["Desktop Firefox"] },
          },
        ]),
  ]
}

export default defineConfig<ApiTestOptions>({
  testDir: "./tests/e2e",
  testIgnore: "app-*.spec.ts",
  outputDir: path.join(tmpdir(), "imsweb-web-playwright"),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  timeout: 20_000,
  retries: 0,
  workers: 1,
  reporter: "list",
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: resolveWebE2EWebServer(),
  projects: resolveWebUiProjects(),
})
