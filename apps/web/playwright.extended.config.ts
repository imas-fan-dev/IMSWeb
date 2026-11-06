import { tmpdir } from "node:os"
import path from "node:path"
import { defineConfig } from "@playwright/test"

import config, { resolveWebUiProjects } from "./playwright.config"

export default defineConfig({
  ...config,
  projects: resolveWebUiProjects("extended"),
  outputDir: path.join(tmpdir(), "imsweb-web-playwright-extended"),
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: path.join(
          tmpdir(),
          "imsweb-web-playwright-extended",
          "results.json"
        ),
      },
    ],
  ],
})
