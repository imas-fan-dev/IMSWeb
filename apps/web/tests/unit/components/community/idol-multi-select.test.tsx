import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"

import { IdolMultiSelect } from "~/components/community/idol-multi-select"
import type { WikiPublicSearchEntry } from "~/lib/api"

const series = [
  { code: "765", displayName: "765PRO", color: "#f34e6c" },
  { code: "cg", displayName: "灰姑娘女孩", color: "#2581c7" },
]

const idols: WikiPublicSearchEntry[] = [
  {
    id: 1,
    name: "天海春香",
    agencyId: 1,
    agencyCode: "765",
    agencyName: "765PRO",
    agencyColor: "#f34e6c",
    entryKind: "idol",
    entrySubtype: null,
  },
  {
    id: 2,
    name: "如月千早",
    agencyId: 1,
    agencyCode: "765",
    agencyName: "765PRO",
    agencyColor: "#f34e6c",
    entryKind: "idol",
    entrySubtype: null,
  },
  {
    id: 3,
    name: "涩谷凛",
    agencyId: 2,
    agencyCode: "cg",
    agencyName: "灰姑娘女孩",
    agencyColor: "#2581c7",
    entryKind: "idol",
    entrySubtype: null,
  },
]

function PickerHarness({ initial = [] }: { initial?: number[] }) {
  const [selectedIds, setSelectedIds] = useState(initial)
  return (
    <IdolMultiSelect
      id="test-idols"
      series={series}
      idols={idols}
      selectedIds={selectedIds}
      disabled={false}
      onChange={setSelectedIds}
    />
  )
}

describe("IdolMultiSelect", () => {
  it("keeps multi-series selections while switching and searching", async () => {
    const user = userEvent.setup()
    render(<PickerHarness />)

    expect(screen.getByText("天海春香")).toBeVisible()
    expect(screen.queryByText("涩谷凛")).not.toBeInTheDocument()

    await user.click(screen.getByRole("checkbox", { name: /天海春香/ }))
    await user.click(screen.getByRole("tab", { name: "灰姑娘女孩" }))
    await user.type(screen.getByRole("searchbox"), "凛")
    await user.click(screen.getByRole("checkbox", { name: /涩谷凛/ }))

    const selected = screen.getByLabelText("已选担当偶像")
    expect(within(selected).getByText("天海春香")).toBeVisible()
    expect(within(selected).getByText("涩谷凛")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "移除担当 天海春香" }))
    expect(within(selected).queryByText("天海春香")).not.toBeInTheDocument()
    expect(within(selected).getByText("涩谷凛")).toBeVisible()
  })

  it("disables new selections after twenty idols", () => {
    const expanded = Array.from({ length: 21 }, (_, index) => ({
      ...idols[0],
      id: index + 1,
      name: `偶像 ${index + 1}`,
    }))
    render(
      <IdolMultiSelect
        id="limit-idols"
        series={series}
        idols={expanded}
        selectedIds={expanded.slice(0, 20).map((idol) => idol.id)}
        disabled={false}
        onChange={() => undefined}
      />
    )

    expect(screen.getByRole("checkbox", { name: /偶像 21/ })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
  })
})
