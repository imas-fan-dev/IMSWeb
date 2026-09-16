import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const projectRoot = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // `~` is app source; `@` is the workspace root, which is how a test
      // reaches `mocks/` and `tests/` without climbing `../../../../`.
      "~": path.resolve(projectRoot, "app"),
      "@": projectRoot,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    maxWorkers: process.env.CI ? 2 : 4,
  },
})
