import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { makeFudabaOwnerCard } from "@/mocks/data/fudaba"
import type { CardGroup } from "~/pages/account/me/namecards/card-manager-model"
import { CardGroupSection } from "~/pages/account/me/namecards/components/card-group-section"

const CARD = makeFudabaOwnerCard({
  id: "card-1",
  cardNumber: 1,
  producerName: "名片 A",
})

function group(overrides: Partial<CardGroup> = {}): CardGroup {
  return { id: "g-1", title: "常用", cards: [CARD], ...overrides }
}

describe("CardGroupSection", () => {
  it("renders the default group without a header region", () => {
    render(
      <CardGroupSection
        group={group({ id: null, title: null })}
        tileCount={1}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      >
        <span>放置区</span>
      </CardGroupSection>
    )

    // 默认分组没有组头：没有标题、没有计数、也没有折叠控件，只留无障碍名称。
    expect(screen.queryByRole("heading")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByRole("region", { name: "默认分组" })).toBeVisible()
    expect(screen.getByText("放置区")).toBeVisible()
  })

  it("falls back to an unnamed label when the title is blank", () => {
    render(
      <CardGroupSection
        group={group({ title: "   " })}
        tileCount={1}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      >
        <span>放置区</span>
      </CardGroupSection>
    )

    expect(screen.getByRole("heading", { name: "未命名分组" })).toBeVisible()
  })

  it("keeps the header and hides only the tiles when collapsed", async () => {
    const user = userEvent.setup()
    const onToggleCollapsed = vi.fn()
    const { rerender } = render(
      <CardGroupSection
        group={group()}
        tileCount={1}
        collapsed={false}
        onToggleCollapsed={onToggleCollapsed}
      >
        <span>名片 A</span>
      </CardGroupSection>
    )

    const toggle = screen.getByRole("button", { name: "折叠常用" })
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    await user.click(toggle)
    expect(onToggleCollapsed).toHaveBeenCalledOnce()

    rerender(
      <CardGroupSection
        group={group()}
        tileCount={1}
        collapsed
        onToggleCollapsed={onToggleCollapsed}
      >
        <span>名片 A</span>
      </CardGroupSection>
    )

    expect(screen.queryByText("名片 A")).toBeNull()
    expect(screen.getByRole("heading", { name: "常用" })).toBeVisible()
    expect(screen.getByRole("button", { name: "展开常用" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
  })

  it("shows the drop hint in every empty group of the editing session", () => {
    // 编辑模式里 `children` 外面永远裹着一层 `SortableContext`（数出来恒为 1），
    // 所以空分组有没有落点只看 `tileCount`。默认分组（没有组头）也要有。
    const { rerender } = render(
      <CardGroupSection
        group={group({ id: null, title: null, cards: [] })}
        tileCount={0}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
        editing
      >
        <span>放置区</span>
      </CardGroupSection>
    )
    expect(screen.getByText("把名片拖到这里")).toBeVisible()

    rerender(
      <CardGroupSection
        group={group({ cards: [] })}
        tileCount={0}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
        editing
      >
        <span>放置区</span>
      </CardGroupSection>
    )
    expect(screen.getByRole("heading", { name: "常用" })).toBeVisible()
    expect(screen.getByText("把名片拖到这里")).toBeVisible()
  })

  it("leaves the drop hint out once the group holds a tile", () => {
    render(
      <CardGroupSection
        group={group()}
        tileCount={1}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
        editing
      >
        <span>名片 A</span>
      </CardGroupSection>
    )

    expect(screen.queryByText("把名片拖到这里")).toBeNull()
  })

  it("restores the current title when a rename input is cleared and left empty", async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    render(
      <CardGroupSection
        group={group()}
        tileCount={1}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
        editing
        onRename={onRename}
      >
        <span>名片 A</span>
      </CardGroupSection>
    )

    await user.clear(screen.getByRole("textbox", { name: "分组名称" }))
    await user.tab()

    // 空标题不提交（重命名也没有 `onCancel`）：组头不能就这么留空串。
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByRole("textbox", { name: "分组名称" })).toHaveValue(
      "常用"
    )
  })
})
