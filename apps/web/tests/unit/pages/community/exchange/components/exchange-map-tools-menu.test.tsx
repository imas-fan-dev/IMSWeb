import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"

import { renderPage } from "@/tests/unit/support/harness"
import { ExchangeMapToolsMenu } from "~/pages/community/exchange/components/exchange-map-tools-menu"

function Harness() {
  const [tool, setTool] = useState<string | null>(null)
  return (
    <>
      <ExchangeMapToolsMenu
        filterApplied
        modalOpen={tool !== null}
        onOpenFilter={() => setTool("筛选地图")}
        onOpenOffices={() => setTool("事务所名录")}
        onOpenCards={() => setTool("名片名录")}
      />
      {tool ? (
        <div role="dialog" aria-label={tool}>
          <button onClick={() => setTool(null)}>关闭工具</button>
        </div>
      ) : null}
    </>
  )
}

describe("ExchangeMapToolsMenu", () => {
  it.each([
    ["打开筛选，已应用筛选", "筛选地图"],
    ["打开事务所名录", "事务所名录"],
    ["打开名片名录", "名片名录"],
  ])(
    "opens %s and returns focus after its panel closes",
    async (entry, title) => {
      const user = userEvent.setup()
      renderPage(<Harness />)
      const more = screen.getByRole("button", { name: "更多地图工具" })
      expect(more).toHaveAccessibleDescription("已应用筛选")
      expect(screen.queryByRole("menuitem")).not.toBeInTheDocument()
      await user.click(more)
      const menu = await screen.findByRole("menu", { name: "更多地图工具内容" })
      await user.click(within(menu).getByRole("menuitem", { name: entry }))
      expect(screen.getByRole("dialog", { name: title })).toBeVisible()
      await waitFor(() =>
        expect(screen.queryByRole("menu")).not.toBeInTheDocument()
      )
      await user.click(screen.getByRole("button", { name: "关闭工具" }))
      await waitFor(() => expect(more).toHaveFocus())
      expect(more).toHaveAccessibleDescription("已应用筛选")
    }
  )

  it("supports keyboard selection and Escape without opening a tool", async () => {
    const user = userEvent.setup()
    renderPage(<Harness />)
    const more = screen.getByRole("button", { name: "更多地图工具" })
    more.focus()
    await user.keyboard("{ArrowDown}")
    const filter = await screen.findByRole("menuitem", {
      name: "打开筛选，已应用筛选",
    })
    await waitFor(() => expect(filter).toHaveFocus())
    await user.keyboard("{ArrowDown}{Enter}")
    expect(screen.getByRole("dialog", { name: "事务所名录" })).toBeVisible()
    await user.click(screen.getByRole("button", { name: "关闭工具" }))
    await waitFor(() => expect(more).toHaveFocus())
    await user.keyboard("{ArrowDown}{Escape}")
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    )
    expect(more).toHaveFocus()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
