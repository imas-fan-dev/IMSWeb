import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { seriesWallItems } from "~/lib/series-wall"

const seriesColors = [
  { token: "franchise-765", value: "#f34e6c" }, // gitleaks:allow -- public brand color
  { token: "franchise-cg", value: "#2581c7" },
  { token: "franchise-ml", value: "#ffc20b" },
  { token: "franchise-sidem", value: "#11be93" },
  { token: "franchise-sc", value: "#8dbaff" },
  { token: "franchise-gk", value: "#f39800" },
] as const

describe("series colors", () => {
  it("keeps every shared series reference in homepage order", () => {
    expect(seriesWallItems.map((series) => series.background)).toEqual(
      seriesColors.map(({ token }) => `bg-${token}`)
    )
  })

  it("keeps the global tokens and design reference on the exact wall colors", () => {
    const stylesheet = readFileSync(
      resolve(process.cwd(), "app/app.css"),
      "utf8"
    )
    const designReference = readFileSync(
      resolve(process.cwd(), "DESIGN.md"),
      "utf8"
    )

    for (const { token, value } of seriesColors) {
      expect(stylesheet).toContain(`--${token}: ${value};`)
      expect(designReference).toContain(
        `series-${token.replace("franchise-", "")}: "${value}"`
      )
    }
  })
})
