import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { makeFudabaOwnerCard } from "@/mocks/data/fudaba"
import type { FudabaOwnerCard } from "~/lib/api"
import {
  GHOST_ENTER_CLASS_NAME,
  ghostEnterDelayMs,
} from "~/pages/account/me/namecards/card-grid-animation"
import {
  CardDragGhostSlots,
  CardDragGhostStack,
} from "~/pages/account/me/namecards/components/card-drag-ghost"

function card(cardNumber: number): FudabaOwnerCard {
  return makeFudabaOwnerCard({
    id: `card-${cardNumber}`,
    cardNumber,
    producerName: `名片 ${cardNumber}`,
  })
}

/**
 * `useMediaQuery` 会订阅 `change`，所以桩得带上事件的增删监听；
 * jsdom 本身没有 `matchMedia`（`unstubGlobals` 会在每条用例后自动收回）。
 */
function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduced : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }))
  )
}

function ghostNodes(): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '[data-testid="card-drag-ghost"]'
    ),
  ]
}

describe("card drag ghost animation", () => {
  it("fades the collection ghost in", () => {
    render(<CardDragGhostStack cards={[card(1), card(2)]} />)

    const [ghost] = ghostNodes()
    expect(ghost?.dataset.variant).toBe("stack")
    expect(ghost?.classList.contains(GHOST_ENTER_CLASS_NAME)).toBe(true)
    // 合集是一摞，没有错峰可言。
    expect(ghost?.style.animationDelay).toBe("")
  })

  it("staggers the expanded slots and stops at the stagger cap", () => {
    render(
      <CardDragGhostSlots
        cards={Array.from({ length: 8 }, (_, index) => card(index + 1))}
      />
    )

    const ghosts = ghostNodes()
    expect(ghosts).toHaveLength(8)
    ghosts.forEach((ghost, index) => {
      expect(ghost.dataset.variant).toBe("slots")
      expect(ghost.classList.contains(GHOST_ENTER_CLASS_NAME)).toBe(true)
      expect(ghost.style.animationDelay).toBe(`${ghostEnterDelayMs(index)}ms`)
    })
    // 20 张也只错 6 档：第 7 个格子与最后一档同延迟。
    expect(ghosts[7]?.style.animationDelay).toBe(ghosts[5]?.style.animationDelay)
  })

  it("switches instantly under prefers-reduced-motion: reduce", () => {
    stubReducedMotion(true)
    render(
      <>
        <CardDragGhostStack cards={[card(1), card(2)]} />
        <CardDragGhostSlots cards={[card(3), card(4)]} />
      </>
    )

    const ghosts = ghostNodes()
    expect(ghosts).toHaveLength(3)
    for (const ghost of ghosts) {
      expect(ghost.classList.contains(GHOST_ENTER_CLASS_NAME)).toBe(false)
      expect(ghost.style.animationDelay).toBe("")
    }
  })

  it("still renders the ghost content without motion", () => {
    stubReducedMotion(true)
    render(<CardDragGhostSlots cards={[card(1), card(2)]} />)

    expect(screen.getAllByText("名片 1").length).toBeGreaterThan(0)
    expect(screen.getAllByText("名片 2").length).toBeGreaterThan(0)
  })
})
