import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { NamecardThumbnail } from "~/pages/community/components/namecard-thumbnail"

const sources = { thumbnail: "/front-thumbnail.jpg", original: "/front.jpg" }

function ThumbnailHarness(props: typeof sources) {
  return (
    <button
      type="button"
      aria-label="查看名片正面"
      className="relative aspect-3/2"
    >
      <NamecardThumbnail
        key={`${props.thumbnail}:${props.original}`}
        {...props}
      />
    </button>
  )
}

function image() {
  return screen.getByRole("presentation", { hidden: true })
}

describe("NamecardThumbnail", () => {
  it("keeps the image contained in its stage while loading and after success", () => {
    render(<ThumbnailHarness {...sources} />)

    const stage = screen.getByRole("button", { name: "查看名片正面" })
    expect(stage).toHaveClass("relative", "aspect-3/2")
    expect(screen.getByRole("status")).toHaveTextContent("正在载入图片")
    expect(image()).toHaveAttribute("src", sources.thumbnail)
    expect(image()).toHaveAttribute("loading", "lazy")
    expect(image()).toHaveClass("absolute", "size-full", "object-contain")

    fireEvent.load(image())

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(image()).toHaveClass("object-contain")
    expect(stage).toHaveClass("aspect-3/2")
  })

  it("tries the original once after a thumbnail error and accepts a successful load", () => {
    render(<ThumbnailHarness {...sources} />)
    const thumbnail = image()

    fireEvent.error(thumbnail)

    expect(image()).not.toBe(thumbnail)
    expect(image()).toHaveAttribute("src", sources.original)
    expect(screen.getByRole("status")).toBeVisible()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()

    fireEvent.load(image())

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(image()).toHaveAttribute("src", sources.original)
    expect(image()).not.toHaveClass("invisible")
  })

  it("stops on an original-image error without remounting or retrying the image", () => {
    render(<ThumbnailHarness {...sources} />)
    fireEvent.error(image())
    const original = image()

    fireEvent.error(original)

    expect(screen.getByRole("alert")).toHaveTextContent("图片暂时无法显示")
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(original).toHaveClass("invisible")
    expect(screen.getByRole("button")).toHaveClass("aspect-3/2")

    fireEvent.error(original)
    fireEvent.error(original)

    expect(image()).toBe(original)
    expect(image()).toHaveAttribute("src", sources.original)
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("fails immediately when the thumbnail already uses the original URL", () => {
    render(
      <ThumbnailHarness
        thumbnail={sources.original}
        original={sources.original}
      />
    )
    const original = image()

    fireEvent.error(original)

    expect(screen.getByRole("alert")).toBeVisible()
    expect(image()).toBe(original)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("clears a failed resource when the owning item changes its image identity", () => {
    const { rerender } = render(<ThumbnailHarness {...sources} />)
    fireEvent.error(image())
    fireEvent.error(image())
    expect(screen.getByRole("alert")).toBeVisible()

    rerender(
      <ThumbnailHarness
        thumbnail="/replacement-thumbnail.jpg"
        original="/replacement.jpg"
      />
    )

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toBeVisible()
    expect(image()).toHaveAttribute("src", "/replacement-thumbnail.jpg")
    expect(image()).not.toHaveClass("invisible")
  })
})
