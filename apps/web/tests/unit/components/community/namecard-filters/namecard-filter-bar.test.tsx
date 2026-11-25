import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import type {
  NamecardCollectionDirection,
  NamecardCollectionSort,
} from "@imsweb/contracts/namecards"

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

type TestSort = NamecardCollectionSort | "random" | "created"

const COLLECTION_SORT_OPTIONS = [
  { value: "exchange", label: "交换时间" },
  { value: "name", label: "制作人名" },
  { value: "series", label: "企划" },
  { value: "date", label: "制作日期" },
] satisfies { value: TestSort; label: string }[]

const WALL_SORT_OPTIONS = [
  { value: "random", label: "随机发现" },
  { value: "created", label: "最新发布" },
  { value: "name", label: "制作人名" },
  { value: "series", label: "企划" },
  { value: "date", label: "制作日期" },
] satisfies { value: TestSort; label: string }[]

function renderBar({
  initial = DEFAULT_NAMECARD_FILTERS,
  showTags = false,
  sort = "exchange",
  dir = "desc",
  sortOptions = COLLECTION_SORT_OPTIONS,
  onReshuffle,
}: {
  initial?: NamecardFilterValue
  showTags?: boolean
  sort?: TestSort
  dir?: NamecardCollectionDirection
  sortOptions?: readonly { value: TestSort; label: string }[]
  onReshuffle?: () => void
} = {}) {
  const onChange = vi.fn()
  const onSortChange = vi.fn()
  const onDirectionChange = vi.fn()
  function Harness() {
    const [value, setValue] = useState(initial)
    const [currentSort, setCurrentSort] = useState<TestSort>(sort)
    const [currentDir, setCurrentDir] =
      useState<NamecardCollectionDirection>(dir)
    return (
      <NamecardFilterBar
        value={value}
        onChange={(next) => {
          onChange(next)
          setValue(next)
        }}
        sort={currentSort}
        dir={currentDir}
        sortOptions={sortOptions}
        onSortChange={(next) => {
          onSortChange(next)
          setCurrentSort(next)
        }}
        onDirectionChange={(next) => {
          onDirectionChange(next)
          setCurrentDir(next)
        }}
        {...(onReshuffle ? { onReshuffle } : {})}
        series={series}
        catalog={makeNamecardCharacterCatalog()}
        showTags={showTags}
      />
    )
  }
  render(<Harness />)
  return { onChange, onSortChange, onDirectionChange }
}

async function chooseSort(label: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole("combobox", { name: "排序方式" }))
  await user.click(await screen.findByRole("option", { name: label }))
}

describe("NamecardFilterBar", () => {
  it("shows only the sort control until the filter panel is opened", () => {
    renderBar()

    expect(
      screen.getByRole("combobox", { name: "排序方式" })
    ).toHaveTextContent("交换时间")
    expect(
      screen.getByRole("button", { name: "当前降序，切换为升序" })
    ).toBeEnabled()

    // 清空按钮常驻，不依赖是否有筛选条件。
    expect(
      screen.getAllByRole("button", { name: "清空筛选" }).length
    ).toBeGreaterThan(0)
    const toggle = screen.getByRole("button", { name: /^筛选/ })
    expect(toggle).toHaveTextContent("筛选")
    expect(toggle).not.toHaveTextContent("（")
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).toHaveAttribute("aria-controls", "namecard-filters-panel")
    // 筛选入口在桌面端也保留。
    expect(toggle).not.toHaveClass("md:hidden")
    const panel = document.getElementById("namecard-filters-panel")!
    expect(panel).toHaveClass("hidden")
    // 桌面端不再强制展开面板。
    expect(panel).not.toHaveClass("md:flex")
    // 搜索与其余筛选都在同一个折叠区里，排序留在区外。
    expect(panel).toContainElement(screen.getByLabelText("制作人名称"))
    expect(panel).toContainElement(screen.getByLabelText("所属用户"))
    const sort = screen.getByRole("combobox", { name: "排序方式" })
    expect(panel.contains(sort)).toBe(false)
  })

  it("puts the desktop reset in the filter row and the mobile reset at the panel bottom", async () => {
    const user = userEvent.setup()
    renderBar()

    const [desktopReset, mobileReset] = screen.getAllByRole("button", {
      name: "清空筛选",
    })
    expect(desktopReset).toHaveClass("md:ml-auto", "max-md:hidden")
    expect(mobileReset).toHaveClass("md:hidden")

    const panel = document.getElementById("namecard-filters-panel")!
    // 移动端的清空是面板的最后一个子元素。
    expect(panel.lastElementChild).toBe(mobileReset)
    // 桌面清空与搜索同处面板第一行，排在搜索（以及标签/所属用户）之后。
    const row1 = panel.firstElementChild as HTMLElement
    expect(row1).toContainElement(desktopReset)
    expect(row1).toContainElement(screen.getByLabelText("制作人名称"))

    await user.click(screen.getByRole("button", { name: /^筛选/ }))
    expect(desktopReset).toBeVisible()
    expect(mobileReset).toBeVisible()
  })

  it("keeps only the sort control outside the panel and lays filters inside it", async () => {
    const user = userEvent.setup()
    renderBar({ showTags: true })

    const panel = document.getElementById(
      "namecard-filters-panel"
    ) as HTMLElement
    const sort = screen.getByRole("combobox", { name: "排序方式" })
    expect(sort).toBeVisible()
    expect(panel.contains(sort)).toBe(false)
    expect(panel).toHaveClass("hidden")

    await user.click(screen.getByRole("button", { name: /^筛选/ }))

    expect(panel).toHaveClass("flex")
    const search = screen.getByLabelText("制作人名称")
    const tags = screen.getByRole("combobox", { name: "标签筛选" })
    expect(panel).toContainElement(search)
    expect(panel).toContainElement(tags)
    expect(
      search.compareDocumentPosition(tags) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("keeps the tag filter out of the collection bar", async () => {
    const user = userEvent.setup()
    renderBar()

    await user.click(screen.getByRole("button", { name: /^筛选/ }))

    expect(
      screen.queryByRole("combobox", { name: "标签筛选" })
    ).not.toBeInTheDocument()
  })

  it("renders the caller's sort options", async () => {
    const user = userEvent.setup()
    renderBar({ sort: "random", sortOptions: WALL_SORT_OPTIONS })

    const sort = screen.getByRole("combobox", { name: "排序方式" })
    expect(sort).toHaveTextContent("随机发现")

    await user.click(sort)
    expect(
      await screen.findByRole("option", { name: "最新发布" })
    ).toBeVisible()
    expect(screen.getByRole("option", { name: "随机发现" })).toBeVisible()
    expect(screen.getByRole("option", { name: "制作日期" })).toBeVisible()
  })

  it("reports the chosen sort key without touching the other filters", async () => {
    const { onChange, onSortChange } = renderBar()

    await chooseSort("制作日期")

    expect(onSortChange).toHaveBeenLastCalledWith("date")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("flips ascending and descending in place", async () => {
    const user = userEvent.setup()
    const { onChange, onDirectionChange } = renderBar()

    await user.click(
      screen.getByRole("button", { name: "当前降序，切换为升序" })
    )

    expect(onDirectionChange).toHaveBeenCalledWith("asc")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("replaces the direction toggle with reshuffle for the random order", async () => {
    const user = userEvent.setup()
    const onReshuffle = vi.fn()
    const { onDirectionChange } = renderBar({
      sort: "random",
      sortOptions: WALL_SORT_OPTIONS,
      onReshuffle,
    })

    expect(
      screen.queryByRole("button", { name: /当前降序|当前升序/ })
    ).not.toBeInTheDocument()
    const reshuffle = screen.getByRole("button", { name: "换个顺序" })
    expect(reshuffle).toBeVisible()

    await user.click(reshuffle)
    expect(onReshuffle).toHaveBeenCalledTimes(1)
    expect(onDirectionChange).not.toHaveBeenCalled()
  })

  it("keeps the direction toggle for non-random sorts even with a reshuffle handler", () => {
    renderBar({ onReshuffle: vi.fn() })

    expect(
      screen.getByRole("button", { name: "当前降序，切换为升序" })
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "换个顺序" })
    ).not.toBeInTheDocument()
  })

  it("reports the search term and counts it on the filter toggle", async () => {
    const user = userEvent.setup()
    const { onChange } = renderBar()

    await user.click(screen.getByRole("button", { name: /^筛选/ }))
    await user.type(screen.getByLabelText("制作人名称"), "春香")

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "春香" })
    )
    expect(screen.getByRole("button", { name: /^筛选/ })).toHaveTextContent(
      "筛选（已应用）"
    )
  })

  it("keeps only the concise placeholders and drops the descriptions", async () => {
    const user = userEvent.setup()
    renderBar()

    await user.click(screen.getByRole("button", { name: /^筛选/ }))

    const producer = screen.getByLabelText("制作人名称")
    expect(producer).toHaveAttribute("placeholder", "搜索制作人名称")
    // `type="text"`：别让浏览器自带的搜索清空按钮和我们的 X 叠在一起。
    expect(producer).toHaveAttribute("type", "text")
    expect(screen.getByLabelText("所属用户")).toHaveAttribute("type", "text")

    expect(screen.getByLabelText("所属团体")).toHaveAttribute(
      "placeholder",
      "搜索团体名称"
    )
    expect(
      screen.getByRole("textbox", { name: "搜索担当角色" })
    ).toHaveAttribute("placeholder", "搜索角色名、别名或组合名")
    expect(
      screen.queryByText("按编辑窗里的「团体名称」筛选；留空表示不限。")
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("可跨企划选择；搜索支持角色名、别名与组合名。")
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("搜索支持角色名、别名与组合名。")
    ).not.toBeInTheDocument()
    expect(screen.queryByText("尚未选择担当角色。")).not.toBeInTheDocument()
  })

  it("moves the sort direction arrows to the wide / narrow icons", async () => {
    const user = userEvent.setup()
    renderBar()

    const descending = screen.getByRole("button", {
      name: "当前降序，切换为升序",
    })
    expect(descending.querySelector("svg")).toHaveClass(
      "lucide-arrow-down-wide-narrow"
    )

    await user.click(descending)

    const ascending = screen.getByRole("button", {
      name: "当前升序，切换为降序",
    })
    expect(ascending.querySelector("svg")).toHaveClass(
      "lucide-arrow-down-narrow-wide"
    )
  })

  it("keeps the checkbox explanations behind info tooltips", async () => {
    const user = userEvent.setup()
    renderBar()

    await user.click(screen.getByRole("button", { name: /^筛选/ }))

    expect(
      screen.getByLabelText(/同时包含说明：名片必须包含全部已选角色/).tagName
    ).toBe("SPAN")
    expect(
      screen.getByLabelText(/不含其他说明：名片最多只包含已选角色/)
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText(/不含越境说明：隐藏企划字段为复数（越境）的名片/)
    ).toBeInTheDocument()
    expect(
      screen.queryByText("名片必须包含全部已选角色")
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("隐藏企划字段为复数（越境）的名片")
    ).not.toBeInTheDocument()

    await user.hover(
      screen.getByLabelText(/同时包含说明：名片必须包含全部已选角色/)
    )
    expect(
      await screen.findByText("名片必须包含全部已选角色")
    ).toBeInTheDocument()
  })

  it("opens a checkbox explanation when the hint is tapped", async () => {
    const user = userEvent.setup()
    renderBar()

    await user.click(screen.getByRole("button", { name: /^筛选/ }))
    // 触摸端点 span 不一定给焦点：点击本身必须能展开说明。
    await user.click(
      screen.getByLabelText(/同时包含说明：名片必须包含全部已选角色/)
    )
    expect(
      await screen.findByText("名片必须包含全部已选角色")
    ).toBeInTheDocument()
  })

  it("keeps the chosen characters inside the input and expands a unit", async () => {
    const user = userEvent.setup()
    const { onChange } = renderBar()

    await user.click(screen.getByRole("button", { name: /^筛选/ }))
    expect(
      screen.queryByRole("group", { name: "担当角色候选" })
    ).not.toBeInTheDocument()

    const search = screen.getByRole("textbox", { name: "搜索担当角色" })
    await user.type(search, "天海")
    await user.click(screen.getByRole("checkbox", { name: /天海春香/ }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ characterIds: [1] })
    )
    expect(
      screen.getByRole("button", { name: "移除担当 天海春香" })
    ).toBeVisible()

    await user.clear(search)
    await user.type(search, "allstars")
    await user.click(
      within(screen.getByRole("group", { name: "组合" })).getByRole(
        "checkbox",
        { name: /765プロオールスターズ/ }
      )
    )

    // 组合展开成完整成员 badge，而不是一个组合 chip。
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ characterIds: [1, 2] })
    )
    expect(
      screen.getByRole("button", { name: "移除担当 如月千早" })
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: /移除组合/ })
    ).not.toBeInTheDocument()
  })

  it("expands the filter panel and reports every field", async () => {
    const user = userEvent.setup()
    const { onChange } = renderBar()

    await user.click(screen.getByRole("button", { name: /^筛选/ }))
    expect(screen.getByRole("button", { name: /^筛选/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
    expect(document.getElementById("namecard-filters-panel")).toHaveClass(
      "flex"
    )

    await user.click(screen.getByRole("textbox", { name: "搜索担当角色" }))
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

    await user.click(screen.getByRole("textbox", { name: "搜索企划" }))
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

    await user.click(screen.getByRole("checkbox", { name: /反向排除/ }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ invert: true })
    )

    await user.click(screen.getByRole("combobox", { name: "创作声明" }))
    await user.click(await screen.findByRole("option", { name: "AI" }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ declaration: "ai" })
    )
  })

  it("lays the filters out as inputs plus a checkbox column", async () => {
    const user = userEvent.setup()
    renderBar()

    await user.click(screen.getByRole("button", { name: /^筛选/ }))

    const panel = document.getElementById("namecard-filters-panel")!
    // 面板依次是：搜索/清空行、输入列+复选框列、移动端清空。
    const [row1, advanced] = Array.from(panel.children) as HTMLElement[]
    const [inputs, checks] = Array.from(advanced.children) as HTMLElement[]

    expect(row1).toContainElement(screen.getByLabelText("制作人名称"))
    // 输入列第一行是角色搜索，之后是企划等输入。
    const firstRow = inputs.firstElementChild
    expect(firstRow).toContainElement(
      within(inputs).getByRole("textbox", { name: "搜索担当角色" })
    )
    expect(inputs).toHaveClass("flex-1")
    expect(
      within(inputs).getByRole("textbox", { name: "搜索担当角色" })
    ).toBeVisible()
    expect(
      within(inputs).getByRole("textbox", { name: "搜索企划" })
    ).toBeVisible()
    expect(within(inputs).getByLabelText("所属团体")).toBeVisible()
    expect(
      within(inputs).getByRole("combobox", { name: "创作声明" })
    ).toBeVisible()

    expect(checks).toHaveClass("md:flex-col")
    for (const label of ["同时包含", "不含其他", "不含越境", "反向排除"]) {
      expect(
        within(checks).getByRole("checkbox", { name: label })
      ).toBeVisible()
    }
    // 复选框统一用一个更矮的行高。
    expect(
      within(checks)
        .getByRole("checkbox", { name: "反向排除" })
        .closest("label")
    ).toHaveClass("min-h-7")
  })

  it("turns the series filter into a chip input with candidates", async () => {
    const user = userEvent.setup()
    const { onChange } = renderBar()

    await user.click(screen.getByRole("button", { name: /^筛选/ }))
    const search = screen.getByRole("textbox", { name: "搜索企划" })
    await user.type(search, "灰")

    const candidates = screen.getByRole("group", { name: "企划候选" })
    expect(within(candidates).getByText("灰姑娘")).toBeVisible()
    expect(within(candidates).queryByText("本家")).not.toBeInTheDocument()

    await user.click(
      within(candidates).getByRole("checkbox", { name: /灰姑娘/ })
    )
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ seriesCodes: ["cg"] })
    )
    // 选中后关键词自动清空。
    expect(search).toHaveValue("")
    expect(
      screen.getByRole("button", { name: "移除企划 灰姑娘" })
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "清空企划" }))

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ seriesCodes: [] })
    )
    expect(search).toHaveValue("")
  })

  it("clears each text input from its own X button", async () => {
    const user = userEvent.setup()
    const { onChange } = renderBar()

    await user.type(screen.getByLabelText("制作人名称"), "春香")
    await user.click(screen.getByRole("button", { name: "清空制作人名称" }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "" })
    )
    expect(screen.getByLabelText("制作人名称")).toHaveValue("")

    await user.click(screen.getByRole("button", { name: /^筛选/ }))
    await user.type(screen.getByLabelText("所属团体"), "765")
    await user.click(screen.getByRole("button", { name: "清空所属团体" }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ group: "" })
    )

    const search = screen.getByRole("textbox", { name: "搜索担当角色" })
    await user.type(search, "天海")
    // 输入框内不再单放文本清空按钮；尾部只剩「清空全部」。
    expect(
      screen.queryByRole("button", { name: "清空角色搜索" })
    ).not.toBeInTheDocument()
    expect(
      screen.getAllByRole("button", { name: /^清空担当角色/ })
    ).toHaveLength(1)
    await user.click(screen.getByRole("checkbox", { name: /天海春香/ }))
    expect(search).toHaveValue("")
    await user.click(screen.getByRole("button", { name: "清空担当角色" }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ characterIds: [] })
    )
    expect(search).toHaveValue("")

    const seriesSearch = screen.getByRole("textbox", { name: "搜索企划" })
    await user.type(seriesSearch, "本")
    expect(
      screen.queryByRole("button", { name: "清空企划搜索" })
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /^清空企划$/ })).toHaveLength(
      1
    )
    await user.click(screen.getByRole("checkbox", { name: /本家/ }))
    expect(seriesSearch).toHaveValue("")
    await user.click(screen.getByRole("button", { name: "清空企划" }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ seriesCodes: [] })
    )
    expect(seriesSearch).toHaveValue("")
  })

  it("floats the candidate panel and closes it on outside clicks or Escape", async () => {
    const user = userEvent.setup()
    renderBar()

    await user.click(screen.getByRole("button", { name: /^筛选/ }))
    const search = screen.getByRole("textbox", { name: "搜索担当角色" })
    await user.click(search)

    const candidates = screen.getByRole("group", { name: "担当角色候选" })
    expect(candidates.parentElement).toHaveClass("absolute")

    await user.click(document.body)
    expect(
      screen.queryByRole("group", { name: "担当角色候选" })
    ).not.toBeInTheDocument()

    await user.click(search)
    expect(
      screen.getByRole("group", { name: "担当角色候选" })
    ).toBeInTheDocument()

    await user.keyboard("{Escape}")
    expect(
      screen.queryByRole("group", { name: "担当角色候选" })
    ).not.toBeInTheDocument()
  })

  it("closes the candidate panel once a unit is chosen", async () => {
    const user = userEvent.setup()
    renderBar()

    await user.click(screen.getByRole("button", { name: /^筛选/ }))
    const search = screen.getByRole("textbox", { name: "搜索担当角色" })
    await user.type(search, "allstars")
    await user.click(
      within(screen.getByRole("group", { name: "组合" })).getByRole(
        "checkbox",
        { name: /765プロオールスターズ/ }
      )
    )

    expect(
      screen.queryByRole("group", { name: "担当角色候选" })
    ).not.toBeInTheDocument()
  })

  it("clears the character selection and keyword from the trailing clear button", async () => {
    const user = userEvent.setup()
    const { onChange } = renderBar()

    await user.click(screen.getByRole("button", { name: /^筛选/ }))
    const search = screen.getByRole("textbox", { name: "搜索担当角色" })
    await user.click(search)
    await user.type(search, "天海")
    await user.click(screen.getByRole("checkbox", { name: /天海春香/ }))

    await user.click(screen.getByRole("button", { name: "清空担当角色" }))

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ characterIds: [] })
    )
    expect(search).toHaveValue("")
  })

  it("resets every filter from the clear button and keeps the sort", async () => {
    const user = userEvent.setup()
    const { onChange, onSortChange } = renderBar()

    await chooseSort("制作日期")
    await user.click(screen.getByRole("button", { name: /^筛选/ }))
    await user.type(screen.getByLabelText("制作人名称"), "春香")
    await user.type(screen.getByLabelText("所属团体"), "765")
    await user.click(screen.getByRole("checkbox", { name: /不含越境/ }))
    await user.click(screen.getByRole("checkbox", { name: /反向排除/ }))
    await user.click(screen.getByRole("combobox", { name: "创作声明" }))
    await user.click(await screen.findByRole("option", { name: "原创" }))

    await user.click(screen.getAllByRole("button", { name: "清空筛选" })[0])

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        q: "",
        group: "",
        excludeCross: false,
        invert: false,
        declaration: null,
      })
    )
    expect(onChange.mock.lastCall?.[0]).not.toHaveProperty("sort")
    expect(onChange.mock.lastCall?.[0]).not.toHaveProperty("dir")
    // 清筛选不动排序：只换过这一次排序键，且选择仍停在制作日期。
    expect(onSortChange).toHaveBeenCalledTimes(1)
    expect(onSortChange).toHaveBeenLastCalledWith("date")
    expect(
      screen.getByRole("combobox", { name: "排序方式" })
    ).toHaveTextContent("制作日期")
    expect(
      screen.getByRole("combobox", { name: "创作声明" })
    ).toHaveTextContent("不限")
  })
})
