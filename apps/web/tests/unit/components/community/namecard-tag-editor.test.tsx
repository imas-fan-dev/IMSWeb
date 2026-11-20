import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  NamecardTagEditor,
  type NamecardTagEditorProps,
} from "~/components/community/namecard-tag-editor"

const apiMocks = vi.hoisted(() => ({
  getNamecardTagSuggestions: vi.fn(),
  setNamecardCardTags: vi.fn(),
  validateNamecardTags: vi.fn(),
}))

// 只替换用到的两个端点：整包 importOriginal 会把 admin/events 等整棵依赖树拉进来，
// 既慢又会跟 contracts 的并发重建撞车。
vi.mock("~/lib/api", () => ({
  getNamecardTagSuggestions: apiMocks.getNamecardTagSuggestions,
  setNamecardCardTags: apiMocks.setNamecardCardTags,
  validateNamecardTags: apiMocks.validateNamecardTags,
  isApiError: () => false,
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

interface HarnessProps {
  initial?: string[]
  onChange?: (next: string[]) => void
  onSave?: NamecardTagEditorProps["onSave"]
  cardId?: string
}

/** 编辑器是受控的：harness 像四个窗口/墙瓦片那样持有 value。 */
function TagEditorHarness({
  variant,
  initial = [],
  onChange,
  onSave,
  cardId,
}: HarnessProps & { variant: NamecardTagEditorProps["variant"] }) {
  const [tags, setTags] = useState<string[]>(initial)
  return (
    <NamecardTagEditor
      variant={variant}
      value={tags}
      cardId={cardId}
      onSave={onSave}
      onChange={(next) => {
        setTags(next)
        onChange?.(next)
      }}
    />
  )
}

function addTags(count: number) {
  return Array.from({ length: count }, (_, index) => `标签${index + 1}`)
}

beforeEach(() => {
  apiMocks.getNamecardTagSuggestions.mockImplementation(() => ({
    send: () => Promise.resolve({ presets: [] }),
  }))
  apiMocks.setNamecardCardTags.mockImplementation(() => ({
    send: () => Promise.resolve({ tags: [] }),
  }))
  apiMocks.validateNamecardTags.mockImplementation(() => ({
    send: () => Promise.resolve({ blocked: [] }),
  }))
})

describe("NamecardTagEditor form variant", () => {
  it("creates a chip from the trailing input on Enter", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TagEditorHarness variant="form" onChange={onChange} />)

    await user.click(screen.getByRole("button", { name: "添加标签" }))
    await user.type(
      screen.getByRole("combobox", { name: "新标签" }),
      "偶像大师"
    )
    await user.keyboard("{Enter}")

    expect(onChange).toHaveBeenLastCalledWith(["偶像大师"])
    expect(
      screen.getByRole("button", { name: "编辑标签 偶像大师" })
    ).toBeVisible()
    // 窗口自己不管保存，footer 统一提交。
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull()
  })

  it("commits and cancels an edited chip, and removes chips on demand", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <TagEditorHarness
        variant="form"
        initial={["旧标签", "留下的"]}
        onChange={onChange}
      />
    )

    await user.click(screen.getByRole("button", { name: "编辑标签 旧标签" }))
    const input = screen.getByRole("combobox", { name: "编辑标签 旧标签" })
    await user.clear(input)
    await user.type(input, "新标签")
    await user.keyboard("{Enter}")
    expect(onChange).toHaveBeenLastCalledWith(["新标签", "留下的"])

    await user.click(screen.getByRole("button", { name: "删除标签 留下的" }))
    expect(onChange).toHaveBeenLastCalledWith(["新标签"])
  })

  it("withdraws an edit on Escape instead of committing it", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <TagEditorHarness
        variant="form"
        initial={["原样"]}
        onChange={onChange}
      />
    )

    await user.click(screen.getByRole("button", { name: "编辑标签 原样" }))
    const input = screen.getByRole("combobox", { name: "编辑标签 原样" })
    await user.clear(input)
    await user.type(input, "改坏了")
    // 第一下 Esc 收起候选（候选里始终有输入的原文），第二下取消这次编辑。
    await user.keyboard("{Escape}{Escape}")

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "编辑标签 原样" })).toBeVisible()
  })

  it("hides the add button at 20 tags and caps a tag at 64 characters", () => {
    render(<TagEditorHarness variant="form" initial={addTags(20)} />)

    expect(screen.queryByRole("button", { name: "添加标签" })).toBeNull()
    expect(
      screen.getByText("最多添加 20 个标签，每个不超过 64 字")
    ).toBeVisible()
  })

  it("limits the chip input to 64 characters while typing", async () => {
    const user = userEvent.setup()
    render(<TagEditorHarness variant="form" />)

    await user.click(screen.getByRole("button", { name: "添加标签" }))
    const input = screen.getByRole("combobox", { name: "新标签" })
    expect(input).toHaveAttribute("maxlength", "64")

    await user.type(input, "长".repeat(70))
    expect((input as HTMLInputElement).value).toHaveLength(64)
  })

  it("offers the raw input first and then presets in the dropdown", async () => {
    apiMocks.getNamecardTagSuggestions.mockImplementation(() => ({
      send: () =>
        Promise.resolve({
          presets: [
            { id: 1, name: "765偶像", aliases: [] },
            { id: 2, name: "偶像大师", aliases: [] },
          ],
        }),
    }))
    const user = userEvent.setup()
    render(<TagEditorHarness variant="form" />)

    await user.click(screen.getByRole("button", { name: "添加标签" }))
    await user.type(screen.getByRole("combobox", { name: "新标签" }), "偶像")

    // 防抖请求回来之前只有「输入的原文」一行，等预设出现后再断言整张列表。
    await screen.findByRole("option", { name: "偶像大师" })
    const options = screen.getAllByRole("option")
    expect(options[0]).toHaveTextContent("偶像")
    expect(options.map((option) => option.textContent)).toEqual([
      "偶像",
      "偶像大师",
      "765偶像",
    ])
  })
})

describe("NamecardTagEditor blocklist", () => {
  it("drops a newly committed tag when it matches a blocked word", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    apiMocks.validateNamecardTags.mockImplementation(() => ({
      send: () => Promise.resolve({ blocked: ["违禁"] }),
    }))
    render(<TagEditorHarness variant="form" onChange={onChange} />)

    await user.click(screen.getByRole("button", { name: "添加标签" }))
    await user.type(
      screen.getByRole("combobox", { name: "新标签" }),
      "违禁{enter}"
    )

    await waitFor(() => expect(screen.queryByText("违禁")).toBeNull())
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe("NamecardTagEditor inline variant", () => {
  it("keeps saved chips read-only and shows no save row until a draft exists", async () => {
    const user = userEvent.setup()
    render(<TagEditorHarness variant="inline" initial={["已保存"]} />)

    expect(screen.getByText("已保存")).toBeVisible()
    expect(screen.queryByRole("button", { name: "删除标签 已保存" })).toBeNull()
    expect(screen.queryByRole("button", { name: "编辑标签 已保存" })).toBeNull()
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull()

    await user.click(screen.getByRole("button", { name: "添加标签" }))
    await user.type(
      screen.getByRole("combobox", { name: "新标签" }),
      "新草稿"
    )
    await user.keyboard("{Enter}")

    // 草稿可以删/改，已保存的仍然只读；保存行这时才出现。
    expect(
      screen.getByRole("button", { name: "删除标签 新草稿" })
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "保存" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "删除标签 已保存" })).toBeNull()
  })

  it("discards every draft when 取消 is pressed", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <TagEditorHarness
        variant="inline"
        initial={["已保存"]}
        onSave={onSave}
      />
    )

    await user.click(screen.getByRole("button", { name: "添加标签" }))
    await user.type(
      screen.getByRole("combobox", { name: "新标签" }),
      "草稿{enter}"
    )
    expect(screen.getByRole("button", { name: "保存" })).toBeVisible()

    await user.click(screen.getByRole("button", { name: "取消" }))

    expect(screen.queryByText("草稿")).toBeNull()
    expect(screen.getByText("已保存")).toBeVisible()
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it("saves through onSave and clears the draft afterwards", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onSave = vi.fn()
    render(
      <TagEditorHarness
        variant="inline"
        initial={["已保存"]}
        onChange={onChange}
        onSave={onSave}
      />
    )

    await user.click(screen.getByRole("button", { name: "添加标签" }))
    await user.type(
      screen.getByRole("combobox", { name: "新标签" }),
      "新草稿"
    )
    await user.keyboard("{Enter}")
    await user.click(screen.getByRole("button", { name: "保存" }))

    expect(onSave).toHaveBeenCalledWith(["已保存", "新草稿"])
    expect(onChange).toHaveBeenLastCalledWith(["已保存", "新草稿"])
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull()
    expect(
      screen.queryByRole("button", { name: "删除标签 新草稿" })
    ).toBeNull()
  })

  it("falls back to the tags endpoint when no onSave is provided", async () => {
    apiMocks.setNamecardCardTags.mockImplementation(() => ({
      send: () =>
        Promise.resolve({
          tags: [
            { name: "已保存", presetId: null },
            { name: "新草稿", presetId: 7 },
          ],
        }),
    }))
    const user = userEvent.setup()
    render(
      <TagEditorHarness variant="inline" initial={["已保存"]} cardId="card-9" />
    )

    await user.click(screen.getByRole("button", { name: "添加标签" }))
    await user.type(
      screen.getByRole("combobox", { name: "新标签" }),
      "新草稿"
    )
    await user.keyboard("{Enter}")
    await user.click(screen.getByRole("button", { name: "保存" }))

    expect(apiMocks.setNamecardCardTags).toHaveBeenCalledWith("card-9", [
      "已保存",
      "新草稿",
    ])
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull()
  })

  it("drops a duplicate draft instead of adding a second chip", async () => {
    const user = userEvent.setup()
    render(<TagEditorHarness variant="inline" initial={["偶像"]} />)

    await user.click(screen.getByRole("button", { name: "添加标签" }))
    await user.type(screen.getByRole("combobox", { name: "新标签" }), "偶像")
    await user.keyboard("{Enter}")

    expect(screen.queryByRole("button", { name: "保存" })).toBeNull()
    const list = screen.getByRole("group", { name: "名片标签" })
    expect(within(list).getAllByText("偶像")).toHaveLength(1)
  })
})
