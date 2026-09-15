import { tmpdir } from "node:os"
import path from "node:path"

import { defineConfig, devices } from "@playwright/test"

import type { ApiTestOptions } from "./tests/e2e/fixtures/test"

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173"
const unavailableApiOrigin = "http://127.0.0.1:65534"

export default defineConfig<ApiTestOptions>({
  testDir: "./tests/e2e",
  testIgnore: "app-*.spec.ts",
  outputDir: path.join(tmpdir(), "imsweb-web-playwright"),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  timeout: 20_000,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev --host 127.0.0.1 --port 4173",
        env: {
          ...process.env,
          IMS_API_ORIGIN: unavailableApiOrigin,
        },
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-mobile",
      grep: /@mobile/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "firefox-desktop",
      grep: /@firefox/,
      use: { ...devices["Desktop Firefox"] },
    },
  ],
})
