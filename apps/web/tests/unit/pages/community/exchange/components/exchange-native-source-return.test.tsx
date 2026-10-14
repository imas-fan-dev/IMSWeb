import { act, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { renderPage } from "@/tests/unit/support/harness"
import type {
  NativeGlassSearchEvent,
  NativeGlassSearchSnapshot,
} from "~/lib/native-glass-search"
import { ExchangeSearchCard } from "~/pages/community/exchange/components/exchange-search-card"
import { useExchangePlaceSearch } from "~/pages/community/exchange/hooks/use-exchange-place-search"

const mocks = vi.hoisted(() => ({ bridge: vi.fn() }))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))
vi.mock("~/pages/community/exchange/hooks/use-native-exchange-search", () => ({
  useNativeExchangeSearch: mocks.bridge,
}))

function Harness() {
  const model = useExchangePlaceSearch()
  const [modalOpen, setModalOpen] = useState(false)
  return (
    <div>
      <ExchangeSearchCard
        model={model}
        selectedPlace={null}
        onSelect={() => undefined}
        onClear={() => undefined}
        pointCount={0}
        onOcclusion={() => undefined}
        modalOpen={modalOpen}
        onOpenAttribution={() => setModalOpen(true)}
        onOpenFilter={() => setModalOpen(true)}
        onOpenOffices={() => undefined}
        onOpenCards={() => undefined}
        onRefresh={() => undefined}
      />
      <button onClick={() => setModalOpen(false)}>关闭来源测试面板</button>
    </div>
  )
}

function latest() {
  return mocks.bridge.mock.calls.at(-1)! as [
    Omit<NativeGlassSearchSnapshot, "generation"> | null,
    (event: NativeGlassSearchEvent) => void,
    () => void,
  ]
}

describe("native source return intent", () => {
  it("retains More focus through quick modal closure until the returning native sync acknowledges", async () => {
    mocks.bridge.mockClear().mockReturnValue(true)
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 390, 844)
    )
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    const user = userEvent.setup()
    const view = renderPage(<Harness />)
    expect(latest()[0]).toMatchObject({
      returnFocusMore: false,
      editing: false,
    })
    act(() =>
      latest()[1]({
        id: "exchange-search",
        generation: 1,
        revision: 0,
        action: "tool",
        value: "source",
      })
    )
    expect(latest()[0]).toBeNull()
    await user.click(screen.getByRole("button", { name: "关闭来源测试面板" }))
    expect(latest()[0]).toMatchObject({
      returnFocusMore: true,
      editing: false,
      detent: "collapsed",
    })
    act(() => window.dispatchEvent(new Event("resize")))
    expect(latest()[0]?.returnFocusMore).toBe(true)
    act(() => latest()[2]())
    expect(latest()[0]?.returnFocusMore).toBe(false)
    act(() =>
      latest()[1]({
        id: "exchange-search",
        generation: 2,
        revision: 0,
        action: "tool",
        value: "filter",
      })
    )
    await user.click(screen.getByRole("button", { name: "关闭来源测试面板" }))
    expect(latest()[0]?.returnFocusMore).toBe(false)
    view.unmount()
  })
})
