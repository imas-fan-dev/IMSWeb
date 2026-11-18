import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  DEFAULT_NAMECARD_FILTERS,
  NamecardFilterBar,
  type NamecardFilterValue,
} from "~/components/community/namecard-filters/namecard-filter-bar"
import type { SeriesOption } from "~/components/community/series-multi-select"
import { makeNamecardCharacterCatalog } from "@/mocks/data/characters"

const series: SeriesOption[] = [
  { code: "765", displayName: "本家", color: "#f34f6d" },
  { code: "cg", displayName: "灰姑娘", color: "#2681c8" },
]

function renderBar(
  initial: NamecardFilterValue = DEFAULT_NAMECARD_FILTERS,
  timeLabel?: string
) {
  const onChange = vi.fn()
  function Harness() {
    const [value, setValue] = useState(initial)
    return (
      <NamecardFilterBar
        value={value}
        onChange={(next) => {
          onChange(next)
          setValue(next)
        }}
        series={series}
        catalog={makeNamecardCharacterCatalog()}
        {...(timeLabel ? { timeLabel } : {})}
      />
    )
  }
  render(<Harness />)
  return { onChange }
}

async function chooseSort(label: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole("combobox", { name: "排序方式" }))
  await user.click(await screen.findByRole("option", { name: label }))
}

describe("NamecardFilterBar", () => {
  it("starts on exchange time, descending, with the advanced panel collapsed", () => {
    renderBar()

    expect(screen.getByRole("combobox", { name: "排序方式" })).toHaveTextContent(
      "交换时间"
    )
    expect(
      screen.getByRole("button", { name: "当前降序，切换为升序" })
    ).toBeEnabled()

    const toggle = screen.getByRole("button", { name: /高级筛选/ })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).toHaveAttribute("aria-controls", "namecard-filters-advanced")
    expect(document.getElementById("namecard-filters-advanced")).toHaveClass(
      "hidden",
      "md:flex"
    )
  })

  it("uses the caller's time label instead of 交换时间", () => {
    renderBar(DEFAULT_NAMECARD_FILTERS, "创建时间")

    expect(screen.getByRole("combobox", { name: "排序方式" })).toHaveTextContent(
      "创建时间"
    )
  })

  it("resets the direction to each sort key's default", async () => {
    const { onChange } = renderBar()

    await chooseSort("制作日期")
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "date", dir: "desc" })
    )

    await chooseSort("制作人名")
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "name", dir: "asc" })
    )
  })

  it("flips ascending and descending in place", async () => {
    const user = userEvent.setup()
    const { onChange } = renderBar()

    await user.click(
      screen.getByRole("button", { name: "当前降序，切换为升序" })
    )

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "exchange", dir: "asc" })
    )
  })

  it("reports the search term", async () => {
    const user = userEvent.setup()
    const { onChange } = renderBar()

    await user.type(screen.getByLabelText("搜索制作人"), "春香")

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "春香" })
    )
  })

  it("expands the advanced panel and reports every advanced field", async () => {
    const user = userEvent.setup()
    const { onChange } = renderBar()

    await user.click(screen.getByRole("button", { name: /高级筛选/ }))
    expect(screen.getByRole("button", { name: /高级筛选/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
    expect(document.getElementById("namecard-filters-advanced")).toHaveClass(
      "flex"
    )

    await user.click(screen.getByRole("checkbox", { name: /天海春香/ }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ characterIds: [1] })
    )

    await user.click(screen.getByRole("checkbox", { name: /同时包含/ }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ matchAll: true })
    )

    await user.click(screen.getByRole("checkbox", { name: /不含其他/ }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ excludeOther: true })
    )

    await user.click(screen.getByRole("checkbox", { name: /本家/ }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ seriesCodes: ["765"] })
    )

    await user.type(screen.getByLabelText("所属团体"), "765PRO")
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ group: "765PRO" })
    )

    await user.click(screen.getByRole("checkbox", { name: /不含越境/ }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ excludeCross: true })
    )
  })
})
