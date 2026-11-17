import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderPage } from "@/tests/unit/support/harness"
import { ExchangeMapAttributionDialog } from "~/pages/community/exchange/components/exchange-map-attribution-dialog"
import { parseMapAttribution } from "~/pages/community/exchange/maps/exchange-map-attribution"

describe("ExchangeMapAttributionDialog", () => {
  it.each([false, true])(
    "keeps complete safe sources with iOS presentation %s",
    (iosMapPresentation) => {
      const notice = '<a href="javascript:alert(1)">Search provider</a>'
      renderPage(
        <ExchangeMapAttributionDialog
          open
          iosMapPresentation={iosMapPresentation}
          onOpenChange={() => undefined}
          attribution={parseMapAttribution(
            '<a href="https://openfreemap.org">OpenFreeMap</a> © OpenMapTiles Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          )}
          searchAttributions={[notice, "© Selected contributors"]}
        />
      )
      const dialog = within(
        screen.getByRole("dialog", { name: "地图数据来源" })
      )
      expect(dialog.getByText("© OpenMapTiles Data from")).toBeVisible()
      expect(dialog.getByText(notice)).toBeVisible()
      expect(dialog.getByText("© Selected contributors")).toBeVisible()
      expect(dialog.getAllByRole("link")).toHaveLength(2)
      for (const link of dialog.getAllByRole("link")) {
        expect(link.getAttribute("href")).toMatch(/^https:\/\//)
        expect(link).toHaveAttribute("rel", "noopener noreferrer")
      }
    }
  )

  it.each([false, true])(
    "keeps search-only sources accessible with iOS presentation %s",
    (iosMapPresentation) => {
      renderPage(
        <ExchangeMapAttributionDialog
          open
          iosMapPresentation={iosMapPresentation}
          onOpenChange={() => undefined}
          attribution={null}
          searchAttributions={["© OpenStreetMap contributors"]}
        />
      )
      expect(screen.getByRole("dialog", { name: "地图数据来源" })).toBeVisible()
      expect(screen.getByText("© OpenStreetMap contributors")).toBeVisible()
      expect(screen.queryByRole("link")).not.toBeInTheDocument()
    }
  )

  it("does not create an empty source Dialog", () => {
    renderPage(
      <ExchangeMapAttributionDialog
        open
        onOpenChange={() => undefined}
        attribution={null}
      />
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
