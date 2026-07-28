import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { WikiHierarchyExplorer } from "~/pages/admin/stories/wiki-hierarchy-explorer"
import {
  defaultWikiImageTransform,
  type WikiAdminAgency,
  type WikiAdminIdol,
} from "~/shared/api"

function idol(id: number, name: string, groupIds: number[]): WikiAdminIdol {
  return {
    id,
    name,
    folderName: `idol_${id}`,
    color: "#8dbbff",
    textColor: "#ffffff",
    displayOrder: id,
    imageUrl: "",
    imageFit: "cover",
    imageTransform: defaultWikiImageTransform,
    mediaRevision: 0,
    wikiEnabled: true,
    groupIds,
    entryKind: "idol",
    entrySubtype: null,
  }
}

describe("WikiHierarchyExplorer", () => {
  it("shows idols without memberships in a selectable final section", async () => {
    const grouped = idol(6, "樱木真乃", [31])
    const ungrouped = idol(8, "浅仓透", [])
    ungrouped.entryKind = "story"
    ungrouped.entrySubtype = "event"
    const agency: WikiAdminAgency = {
      id: 6,
      code: "sc",
      name: "闪耀色彩",
      color: "#8dbbff",
      wikiEnabled: true,
      bannerTitle: "283 Production",
      displayOrder: 0,
      layoutRevision: 0,
      iconUrl: null,
      imageTransform: defaultWikiImageTransform,
      mediaRevision: 0,
      idols: [grouped, ungrouped],
      groups: [
        {
          id: 31,
          code: "illumination-stars",
          name: "illumination STARS",
          color: "#ffd700",
          iconUrl: null,
          displayOrder: 0,
          isFallback: false,
          idolIds: [grouped.id],
          imageTransform: defaultWikiImageTransform,
          mediaRevision: 0,
          idols: [grouped],
        },
      ],
    }
    const onSelectIdol = vi.fn()
    const user = userEvent.setup()

    render(
      <WikiHierarchyExplorer
        agency={agency}
        selectedIdolId={grouped.id}
        onSelectIdol={onSelectIdol}
        onCreateGroup={vi.fn()}
        onEditGroup={vi.fn()}
        onCreateIdol={vi.fn()}
      />
    )

    const groupLabel = screen.getByText("illumination STARS")
    const ungroupedLabel = screen.getByText("未归档")
    expect(
      groupLabel.compareDocumentPosition(ungroupedLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
    await user.click(screen.getByRole("button", { name: "浅仓透" }))
    expect(onSelectIdol).toHaveBeenCalledWith(ungrouped)
    expect(screen.getByText("活动")).toBeVisible()
  })
})
