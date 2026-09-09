// @vitest-environment node

import { describe, expect, it } from "vitest"

import playwrightConfig from "../../playwright.config"

describe("Playwright browser projects", () => {
  it("forces software WebGL for Firefox MapLibre coverage", () => {
    const firefox = playwrightConfig.projects?.find(
      (project) => project.name === "firefox-desktop"
    )

    expect(firefox?.use?.launchOptions?.firefoxUserPrefs).toMatchObject({
      "gfx.webrender.software": true,
      "webgl.force-enabled": true,
    })
  })
})
