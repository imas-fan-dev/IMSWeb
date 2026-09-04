import { tmpdir } from "node:os"
import path from "node:path"

import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.E2E_APP_BASE_URL ?? "http://localhost:1420"

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "app-*.spec.ts",
  outputDir: path.join(tmpdir(), "imsweb-app-playwright"),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  timeout: 20_000,
  retries: process.env.CI ? 2 : 0,
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
  webServer: process.env.E2E_APP_BASE_URL
    ? undefined
    : {
        command: "pnpm dev:app",
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
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "app-android",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "app-landscape",
      use: {
        ...devices["iPhone 13 landscape"],
        browserName: "chromium",
        viewport: { width: 844, height: 390 },
      },
    },
    {
      name: "app-webkit",
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
})
