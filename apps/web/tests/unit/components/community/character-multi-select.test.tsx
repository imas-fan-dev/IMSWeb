import type { NamecardCharacterCatalog } from "@imsweb/contracts/fudaba/characters"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { UserEvent } from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"

import { CharacterMultiSelect } from "~/components/community/character-multi-select"
import { makeNamecardCharacterCatalog } from "@/mocks/data/characters"

function PickerHarness({
  initial = [],
  catalog = makeNamecardCharacterCatalog(),
}: {
  initial?: number[]
  catalog?: NamecardCharacterCatalog
}) {
  const [selectedIds, setSelectedIds] = useState(initial)
  return (
    <CharacterMultiSelect
      id="picker"
      catalog={catalog}
      loading={false}
      selectedIds={selectedIds}
      disabled={false}
      onChange={setSelectedIds}
    />
  )
}

async function chooseOption(
  user: UserEvent,
  filter: string,
  option: string
) {
  await user.click(screen.getByRole("combobox", { name: filter }))
  await user.click(await screen.findByRole("option", { name: option }))
}

describe("CharacterMultiSelect", () => {
  it("searches every name field, including the packed alias string", async () => {
    const user = userEvent.setup()
    render(<PickerHarness />)

    const search = screen.getByRole("searchbox", { name: "" })

    await user.type(search, "凛")
    expect(screen.getByText("涩谷凛")).toBeVisible()
    expect(screen.queryByText("天海春香")).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, "kisaragi")
    expect(screen.getByText("如月千早")).toBeVisible()

    await user.clear(search)
    await user.type(search, "はるかっちょ")
    expect(screen.getByText("天海春香")).toBeVisible()
    expect(screen.queryByText("涩谷凛")).not.toBeInTheDocument()
  })

  it("narrows the candidates with the agency and category filters", async () => {
    const user = userEvent.setup()
    render(<PickerHarness />)

    await chooseOption(user, "企划", "CINDERELLA GIRLS")
    expect(screen.getByText("涩谷凛")).toBeVisible()
    expect(screen.queryByText("天海春香")).not.toBeInTheDocument()

    await chooseOption(user, "企划", "全部企划")
    await chooseOption(user, "分类", "职员")
    expect(screen.getByText("音无小鸟")).toBeVisible()
    expect(screen.queryByText("天海春香")).not.toBeInTheDocument()
  })

  it("expands a unit into its members and withdraws them together", async () => {
    const user = userEvent.setup()
    render(<PickerHarness />)

    await user.type(screen.getByRole("searchbox", { name: "" }), "allstars")

    const group = screen.getByRole("group", { name: "组合" })
    // One truncated line; the full roster sits in the tooltip.
    expect(screen.getByTitle("天海春香、如月千早")).toBeInTheDocument()
    await user.click(within(group).getByRole("checkbox", { name: /765PRO/ }))

    const selected = screen.getByLabelText("已选担当角色")
    expect(within(selected).getByText("765PRO ALLSTARS")).toBeVisible()
    expect(within(selected).queryByText("天海春香")).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "移除组合 765PRO ALLSTARS" })
    )
    expect(
      screen.queryByRole("button", { name: "移除组合 765PRO ALLSTARS" })
    ).not.toBeInTheDocument()
    expect(screen.getByText("尚未选择担当角色。")).toBeVisible()
  })

  it("keeps the fallback entries reachable when nothing matches", async () => {
    const user = userEvent.setup()
    render(<PickerHarness />)

    await user.type(screen.getByRole("searchbox", { name: "" }), "zzzz")

    const fallback = screen.getByRole("group", { name: "兜底条目" })
    expect(within(fallback).getByText("其他偶像")).toBeVisible()
    expect(within(fallback).getByText("其他职员")).toBeVisible()
    expect(within(fallback).getByText("其他吉祥物")).toBeVisible()
    expect(
      screen.getByText("没有匹配的角色，可选择以下兜底条目。")
    ).toBeVisible()
  })

  it("keeps the sentinel fallbacks out of a narrowed agency until a query misses", async () => {
    const user = userEvent.setup()
    render(<PickerHarness />)

    await chooseOption(user, "企划", "CINDERELLA GIRLS")
    expect(
      screen.queryByRole("group", { name: "兜底条目" })
    ).not.toBeInTheDocument()

    await user.type(screen.getByRole("searchbox", { name: "" }), "zzzz")
    const fallback = screen.getByRole("group", { name: "兜底条目" })
    expect(within(fallback).getByText("其他吉祥物")).toBeVisible()
    expect(
      screen.getByText("没有匹配的角色，可选择以下兜底条目。")
    ).toBeVisible()
  })

  it("narrows units with the agency and category filters", async () => {
    const user = userEvent.setup()
    render(<PickerHarness />)

    await user.type(screen.getByRole("searchbox", { name: "" }), "allstars")
    expect(screen.getByRole("group", { name: "组合" })).toBeVisible()

    await chooseOption(user, "企划", "CINDERELLA GIRLS")
    expect(
      screen.queryByRole("group", { name: "组合" })
    ).not.toBeInTheDocument()

    await chooseOption(user, "企划", "全部企划")
    await chooseOption(user, "分类", "职员")
    expect(
      screen.queryByRole("group", { name: "组合" })
    ).not.toBeInTheDocument()

    await chooseOption(user, "分类", "偶像")
    expect(screen.getByRole("group", { name: "组合" })).toBeVisible()
  })

  it("selects and removes individual characters", async () => {
    const user = userEvent.setup()
    render(<PickerHarness />)

    await user.click(screen.getByRole("checkbox", { name: /天海春香/ }))
    const selected = screen.getByLabelText("已选担当角色")
    expect(within(selected).getByText("天海春香")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "移除担当 天海春香" }))
    expect(within(selected).queryByText("天海春香")).not.toBeInTheDocument()
    expect(screen.getByText("尚未选择担当角色。")).toBeVisible()
  })

  it("stops accepting new characters at the contract limit", () => {
    const catalog = makeNamecardCharacterCatalog({
      characters: Array.from({ length: 201 }, (_, index) => ({
        id: index + 1,
        agencyId: 1,
        agencyCode: "765",
        agencyName: "765PRO ALLSTARS",
        agencyColor: "#f34e6c",
        category: "idol" as const,
        isFallback: false,
        nameCn: `角色 ${index + 1}`,
        nameJa: null,
        nameEn: null,
        aliases: null,
      })),
    })
    render(
      <PickerHarness
        catalog={catalog}
        initial={Array.from({ length: 200 }, (_, index) => index + 1)}
      />
    )

    const candidateGroup = screen.getByRole("group", { name: "担当角色候选" })
    const candidateBoxes = within(candidateGroup).getAllByRole("checkbox")

    expect(candidateBoxes).toHaveLength(201)
    expect(candidateBoxes[0]).not.toHaveAttribute("aria-disabled", "true")
    expect(candidateBoxes[200]).toHaveAttribute("aria-disabled", "true")
  })

  it("keeps selections across filters and shows them as removable chips", async () => {
    const user = userEvent.setup()
    render(<PickerHarness />)

    await user.click(screen.getByRole("checkbox", { name: /天海春香/ }))
    await chooseOption(user, "企划", "CINDERELLA GIRLS")
    await user.click(screen.getByRole("checkbox", { name: /涩谷凛/ }))

    const selected = screen.getByLabelText("已选担当角色")
    expect(within(selected).getByText("天海春香")).toBeVisible()
    expect(within(selected).getByText("涩谷凛")).toBeVisible()
  })
})
