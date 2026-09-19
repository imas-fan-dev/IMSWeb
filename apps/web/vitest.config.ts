import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const projectRoot = fileURLToPath(new URL(".", import.meta.url))

// The reporter and coverage shape is written per domain on purpose. A shared
// preset would have to sit outside every workspace that could resolve and
// type-check `vitest/config`, so each domain owns its own file and the root
// panel (`vitest.config.mts`) points at them instead of restating them. The
// invariants that must not drift across domains are asserted by the repository
// reporting and project tests.
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
    reporters: process.env.CI
      ? [
          ["default", {}],
          [
            "junit",
            {
              outputFile: "reports/junit-web.xml",
              suiteName: "web",
              // CI logs already carry console output; the XML stays for
              // failure messages and stacks.
              includeConsoleOutput: false,
              addFileAttribute: true,
            },
          ],
        ]
      : ["default"],
    coverage: {
      provider: "v8",
      // Coverage belongs to the run that exercises the whole domain; a filtered
      // run (the App lane runs one Web test file) would otherwise fail every
      // threshold. Only the Web lane that owns the full suite sets this flag,
      // and `--coverage` on the command line still turns it on anywhere.
      enabled: process.env.IMS_TEST_COVERAGE_ENABLED === "true",
      reportsDirectory: "coverage",
      reporter: ["text-summary", "json-summary", "lcov"],
      // Vitest 4 counts only files a test loaded unless they are listed here,
      // so the untouched part of the app tree stays visible.
      include: ["app/**"],
      // `app/**` also matches the style sheets, JSON fixtures and SVG assets
      // under it. They carry no statements, so they only add 0-statement
      // entries to the report; the other domains exclude their non-source
      // extensions for the same reason.
      exclude: ["**/*.d.ts", "**/*.css", "**/*.json", "**/*.svg"],
      // Floored from the 2026-09-19 baseline (statements 70.5, branches 67.85,
      // functions 67.32, lines 73.43); the gate may only move up.
      thresholds: { lines: 73, branches: 67, functions: 67, statements: 70 },
    },
  },
})
