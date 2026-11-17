import { screen } from "@testing-library/react"
import { Route, Routes, useLocation } from "react-router"
import { describe, expect, it } from "vitest"
import { renderPage } from "@/tests/unit/support/harness"
import LegacyCatalogCharacters from "~/pages/admin/idols/characters"
import LegacyCardCharacters from "~/pages/admin/cards/characters"

function Address() {
  const { pathname, search, hash } = useLocation()
  return (
    <p>
      {pathname}
      {search}
      {hash}
    </p>
  )
}

describe("character directory compatibility", () => {
  it.each([
    ["/admin/idols/characters", LegacyCatalogCharacters],
    ["/admin/cards/characters", LegacyCardCharacters],
  ] as const)(
    "opens the unified workspace from %s with filters and fragment",
    (path, Page) => {
      renderPage(
        <Routes>
          <Route path={path} element={<Page />} />
          <Route path="/admin/idols" element={<Address />} />
        </Routes>,
        { route: `${path}?agencyId=2&page=3&query=春香&category=staff#profile` }
      )
      expect(
        screen.getByText(
          "/admin/idols?page=3&query=%E6%98%A5%E9%A6%99&category=staff&projectId=2&kind=character#profile"
        )
      ).toBeVisible()
    }
  )
  it("prefers an explicit project and removes the old all-agencies value", () => {
    renderPage(
      <Routes>
        <Route
          path="/admin/idols/characters"
          element={<LegacyCatalogCharacters />}
        />
        <Route path="/admin/idols" element={<Address />} />
      </Routes>,
      { route: "/admin/idols/characters?agencyId=all&projectId=2&ownerId=20" }
    )
    expect(
      screen.getByText("/admin/idols?projectId=2&ownerId=20&kind=character")
    ).toBeVisible()
  })
})
