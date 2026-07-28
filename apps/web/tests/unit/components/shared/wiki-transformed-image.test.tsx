import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"

describe("WikiTransformedImage", () => {
  it("switches the source and composition together only once", () => {
    const onError = vi.fn()
    render(
      <WikiTransformedImage
        src="/story-card.webp"
        alt="剧情卡片"
        transform={{
          fit: "cover",
          focalX: 0.2,
          focalY: 0.3,
          zoom: 1.8,
          rotation: 90,
        }}
        fallbackSrc="/idol-avatar.webp"
        fallbackTransform={{
          fit: "contain",
          focalX: 0.5,
          focalY: 0.5,
          zoom: 1,
          rotation: 0,
        }}
        onError={onError}
      />
    )

    const image = screen.getByRole("img", { name: "剧情卡片" })
    expect(image).toHaveAttribute("src", "/story-card.webp")
    expect(image).toHaveStyle({
      objectFit: "cover",
      objectPosition: "20% 30%",
      transform: "rotate(90deg) scale(1.8)",
    })

    fireEvent.error(image)
    expect(image).toHaveAttribute("src", "/idol-avatar.webp")
    expect(image).toHaveStyle({
      objectFit: "contain",
      objectPosition: "50% 50%",
      transform: "rotate(0deg) scale(1)",
    })

    fireEvent.error(image)
    expect(image).toHaveAttribute("src", "/idol-avatar.webp")
    expect(onError).toHaveBeenCalledTimes(2)
  })

  it("resets fallback state when the requested image changes", () => {
    const { rerender } = render(
      <WikiTransformedImage
        src="/first.webp"
        fallbackSrc="/first-fallback.webp"
        alt="可切换图片"
      />
    )
    const image = screen.getByRole("img", { name: "可切换图片" })
    fireEvent.error(image)
    expect(image).toHaveAttribute("src", "/first-fallback.webp")

    rerender(
      <WikiTransformedImage
        src="/second.webp"
        fallbackSrc="/second-fallback.webp"
        alt="可切换图片"
      />
    )
    expect(screen.getByRole("img", { name: "可切换图片" })).toHaveAttribute(
      "src",
      "/second.webp"
    )
  })
})
