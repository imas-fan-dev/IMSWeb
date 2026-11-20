import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { NamecardClaimBadge } from "~/components/community/namecard-claim-badge"
import { makeNamecard } from "@/mocks/data/namecards"
import { renderPage } from "../../support/harness"

const CLAIMED = makeNamecard({
  claimStatus: "claimed",
  claimerName: "桐生一马",
  claimerUid: 9,
})

function renderBadge(iconOnly: boolean, card = CLAIMED) {
  renderPage(<NamecardClaimBadge card={card} iconOnly={iconOnly} />)
}

describe("NamecardClaimBadge iconOnly", () => {
  it("renders just a green icon for a claimed card — no text and no link", () => {
    renderBadge(true)

    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.queryByText("桐生一马")).toBeNull()

    const badge = screen.getByTitle("已由注册用户认领")
    expect(badge.className).toContain("text-success")
    expect(badge.querySelector("svg")).not.toBeNull()
    // 可见文字只有图标；完整文案留在 sr-only 里给读屏。
    expect(badge.querySelector(".sr-only")).toHaveTextContent(
      "已由注册用户认领"
    )
    expect(badge.textContent).toBe("已由注册用户认领")
  })

  it("keeps the pending badge unchanged in iconOnly mode", () => {
    renderBadge(true, makeNamecard({ claimStatus: "pending" }))

    expect(screen.getByText("认领审核中")).toBeVisible()
  })

  it("links the claimant name when iconOnly is off", () => {
    renderBadge(false)

    expect(screen.getByRole("link", { name: /桐生一马/ })).toHaveAttribute(
      "href",
      "/user/9"
    )
  })
})
