import { describe, expect, it } from "vitest"

import core, {
  resolveWebE2EWebServer,
  resolveWebUiProjects,
} from "@/playwright.config"
import extended from "@/playwright.extended.config"

describe("Web UI selection", () => {
  it("uses compiled CI preview and preserves local dev and the API trap", () => {
    const ci = resolveWebE2EWebServer({ CI: "1" })!
    expect(ci.command).toBe("pnpm preview")
    expect(ci.reuseExistingServer).toBe(false)
    expect(ci.env.IMS_API_ORIGIN).toBe("http://127.0.0.1:65534")
    expect(resolveWebE2EWebServer({})?.command).toContain("pnpm dev")
    expect(
      resolveWebE2EWebServer({ E2E_BASE_URL: "http://localhost:5000" })
    ).toBeUndefined()
  })
  it("partitions every project case between core and extended", () => {
    const all = resolveWebUiProjects("all")
    const projects = [
      resolveWebUiProjects("core"),
      resolveWebUiProjects("extended"),
    ]
    const matches = (project: (typeof all)[number], title: string) =>
      (!project.grep || project.grep.test(title)) &&
      (!project.grepInvert || !project.grepInvert.test(title))
    for (const project of all) {
      for (const title of [
        "workflow",
        "workflow @mobile",
        "layout @extended",
        "layout @mobile @extended",
        "workflow @firefox",
        "layout @mobile @firefox @extended",
      ]) {
        const selected = projects
          .flat()
          .filter(
            (candidate) =>
              candidate.name === project.name && matches(candidate, title)
          )
        expect(selected.length, `${project.name}: ${title}`).toBe(
          matches(project, title) ? 1 : 0
        )
      }
    }
  })

  it("rejects unknown tiers and preserves browser budgets", () => {
    expect(() => resolveWebUiProjects("typo")).toThrow("E2E_UI_TIER")
    for (const config of [core, extended]) {
      expect(config.workers).toBe(1)
      expect(config.retries).toBe(0)
      expect(config.timeout).toBe(20_000)
      expect(config.expect?.timeout).toBe(5_000)
    }
    expect(core.outputDir).not.toBe(extended.outputDir)
  })
})
