import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  CardMediaGallery,
  CardMediaPreview,
  type MediaSlot,
} from "~/pages/account/me/namecards/card-media-gallery"

const slots: MediaSlot[] = [
  { kind: "existing", index: 0, url: "/front", direct: true },
  { kind: "existing", index: 1, url: "/back", direct: true },
]

describe("CardMediaPreview rotation", () => {
  it("keeps reviewer rotation controls enabled in read-only previews", async () => {
    const onRotate = vi.fn()
    render(<CardMediaPreview slots={slots} onRotate={onRotate} />)

    const right = screen.getByRole("button", {
      name: "向右旋转 90 度",
    })
    expect(right).toBeEnabled()
    await userEvent.click(right)
    expect(onRotate).toHaveBeenCalledWith(0, "right")
  })
})

/** 预览区里生效的旋转角度；缩略图条不在其中。 */
function previewRotationDeg(container: HTMLElement): number | null {
  const style = [...container.querySelectorAll("[data-card-artwork-preview] *")]
    .map((element) => element.getAttribute("style") ?? "")
    .find((value) => value.includes("rotate("))
  const match = style ? /rotate\((-?\d+(?:\.\d+)?)deg\)/.exec(style) : null
  return match ? Number(match[1]) : null
}

const page = (url: string): MediaSlot => ({
  kind: "existing",
  index: 0,
  url,
  direct: true,
})

function gallery(url: string, rotations: Record<number, number>) {
  return (
    <CardMediaGallery
      slots={[page(url)]}
      disabled={false}
      rotations={rotations}
      onChange={() => {}}
      onError={() => {}}
    />
  )
}

describe("CardMediaGallery artwork rotation", () => {
  it("holds the pending angle until the rewritten object is painted", () => {
    const { container, rerender } = render(gallery("/page?v=1", { 0: 1 }))
    expect(previewRotationDeg(container)).toBe(90)

    /*
      纯旋转是免审写入：保存回来的对象已经转好了，但位图要等浏览器解码。新图还没
      画上屏幕就撤角度，会先看到旧图复位、再看新图——所以旧角度要顶到它上屏为止。
    */
    rerender(gallery("/page?v=2", {}))
    expect(previewRotationDeg(container)).toBe(90)

    // 新对象画上屏幕：角度与它同一帧落下，不留过渡动画。
    fireEvent.load(
      container.querySelector(
        "[data-card-artwork-preview] img"
      ) as HTMLImageElement
    )
    expect(previewRotationDeg(container)).toBeNull()
  })
})
