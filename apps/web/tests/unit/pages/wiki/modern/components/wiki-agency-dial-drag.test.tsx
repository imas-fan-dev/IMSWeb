import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { WikiPublicAgency } from "~/lib/api"
import { WikiAgencyDial } from "~/pages/wiki/modern/components/wiki-agency-dial"

const imageTransform: WikiPublicAgency["imageTransform"] = {
  fit: "contain",
  focalX: 0.5,
  focalY: 0.5,
  zoom: 1,
  rotation: 0,
}

const agencies: WikiPublicAgency[] = [
  "765PRO",
  "346PRO",
  "315PRO",
  "283PRO",
].map((name, index) => ({
  id: index + 1,
  code: name,
  name,
  color: "#f34e6c",
  bannerTitle: name,
  iconUrl: null,
  idolCount: 1,
  entryCount: 1,
  imageTransform,
}))

const DIAL_SIZE = 320
const HUB = DIAL_SIZE / 2
const GRAB_RADIUS = 100

/**
 * Viewport point `degrees` around the hub, numbered like the ring's own angles:
 * 0 points up and positive degrees turn clockwise.
 */
function atDegrees(degrees: number, radius = GRAB_RADIUS) {
  const radians = (degrees * Math.PI) / 180
  return {
    clientX: HUB + radius * Math.sin(radians),
    clientY: HUB - radius * Math.cos(radians),
  }
}

async function openDial() {
  const user = userEvent.setup()

  render(
    <WikiAgencyDial
      agencies={agencies}
      selectedAgency="765PRO"
      visibilityClassName=""
      view="modern"
      onSelectAgency={vi.fn()}
    />
  )

  await user.click(screen.getByRole("button", { name: "打开企划拨盘" }))

  const dial = await screen.findByTestId("wiki-agency-dial")
  // jsdom lays nothing out, so the ring hub is pinned to a known box.
  dial.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: DIAL_SIZE,
      bottom: DIAL_SIZE,
      width: DIAL_SIZE,
      height: DIAL_SIZE,
      toJSON: () => ({}),
    }) as DOMRect
  return dial
}

function dialPosition(dial: HTMLElement) {
  return Number(dial.getAttribute("data-wiki-agency-dial-position"))
}

describe("WikiAgencyDial pointer rotation", () => {
  it("turns the ring clockwise when the pointer turns clockwise", async () => {
    const dial = await openDial()

    // 110 and 130 degrees sit in the lower-right stretch of the ring, where a
    // clockwise turn moves the pointer left. Mapping that by the horizontal
    // delta alone would spin the ring the other way.
    fireEvent.pointerDown(dial, {
      pointerId: 1,
      button: 0,
      ...atDegrees(110),
    })
    fireEvent.pointerMove(dial, { pointerId: 1, ...atDegrees(130) })

    // 20 degrees of pointer travel is 20/37 of a slot, clockwise travel lowers
    // the carousel position.
    await waitFor(() => expect(dialPosition(dial)).toBeLessThan(-0.4))
    expect(dialPosition(dial)).toBeGreaterThan(-0.7)
  })

  it("turns the ring from a straight vertical drag beside the hub", async () => {
    const dial = await openDial()

    fireEvent.pointerDown(dial, {
      pointerId: 1,
      button: 0,
      clientX: HUB + GRAB_RADIUS,
      clientY: HUB,
    })
    fireEvent.pointerMove(dial, {
      pointerId: 1,
      clientX: HUB + GRAB_RADIUS,
      clientY: HUB + 60,
    })

    await waitFor(() => expect(dialPosition(dial)).toBeLessThan(-0.5))
    expect(dialPosition(dial)).toBeGreaterThan(-1.1)
  })

  it("bounds a pointer turn that sweeps across the hub", async () => {
    const dial = await openDial()

    // Crossing close to the hub sweeps half a turn, so the ring is held to the
    // turn the pointer's own travel allows instead of taking the whole sweep.
    fireEvent.pointerDown(dial, {
      pointerId: 1,
      button: 0,
      clientX: HUB + 8,
      clientY: HUB + 12,
    })
    fireEvent.pointerMove(dial, {
      pointerId: 1,
      clientX: HUB + 4,
      clientY: HUB - 12,
    })

    // 24px of travel is at most 24/108.8 radians, or 0.35 of a slot.
    await waitFor(() => expect(dialPosition(dial)).toBeGreaterThan(0.3))
    expect(dialPosition(dial)).toBeLessThan(0.4)
  })
})
