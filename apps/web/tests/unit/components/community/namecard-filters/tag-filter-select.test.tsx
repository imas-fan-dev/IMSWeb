import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TagFilterSelect } from "~/components/community/namecard-filters/tag-filter-select"

const apiMocks = vi.hoisted(() => ({
  getNamecardTagSuggestions: vi.fn(),
  send: vi.fn(),
}))

vi.mock("~/lib/api", () => ({
  getNamecardTagSuggestions: apiMocks.getNamecardTagSuggestions,
}))

function Harness({ initial = [] }: { initial?: string[] }) {
  const [tags, setTags] = useState<string[]>(initial)
  return (
    <TagFilterSelect id="wall-tags" value={tags} onChange={setTags} />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMocks.send.mockResolvedValue({ presets: [] })
  apiMocks.getNamecardTagSuggestions.mockReturnValue({ send: apiMocks.send })
})

describe("TagFilterSelect", () => {
  it("puts the raw input first and lists matching presets after it", async () => {
    apiMocks.send.mockResolvedValue({
      presets: [{ id: 1, name: "偶像大师", aliases: ["偶像"] }],
    })
    const user = userEvent.setup()
    render(<Harness />)

    const input = screen.getByRole("combobox", { name: "标签筛选" })
    await user.type(input, "偶像")

    // 候选先只有输入的原文；预设要等 300ms 防抖后的响应。
    await screen.findByRole("option", { name: /偶像大师/ })
    const listbox = screen.getByRole("listbox", { name: "标签候选" })
    const options = within(listbox).getAllByRole("option")
    expect(options[0]).toHaveTextContent("作为筛选词")
    expect(options[0]).toHaveTextContent("偶像")
    expect(options[1]).toHaveTextContent("偶像大师")

    await user.click(options[1])

    expect(
      screen.getByRole("button", { name: "移除标签筛选 偶像大师" })
    ).toBeVisible()
  })

  it("adds free text on Enter and removes it on demand", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(
      screen.getByRole("combobox", { name: "标签筛选" }),
      "自由标签{Enter}"
    )

    expect(
      screen.getByRole("button", { name: "移除标签筛选 自由标签" })
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", { name: "移除标签筛选 自由标签" })
    )
    expect(
      screen.queryByRole("button", { name: "移除标签筛选 自由标签" })
    ).not.toBeInTheDocument()
  })

  it("keeps one chip per normalized tag", async () => {
    const user = userEvent.setup()
    render(<Harness initial={["偶像"]} />)

    await user.type(
      screen.getByRole("combobox", { name: "标签筛选" }),
      "偶像{Enter}"
    )

    expect(
      screen.getAllByRole("button", { name: "移除标签筛选 偶像" })
    ).toHaveLength(1)
  })

  it("stops adding once five terms are selected", () => {
    render(<Harness initial={["a", "b", "c", "d", "e"]} />)

    expect(screen.getByRole("combobox", { name: "标签筛选" })).toBeDisabled()
    expect(
      screen.getByRole("combobox", { name: "标签筛选" })
    ).toHaveAttribute("placeholder", "最多同时筛选 5 个标签")
  })
})
