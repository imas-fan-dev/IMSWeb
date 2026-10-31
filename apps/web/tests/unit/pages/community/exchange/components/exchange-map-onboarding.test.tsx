import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  isNativeTabBarInteractionBlocked,
  isNativeTabBarSuppressed,
} from "~/lib/native-tab-bar-suppression"
import {
  ExchangeMapOnboarding,
  mapGuideSteps,
} from "~/pages/community/exchange/components/exchange-map-onboarding"

vi.mock("~/pages/community/exchange/hooks/use-map-guide-layout", () => ({
  useMapGuideLayout: () => null,
}))

describe("exchange map guide navigation", () => {
  it("keeps navigation visible throughout all six guide steps", () => {
    const onStep = vi.fn()
    const onFinish = vi.fn()
    const view = render(
      <ExchangeMapOnboarding step={0} onStep={onStep} onFinish={onFinish} />
    )

    for (let step = 0; step < mapGuideSteps.length; step++) {
      view.rerender(
        <ExchangeMapOnboarding
          step={step}
          onStep={onStep}
          onFinish={onFinish}
        />
      )
      expect(screen.getByRole("dialog")).toHaveAccessibleName(
        mapGuideSteps[step].title
      )
      expect(isNativeTabBarSuppressed()).toBe(false)
      expect(isNativeTabBarInteractionBlocked()).toBe(true)
    }
  })

  it("keeps the guide modal and releases navigation after an explicit exit", async () => {
    const onFinish = vi.fn()
    const view = render(
      <ExchangeMapOnboarding step={0} onStep={vi.fn()} onFinish={onFinish} />
    )
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(onFinish).not.toHaveBeenCalled()
    expect(isNativeTabBarInteractionBlocked()).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "跳过" }))
    expect(onFinish).toHaveBeenCalledOnce()
    view.rerender(
      <ExchangeMapOnboarding step={null} onStep={vi.fn()} onFinish={onFinish} />
    )
    await waitFor(() => expect(isNativeTabBarInteractionBlocked()).toBe(false))
  })
})
